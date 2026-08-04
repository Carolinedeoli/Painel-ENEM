import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

/* =========================================================================
   ESTADO GLOBAL DO DUCKDB
========================================================================= */
let db = null;
let conn = null;

const ANOS_DISPONIVEIS = ["2019", "2020", "2021", "2022", "2023"];

const LABELS_SEXO = { "M": "Masculino", "F": "Feminino" };
const LABELS_COR_RACA = { "0": "Não Informado", "1": "Branca", "2": "Preta", "3": "Parda", "4": "Amarela", "5": "Indígena", "6": "Não Informado" };
const LABELS_ESCOLA = { "1": "Não Informado", "2": "Pública", "3": "Privada" };
const LABELS_DEP_ADM = { "1": "Federal", "2": "Estadual", "3": "Municipal", "4": "Privada" };
const LABELS_INTERNET = { "A": "Não possui Internet", "B": "Possui Internet" };
const LABELS_TREINEIRO = { "0": "Não", "1": "Sim" };
const LABELS_CONCLUSAO = { "1": "Já concluiu o Ensino Médio", "2": "Concluirá o Ensino Médio nesse ano", "3": "Concluirá após este ano", "4": "Não concluiu/não cursa" };
const LABELS_ESCOLARIDADE_MAE = { "A": "Nunca estudou", "B": "Não completou EF (até 5º ano)", "C": "Não completou EF (até 9º ano)", "D": "EF completo", "E": "Médio completo", "F": "Superior completo", "G": "Pós-graduação", "H": "Não sabe" };
const LABELS_RENDA = { "A": "Sem renda", "B": "Até 1 SM", "C": " De 1 a 1.5 SM", "D": "De 1.5 a 2 SM", "E": "De 2 a 2.5 SM", "F": "De 2.5 a 3 SM", "G": "De 3 a 4 SM", "H": "De 4 a 5 SM", "I": "De 5 a 6 SM", "J": "De 6 a 7 SM", "K": "De 7 a 8 SM", "L": "De 8 a 9 SM", "M": "De 9 a 10 SM", "N": "De 10 a 12 SM", "O": "De 12 a 15 SM", "P": "De 15 a 20 SM", "Q": "Acima de 20 SM" };
const LABELS_FAIXA_ETARIA = { "1": "Menor de 17", "2": "17 anos", "3": "18 anos", "4": "19 anos", "5": "20 anos", "6": "21 anos", "7": "22 anos", "8": "23 anos", "9": "24 anos", "10": "25 anos", "11": "26 a 30", "12": "31 a 35", "13": "36 a 40", "14": "41 a 45", "15": "46 a 50", "16": "51 a 55", "17": "56 a 60", "18": "61 a 65", "19": "66 a 70", "20": "Maior de 70" };
const LABELS_ESTADO_CIVIL = { "0": "Não Informado", "1": "Solteiro(a)", "2": "Casado(a)", "3": "Divorciado(a)", "4": "Viúvo(a)" };

// Colunas das 5 áreas + redação
const COLUNAS_AREAS = [
    { col: "NU_NOTA_CN", nome: "Ciências da Natureza" },
    { col: "NU_NOTA_CH", nome: "Ciências Humanas" },
    { col: "NU_NOTA_LC", nome: "Linguagens e Códigos" },
    { col: "NU_NOTA_MT", nome: "Matemática" },
    { col: "NU_NOTA_REDACAO", nome: "Redação" }
];

// Condição de proficiência: >=450 em cada área e >=500 na redação, simultaneamente
const EXPR_PROFICIENTE = "(NU_NOTA_CN >= 450 AND NU_NOTA_CH >= 450 AND NU_NOTA_LC >= 450 AND NU_NOTA_MT >= 450 AND NU_NOTA_REDACAO >= 500)";

