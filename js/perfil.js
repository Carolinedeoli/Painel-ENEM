import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

import { renderizarTabelasInterface } from './perfilTabelas.js';
import { renderizarGraficosInterface } from './perfilGraficos.js';

/* =========================================================================
   ESTADO GLOBAL DO DUCKDB
========================================================================= */
let db = null;
let conn = null;

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

/* =========================================================================
   1. INICIALIZAÇÃO
========================================================================= */
async function iniciarPerfil() {
    try {
        console.log("Inicializando DuckDB WASM...");
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
        
        // 🌟 CORREÇÃO PARA A NUVEM: Descobre o caminho exato da pasta atual
        // Isso garante que funcione tanto no seu computador quanto no GitHub Pages
        const urlBaseDoSite = window.location.origin + window.location.pathname;

        // Registra os arquivos Parquet com o caminho adaptável corrigido
        await db.registerFileURL('ENEM_2019.parquet', `${urlBaseDoSite}dados/ENEM_2019.txt`, duckdb.DuckDBDataProtocol.HTTP, false);
        await db.registerFileURL('ENEM_2020.parquet', `${urlBaseDoSite}dados/ENEM_2020.txt`, duckdb.DuckDBDataProtocol.HTTP, false);        
        await db.registerFileURL('ENEM_2021.parquet', `${urlBaseDoSite}dados/ENEM_2021.txt`, duckdb.DuckDBDataProtocol.HTTP, false);
        await db.registerFileURL('ENEM_2022.parquet', `${urlBaseDoSite}dados/ENEM_2022.txt`, duckdb.DuckDBDataProtocol.HTTP, false);
        await db.registerFileURL('ENEM_2023.parquet', `${urlBaseDoSite}dados/ENEM_2023.txt`, duckdb.DuckDBDataProtocol.HTTP, false);
        preencherSelectAnoRealPerfil();
        
        
        await carregarEstruturaFiltrosComponentes("2023");
        configurarEventosMudanca();
        
        await filtrarEAtualizarPainelPerfil();
    } catch (erro) {
        console.error("Erro crítico ao inicializar o motor DuckDB:", erro);
    }
}