/* =========================================================================
   1. INICIALIZAÇÃO
========================================================================= */
async function iniciarDesempenho() {
    try {
        console.log("Inicializando DuckDB WASM (Desempenho)...");
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        const workerCode = `importScripts("${bundle.mainWorker}");`;
        const blob = new Blob([workerCode], { type: "text/javascript" });
        const workerUrl = URL.createObjectURL(blob);

        const worker = new Worker(workerUrl);
        db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadModule);
        URL.revokeObjectURL(workerUrl);

        conn = await db.connect();

        let pathname = window.location.pathname;
        if (pathname.includes('index.html')) {
            pathname = pathname.replace('index.html', '');
        }
        if (!pathname.endsWith('/')) {
            pathname += '/';
        }
        const urlBaseDoSite = window.location.origin + pathname;

        // Registra os arquivos .parquet diretamente em sequência
        await db.registerFileURL('ENEM_2019.parquet', `${urlBaseDoSite}dados/ENEM_2019.parquet`, duckdb.DuckDBDataProtocol.HTTP, false);
        await db.registerFileURL('ENEM_2020.parquet', `${urlBaseDoSite}dados/ENEM_2020.parquet`, duckdb.DuckDBDataProtocol.HTTP, false);
        await db.registerFileURL('ENEM_2021.parquet', `${urlBaseDoSite}dados/ENEM_2021.parquet`, duckdb.DuckDBDataProtocol.HTTP, false);
        await db.registerFileURL('ENEM_2022.parquet', `${urlBaseDoSite}dados/ENEM_2022.parquet`, duckdb.DuckDBDataProtocol.HTTP, false);
        await db.registerFileURL('ENEM_2023.parquet', `${urlBaseDoSite}dados/ENEM_2023.parquet`, duckdb.DuckDBDataProtocol.HTTP, false);

        preencherSelectAnoRealDesempenho();
        await carregarEstruturaFiltrosComponentes("2023");
        configurarEventosMudanca();

        await filtrarEAtualizarPainelDesempenho();
    } catch (erro) {
        console.error("Erro crítico ao inicializar o motor DuckDB (Desempenho):", erro);
    }
}

/* =========================================================================
   2. FILTROS DINÂMICOS
========================================================================= */
function preencherSelectAnoRealDesempenho() {
    const selectAno = document.getElementById("filtroAnoDesempenho");
    if (selectAno && selectAno.options.length === 0) {
        selectAno.innerHTML = `
            <option value="2019">2019</option>
            <option value="2020">2020</option>
            <option value="2021">2021</option>
            <option value="2022">2022</option>
            <option value="2023" selected>2023</option>
        `;
    }
}

async function carregarEstruturaFiltrosComponentes(ano = "2023") {
    const tabelaAlvo = `ENEM_${ano}.parquet`;
    const queries = [
        { id: "filtroUFDesempenho", col: "estado_prova", labelMap: null },
        { id: "filtroSexoDesempenho", col: "TP_SEXO", labelMap: LABELS_SEXO },
        { id: "filtroRacaDesempenho", col: "TP_COR_RACA", labelMap: LABELS_COR_RACA },
        { id: "filtroFaixaDesempenho", col: "TP_FAIXA_ETARIA", labelMap: LABELS_FAIXA_ETARIA },
        { id: "filtroConclusaoDesempenho", col: "TP_ST_CONCLUSAO", labelMap: LABELS_CONCLUSAO },
        { id: "filtroEscolaDesempenho", col: "tipo_escola", labelMap: LABELS_ESCOLA },
        { id: "filtroDepAdmDesempenho", col: "dep_adm", labelMap: LABELS_DEP_ADM },
        { id: "filtroTreineiroDesempenho", col: "IN_TREINEIRO", labelMap: LABELS_TREINEIRO },
        { id: "filtroMaeDesempenho", col: "escolaridade_mae", labelMap: LABELS_ESCOLARIDADE_MAE },
        { id: "filtroRendaDesempenho", col: "renda_familiar", labelMap: LABELS_RENDA },
        { id: "filtroInternetDesempenho", col: "internet", labelMap: LABELS_INTERNET },
        { id: "filtroEstadocivilDesempenho", col: "TP_ESTADO_CIVIL", labelMap: LABELS_ESTADO_CIVIL },
    ];

    for (let q of queries) {
        const container = document.getElementById(q.id);
        if (!container) continue;

        const resultado = await conn.query(`SELECT DISTINCT ${q.col} FROM '${tabelaAlvo}' WHERE ${q.col} IS NOT NULL ORDER BY ${q.col}`);
        const linhas = resultado.toArray().map(r => r.toJSON());

        container.innerHTML = "";
        linhas.forEach(l => {
            const valorBruto = l[q.col];
            const nomeExibicao = q.labelMap ? (q.labelMap[valorBruto] || `Código ${valorBruto}`) : valorBruto;

            let label = document.createElement("label");
            label.className = "filtro-checkbox-label";

            let checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = valorBruto;
            checkbox.setAttribute("data-coluna", q.col);

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(" " + nomeExibicao));
            container.appendChild(label);
        });
    }
}

function configurarEventosMudanca() {
    document.getElementById("filtroAnoDesempenho")?.addEventListener("change", async (e) => {
        await carregarEstruturaFiltrosComponentes(e.target.value);
        filtrarEAtualizarPainelDesempenho();
    });
    
    document.getElementById("filtroAreaDesempenho")?.addEventListener("change", filtrarEAtualizarPainelDesempenho);

    const menuFiltros = document.getElementById("menuFiltrosDesempenho");
    menuFiltros?.addEventListener("change", (e) => {
        if (e.target && e.target.type === "checkbox") {
            filtrarEAtualizarPainelDesempenho();
        }
    });
}

/* =========================================================================
   3. MONTAGEM DO WHERE A PARTIR DOS FILTROS MARCADOS
========================================================================= */
function montarSqlWhere() {
    const marcados = Array.from(document.querySelectorAll('#menuFiltrosDesempenho input[type="checkbox"]:checked'));
    const filtrosAtivos = {};

    marcados.forEach(cb => {
        const col = cb.getAttribute("data-coluna");
        if (!filtrosAtivos[col]) filtrosAtivos[col] = [];

        const valor = cb.value;
        if (!isNaN(valor) && valor.trim() !== "") {
            filtrosAtivos[col].push(Number(valor));
        } else {
            filtrosAtivos[col].push(`'${valor}'`);
        }
    });

    let sqlWhere = "WHERE 1=1";
    for (let col in filtrosAtivos) {
        sqlWhere += ` AND ${col} IN (${filtrosAtivos[col].join(',')})`;
    }
    return sqlWhere;
}