/* =========================================================================
   2. FILTROS DINÂMICOS
========================================================================= */
function preencherSelectAnoRealPerfil() {
    const selectAno = document.getElementById("filtroAnoPerfil");
    if (selectAno && selectAno.options.length === 0) {
        // Adicionadas as opções para os anos de 2019, 2020 e 2021
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
        { id: "filtroUFPerfil", col: "estado_prova", labelMap: null },
        { id: "filtroSexoPerfil", col: "TP_SEXO", labelMap: LABELS_SEXO },
        { id: "filtroRacaPerfil", col: "TP_COR_RACA", labelMap: LABELS_COR_RACA },
        { id: "filtroFaixaPerfil", col: "TP_FAIXA_ETARIA", labelMap: LABELS_FAIXA_ETARIA },
        { id: "filtroConclusaoPerfil", col: "TP_ST_CONCLUSAO", labelMap: LABELS_CONCLUSAO },
        { id: "filtroEscolaPerfil", col: "tipo_escola", labelMap: LABELS_ESCOLA },
        { id: "filtroDepAdmPerfil", col: "dep_adm", labelMap: LABELS_DEP_ADM },
        { id: "filtroTreineiroPerfil", col: "IN_TREINEIRO", labelMap: LABELS_TREINEIRO },
        { id: "filtroMaePerfil", col: "escolaridade_mae", labelMap: LABELS_ESCOLARIDADE_MAE },
        { id: "filtroRendaPerfil", col: "renda_familiar", labelMap: LABELS_RENDA },
        { id: "filtroInternetPerfil", col: "internet", labelMap: LABELS_INTERNET },
        { id: "filtroEstadocivilPerfil", col: "TP_ESTADO_CIVIL", labelMap: LABELS_ESTADO_CIVIL},
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
    document.getElementById("filtroAnoPerfil")?.addEventListener("change", async (e) => {
        await carregarEstruturaFiltrosComponentes(e.target.value);
        filtrarEAtualizarPainelPerfil();
    });

    // Escuta de forma correta e direta a ID mapeada no seu HTML
    const menuFiltros = document.getElementById("menuFiltrosPerfil");
    menuFiltros?.addEventListener("change", (e) => {
        if (e.target && e.target.type === "checkbox") {
            filtrarEAtualizarPainelPerfil();
        }
    });
}


/* =========================================================================
   3. PROCESSAMENTO SQL (APENAS CONSULTAS)
========================================================================= */
async function filtrarEAtualizarPainelPerfil() {
    const selectAno = document.getElementById("filtroAnoPerfil");
    const ano = selectAno ? selectAno.value : "2023";
    const tabelaAlvo = `ENEM_${ano}.parquet`;

    const marcados = Array.from(document.querySelectorAll('#menuFiltrosPerfil input[type="checkbox"]:checked'));
    const filtrosAtivos = {};
    
    marcados.forEach(cb => {
        const col = cb.getAttribute("data-coluna");
        if (!filtrosAtivos[col]) filtrosAtivos[col] = [];
        
        // CORREÇÃO CRÍTICA DE TIPAGEM: Se for número, entra puro. Se for texto (como sexo 'M'), entra com aspas.
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

    // --- QUERY 1: CARDS ---
    const qCards = await conn.query(`
        SELECT 
            CAST(COUNT(*) AS INTEGER) as total,
            CAST(SUM(CASE WHEN IN_TREINEIRO = 1 OR IN_TREINEIRO = '1' THEN 1 ELSE 0 END) AS INTEGER) as treineiros,
            CAST(SUM(CASE WHEN TP_ST_CONCLUSAO = 2 OR TP_ST_CONCLUSAO = '2' THEN 1 ELSE 0 END) AS INTEGER) as ultimo_ano,
            MODE(TP_FAIXA_ETARIA) as faixa_comum
        FROM '${tabelaAlvo}' ${sqlWhere}
    `);
    const dadosCards = qCards.toArray().map(r => r.toJSON())[0];

    // --- QUERIES DE COMPONENTES ---
    const qEscola = await conn.query(`SELECT tipo_escola, COUNT(*) as qtd FROM '${tabelaAlvo}' ${sqlWhere} GROUP BY tipo_escola`);
    const qDep = await conn.query(`SELECT dep_adm, COUNT(*) as qtd FROM '${tabelaAlvo}' ${sqlWhere} GROUP BY dep_adm`);
    const qConclusao = await conn.query(`SELECT TP_ST_CONCLUSAO, COUNT(*) as qtd FROM '${tabelaAlvo}' ${sqlWhere} GROUP BY TP_ST_CONCLUSAO`);
    const qRaca = await conn.query(`SELECT TP_COR_RACA, COUNT(*) as qtd FROM '${tabelaAlvo}' ${sqlWhere} GROUP BY TP_COR_RACA`);
    const qSexo = await conn.query(`SELECT TP_SEXO, COUNT(*) as qtd FROM '${tabelaAlvo}' ${sqlWhere} GROUP BY TP_SEXO`);
    const qIdade = await conn.query(`SELECT TP_FAIXA_ETARIA, COUNT(*) as qtd FROM '${tabelaAlvo}' ${sqlWhere} GROUP BY TP_FAIXA_ETARIA ORDER BY CAST(TP_FAIXA_ETARIA AS INTEGER)`);
    renderizarCardsInterface(dadosCards);
    
    if (typeof renderizarTabelasInterface === "function") {
        renderizarTabelasInterface(qEscola.toArray().map(r => r.toJSON()), qDep.toArray().map(r => r.toJSON()), qConclusao.toArray().map(r => r.toJSON()));
    }
    
    if (typeof renderizarGraficosInterface === "function") {
        renderizarGraficosInterface(qRaca.toArray().map(r => r.toJSON()), qSexo.toArray().map(r => r.toJSON()), qIdade.toArray().map(r => r.toJSON()));
    }
}

function renderizarCardsInterface(dados) {
    if (!dados) return;
    const total = Number(dados.total || 0);
    const treineiros = Number(dados.treineiros || 0);
    const ultimoAno = Number(dados.ultimo_ano || 0);
    const faixaCodigo = String(dados.faixa_comum || "1");

    document.getElementById("cardParticipantesPerfil").innerText = total.toLocaleString("pt-BR");
    document.getElementById("cardUltimoAnoPerfil").innerText = ultimoAno.toLocaleString("pt-BR");
    document.getElementById("cardTreineirosPerfil").innerText = treineiros.toLocaleString("pt-BR");
    document.getElementById("cardIdadePerfil").innerText = LABELS_FAIXA_ETARIA[faixaCodigo] || faixaCodigo;
}

// Expõe os dicionários globalmente para que os outros arquivos consigam ler as legendas (Labels)
window.LABELS_ESCOLA = LABELS_ESCOLA;
window.LABELS_DEP_ADM = LABELS_DEP_ADM;
window.LABELS_CONCLUSAO = LABELS_CONCLUSAO;
window.LABELS_COR_RACA = LABELS_COR_RACA;
window.LABELS_FAIXA_ETARIA = LABELS_FAIXA_ETARIA;


window.toggleFiltrosPerfil = function() {
    const menu = document.getElementById("menuFiltrosPerfil");
    if (menu) menu.style.display = (menu.style.display === "none" || menu.style.display === "") ? "block" : "none";
};

window.limparFiltrosPerfil = async function() {
    // 1. Reseta o seletor de ano no HTML para o ano padrão (2023)
    const selectAno = document.getElementById("filtroAnoPerfil");
    if (selectAno) {
        selectAno.value = "2023";
    }

    // 2. CORREÇÃO: Desmarca todos os checkboxes buscando pela classe estrutural do container
    const containerFiltros = document.querySelector(".filtros-card-perfil") || document.getElementById("menuFiltrosPerfil");
    if (containerFiltros) {
        containerFiltros.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    }
    
    // 3. Força os checkboxes a se redesenharem baseados na estrutura de dados de 2023
    await carregarEstruturaFiltrosComponentes("2023");

    // 4. Executa a query SQL limpa no DuckDB para atualizar os gráficos e cards
    filtrarEAtualizarPainelPerfil();
};

iniciarPerfil();