/* =========================================================================
   4. PROCESSAMENTO SQL (CONSULTAS)
========================================================================= */
async function filtrarEAtualizarPainelDesempenho() {
    const selectAno = document.getElementById("filtroAnoDesempenho");
    const ano = selectAno ? selectAno.value : "2023";
    const tabelaAlvo = `ENEM_${ano}.parquet`;

    const sqlWhere = montarSqlWhere();
    
    // --- LÓGICA DINÂMICA DA ÁREA DE CONHECIMENTO ---
    const selectArea = document.getElementById("filtroAreaDesempenho");
    const areaSelecionada = selectArea ? selectArea.value : "GERAL";
    
    let exprDesempenho = "";
    let sqlWhereComNotas = "";

    if (areaSelecionada === "GERAL") {
        exprDesempenho = "((NU_NOTA_CN + NU_NOTA_CH + NU_NOTA_LC + NU_NOTA_MT + NU_NOTA_REDACAO) / 5.0)";
        sqlWhereComNotas = `${sqlWhere} AND NU_NOTA_CN IS NOT NULL AND NU_NOTA_CH IS NOT NULL AND NU_NOTA_LC IS NOT NULL AND NU_NOTA_MT IS NOT NULL AND NU_NOTA_REDACAO IS NOT NULL`;
    } else {
        exprDesempenho = areaSelecionada;
        sqlWhereComNotas = `${sqlWhere} AND ${areaSelecionada} IS NOT NULL`;
    }

    // --- QUERY 1: CARDS + TABELA DE MÉDIAS ---
    const qResumo = await conn.query(`
        SELECT
            CAST(COUNT(*) AS INTEGER) as total,
            CAST(SUM(CASE WHEN NU_NOTA_REDACAO = 1000 THEN 1 ELSE 0 END) AS INTEGER) as redacoes_1000,
            CAST(SUM(CASE WHEN ${EXPR_PROFICIENTE} THEN 1 ELSE 0 END) AS INTEGER) as proficientes,
            AVG(NU_NOTA_CN) as media_cn,
            AVG(NU_NOTA_CH) as media_ch,
            AVG(NU_NOTA_LC) as media_lc,
            AVG(NU_NOTA_MT) as media_mt,
            AVG(NU_NOTA_REDACAO) as media_redacao
        FROM '${tabelaAlvo}' ${sqlWhereComNotas}
    `);
    const dadosResumo = qResumo.toArray().map(r => r.toJSON())[0];

    // --- QUERY 2: REDAÇÕES NOTA 1000 POR ESTADO ---
    const qEstados = await conn.query(`
        SELECT estado_prova, CAST(COUNT(*) AS INTEGER) as qtd
        FROM '${tabelaAlvo}' ${sqlWhere} AND NU_NOTA_REDACAO = 1000
        GROUP BY estado_prova
        ORDER BY qtd DESC
    `);
    const dadosEstados = qEstados.toArray().map(r => r.toJSON());

    // --- QUERY 3: CURVA DE DENSIDADE DO DESEMPENHO ---
    const qDensidade = await conn.query(`
        SELECT CAST(FLOOR(${exprDesempenho} / 25) * 25 AS INTEGER) as bin, CAST(COUNT(*) AS INTEGER) as qtd
        FROM '${tabelaAlvo}' ${sqlWhereComNotas}
        GROUP BY bin
        ORDER BY bin
    `);
    const dadosDensidade = qDensidade.toArray().map(r => r.toJSON());

    // --- QUERY 4: DENSIDADE DO DESEMPENHO POR DEPENDÊNCIA ADMINISTRATIVA ---
    const qDensidadeDepAdm = await conn.query(`
        SELECT CAST(FLOOR(${exprDesempenho} / 25) * 25 AS INTEGER) as bin, dep_adm, CAST(COUNT(*) AS INTEGER) as qtd
        FROM '${tabelaAlvo}' ${sqlWhereComNotas} AND dep_adm IS NOT NULL
        GROUP BY bin, dep_adm
        ORDER BY bin
    `);
    const dadosDensidadeDepAdm = qDensidadeDepAdm.toArray().map(r => r.toJSON());

    // --- QUERY 5: NOTA MÉDIA POR ÁREA E ANO ---
    const dadosPorAno = [];
    for (const anoLoop of ANOS_DISPONIVEIS) {
        const tabelaAno = `ENEM_${anoLoop}.parquet`;
        try {
            const qAno = await conn.query(`
                SELECT
                    AVG(NU_NOTA_CN) as media_cn,
                    AVG(NU_NOTA_CH) as media_ch,
                    AVG(NU_NOTA_LC) as media_lc,
                    AVG(NU_NOTA_MT) as media_mt,
                    AVG(NU_NOTA_REDACAO) as media_redacao
                FROM '${tabelaAno}' ${sqlWhereComNotas}
            `);
            const linha = qAno.toArray().map(r => r.toJSON())[0];
            dadosPorAno.push({ ano: anoLoop, ...linha });
        } catch (e) {
            console.warn(`Não foi possível consultar o ano ${anoLoop}:`, e);
        }
    }

    // --- QUERY 6: CONCLUSÃO DO ENSINO MÉDIO x PROFICIÊNCIA ---
    let dadosConclusao = [];
    try {
        const qConclusao = await conn.query(`
            SELECT
                TP_ANO_CONCLUIU as ano_conclusao,
                CAST(COUNT(*) AS INTEGER) as total,
                CAST(SUM(CASE WHEN ${EXPR_PROFICIENTE} THEN 1 ELSE 0 END) AS INTEGER) as proficientes
            FROM '${tabelaAlvo}' ${sqlWhereComNotas} AND TP_ST_CONCLUSAO = 1 AND TP_ANO_CONCLUIU IS NOT NULL
            GROUP BY TP_ANO_CONCLUIU
            ORDER BY TP_ANO_CONCLUIU DESC
        `);
        dadosConclusao = qConclusao.toArray().map(r => r.toJSON());
    } catch (e) {
        console.warn("Coluna TP_ANO_CONCLUIU não encontrada na base:", e);
    }

    renderizarCardsDesempenho(dadosResumo);
    renderizarTabelaMediaAreas(dadosResumo);
    renderizarTabelaEstados(dadosEstados);
    renderizarTabelaConclusao(dadosConclusao, ano);
    renderizarGraficoDensidade(dadosDensidade);
    renderizarGraficoDensidadeDepAdm(dadosDensidadeDepAdm);
    renderizarGraficoNotaPorAno(dadosPorAno);
}

/* =========================================================================
   5. CARDS
========================================================================= */
function renderizarCardsDesempenho(dados) {
    if (!dados) return;
    const total = Number(dados.total || 0);
    const redacoes1000 = Number(dados.redacoes_1000 || 0);
    const proficientes = Number(dados.proficientes || 0);
    const percProficiencia = total > 0 ? ((proficientes / total) * 100).toFixed(1) : "0.0";

    document.getElementById("cardRedacoes1000Desempenho").innerText = redacoes1000.toLocaleString("pt-BR");
    document.getElementById("cardProficienciaDesempenho").innerText = `${percProficiencia}%`;
}

/* =========================================================================
   6. TABELAS
========================================================================= */
function renderizarTabelaMediaAreas(dados) {
    const container = document.getElementById("tabelaMediaAreasDesempenho");
    if (!container || !dados) return;

    const valores = [
        { nome: "Ciências<br>Natureza", valor: dados.media_cn },
        { nome: "Ciências<br>Humanas", valor: dados.media_ch },
        { nome: "Linguagens<br>e Códigos", valor: dados.media_lc },
        { nome: "Matemática", valor: dados.media_mt },
        { nome: "Redação", valor: dados.media_redacao }
    ];

    let html = "<table><thead><tr>";
    valores.forEach(v => html += `<th>${v.nome}</th>`);
    html += "</tr></thead><tbody><tr>";
    valores.forEach(v => html += `<td>${v.valor ? Number(v.valor).toFixed(1) : "-"}</td>`);
    html += "</tr></tbody></table>";

    container.innerHTML = html;
}

function renderizarTabelaEstados(dados) {
    const tbody = document.querySelector("#tabelaEstadosRedacoes1000Desempenho tbody");
    if (!tbody) return;

    if (!dados || dados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">Sem dados disponíveis.</td></tr>`;
        return;
    }

    let html = "";
    for (let i = 0; i < dados.length; i += 3) {
        html += "<tr>";
        
        if (dados[i]) {
            const uf1 = dados[i].estado_prova || dados[i].UF || "-";
            const qtd1 = Number(dados[i].qtd || dados[i].total || dados[i].quantidade || 0);
            html += `<td><strong>${uf1}</strong></td><td>${qtd1.toLocaleString("pt-BR")}</td>`;
        } else {
            html += `<td></td><td></td>`;
        }

        if (dados[i + 1]) {
            const uf2 = dados[i + 1].estado_prova || dados[i + 1].UF || "-";
            const qtd2 = Number(dados[i + 1].qtd || dados[i + 1].total || dados[i + 1].quantidade || 0);
            html += `<td><strong>${uf2}</strong></td><td>${qtd2.toLocaleString("pt-BR")}</td>`;
        } else {
            html += `<td></td><td></td>`;
        }

        if (dados[i + 2]) {
            const uf3 = dados[i + 2].estado_prova || dados[i + 2].UF || "-";
            const qtd3 = Number(dados[i + 2].qtd || dados[i + 2].total || dados[i + 2].quantidade || 0);
            html += `<td><strong>${uf3}</strong></td><td>${qtd3.toLocaleString("pt-BR")}</td>`;
        } else {
            html += `<td></td><td></td>`;
        }

        html += "</tr>";
    }

    tbody.innerHTML = html;
}

function renderizarTabelaConclusao(dados, anoSelecionado) {
    const tbody = document.querySelector("#tabelaConclusaoProficienciaDesempenho tbody");
    if (!tbody) return;

    if (!dados || dados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3">Sem dados disponíveis.</td></tr>`;
        return;
    }

    const anoBase = Number(anoSelecionado);
    let html = "";
    dados.forEach(l => {
        const codigo = Number(l.ano_conclusao);
        let textoAno = "";

        if (codigo === 0) {
            textoAno = "Não Informado";
        } else if (codigo === 17) {
            textoAno = `Antes de ${anoBase - 16}`;
        } else {
            textoAno = String(anoBase - codigo);
        }

        const total = Number(l.total);
        const proficientes = Number(l.proficientes);
        const perc = total > 0 ? ((proficientes / total) * 100).toFixed(1) : "0.0";
        
        html += `<tr><td>${textoAno}</td><td>${total.toLocaleString("pt-BR")}</td><td>${perc}%</td></tr>`;
    });
    
    tbody.innerHTML = html;
}

/* =========================================================================
   7. GRÁFICOS
========================================================================= */
function renderizarGraficoDensidade(dados) {
    const container = document.getElementById("graficoDensidadeDesempenho");
    if (!container) return;

    const total = dados.reduce((s, l) => s + Number(l.qtd), 0);
    const trace = [{
        x: dados.map(l => Number(l.bin)),
        y: dados.map(l => total > 0 ? Number(l.qtd) / total : 0),
        type: 'scatter',
        mode: 'lines',
        line: { shape: 'spline', color: '#002d62', width: 2 },
        fill: 'tozeroy',
        fillcolor: 'rgba(0,45,98,0.15)'
    }];

    Plotly.newPlot('graficoDensidadeDesempenho', trace, {
        autosize: true,
        margin: { t: 10, b: 45, l: 45, r: 15 },
        xaxis: { title: 'Nota (Desempenho)', automargin: true },
        yaxis: { title: 'Densidade', automargin: true }
    }, { responsive: true });
}

function renderizarGraficoDensidadeDepAdm(dados) {
    const container = document.getElementById("graficoDensidadeDepAdmDesempenho");
    if (!container) return;

    const cores = { "1": "#2ecc71", "2": "#f39c12", "3": "#e74c3c", "4": "#3498db" };
    const grupos = {};

    dados.forEach(l => {
        const dep = String(l.dep_adm);
        if (!grupos[dep]) grupos[dep] = [];
        grupos[dep].push(l);
    });

    const traces = Object.keys(grupos).map(dep => {
        const linhas = grupos[dep];
        const total = linhas.reduce((s, l) => s + Number(l.qtd), 0);
        return {
            x: linhas.map(l => Number(l.bin)),
            y: linhas.map(l => total > 0 ? Number(l.qtd) / total : 0),
            type: 'scatter',
            mode: 'lines',
            name: LABELS_DEP_ADM[dep] || `Código ${dep}`,
            line: { shape: 'spline', color: cores[dep] || '#999', width: 2 }
        };
    });

    Plotly.newPlot('graficoDensidadeDepAdmDesempenho', traces, {
        autosize: true,
        margin: { t: 10, b: 45, l: 45, r: 15 },
        xaxis: { title: 'Nota (Desempenho)', automargin: true },
        yaxis: { title: 'Densidade', automargin: true }
    }, { responsive: true });
}

function renderizarGraficoNotaPorAno(dados) {
    const container = document.getElementById("graficoNotaMediaAnoDesempenho");
    if (!container) return;

    const series = [
        { chave: "media_cn", nome: "Ciências da Natureza", cor: "#2ecc71" },
        { chave: "media_ch", nome: "Ciências Humanas", cor: "#f39c12" },
        { chave: "media_lc", nome: "Linguagens e Códigos", cor: "#9b59b6" },
        { chave: "media_mt", nome: "Matemática", cor: "#3498db" },
        { chave: "media_redacao", nome: "Redação", cor: "#e74c3c" }
    ];

    const traces = series.map(s => ({
        x: dados.map(d => d.ano),
        y: dados.map(d => d[s.chave] !== undefined && d[s.chave] !== null ? Number(d[s.chave]) : null),
        type: 'scatter',
        mode: 'lines+markers',
        name: s.nome,
        line: { color: s.cor, width: 2 }
    }));

    Plotly.newPlot('graficoNotaMediaAnoDesempenho', traces, {
        autosize: true,
        hovermode: 'x',
        margin: { t: 10, b: 30, l: 45, r: 15 },
        xaxis: { title: 'Ano', automargin: true },
        yaxis: { title: 'Nota Média', automargin: true, tickformat: '.1f' },
        legend: { orientation: 'v' }
    }, { responsive: true });
}

/* =========================================================================
   8. AÇÕES DE INTERFACE (FILTROS)
========================================================================= */
window.toggleFiltrosDesempenho = function () {
    const menu = document.getElementById("menuFiltrosDesempenho");
    if (menu) menu.style.display = (menu.style.display === "none" || menu.style.display === "") ? "block" : "none";
};

window.limparFiltrosDesempenho = async function () {
    const selectAno = document.getElementById("filtroAnoDesempenho");
    if (selectAno) selectAno.value = "2023";

    const containerFiltros = document.querySelector(".filtros-card-desempenho") || document.getElementById("menuFiltrosDesempenho");
    if (containerFiltros) {
        containerFiltros.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    }

    await carregarEstruturaFiltrosComponentes("2023");
    filtrarEAtualizarPainelDesempenho();
};

document.addEventListener("DOMContentLoaded", () => {
    iniciarDesempenho();
});