/* =========================================================================
   ESTADO GLOBAL
========================================================================= */
let redacaoZerada = [];

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
const LABELS_STATUS_REDACAO = {"2": "Anulada", "3": "Cópia Texto Motivador", "4": "Em Branco", "6": "Fuga ao tema", "7": "Não atendimento ao tipo textual", "8": "Texto insuficiente", "9": "Parte desconectada" };

/* =========================================================================
   1. CARREGAMENTO VIA PAPA PARSE
========================================================================= */
function carregarRedacaoZerada() {
    console.log("Iniciando carregamento do arquivo CSV de redações...");
    
    Papa.parse("dados/redacao_zerada_total.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(resultado) {
            
            // Limpeza básica dos dados (remove aspas, se houver)
            redacaoZerada = resultado.data.map(linha => {
                let linhaLimpa = {};
                for(let chave in linha){
                    let chaveLimpa = chave.replace(/\"/g, "").trim();
                    let valorLimpo = linha[chave] ? String(linha[chave]).replace(/\"/g, "").trim() : "";
                    linhaLimpa[chaveLimpa] = valorLimpo;
                }
                return linhaLimpa;
            });

            console.log("Base Redação Zerada Carregada! Linhas:", redacaoZerada.length);

            preencherSelectAnoRealRedacao();
            carregarEstruturaFiltrosComponentes();
            configurarEventosMudanca();
            filtrarEAtualizarPainelRedacao();
        },
        error: function(erro) {
            console.error("Erro ao carregar redacao_zerada_total.csv:", erro);
        }
    });
}

/* =========================================================================
   2. FILTROS DINÂMICOS
========================================================================= */
function preencherSelectAnoRealRedacao() {
    const selectAno = document.getElementById("filtroAnoRedacao");
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

function carregarEstruturaFiltrosComponentes() {
    const selectAno = document.getElementById("filtroAnoRedacao");
    const ano = selectAno ? selectAno.value : "2023";
    
    // Filtramos os dados apenas do ano atual para saber quais opções mostrar
    const dadosAno = redacaoZerada.filter(linha => linha.ANO === ano);

    const queries = [
        { id: "filtroUFRedacao", col: "estado_prova", labelMap: null },
        { id: "filtroSexoRedacao", col: "TP_SEXO", labelMap: LABELS_SEXO },
        { id: "filtroRacaRedacao", col: "TP_COR_RACA", labelMap: LABELS_COR_RACA },
        { id: "filtroFaixaRedacao", col: "TP_FAIXA_ETARIA", labelMap: LABELS_FAIXA_ETARIA },
        { id: "filtroConclusaoRedacao", col: "TP_ST_CONCLUSAO", labelMap: LABELS_CONCLUSAO },
        { id: "filtroEscolaRedacao", col: "tipo_escola", labelMap: LABELS_ESCOLA },
        { id: "filtroDepAdmRedacao", col: "dep_adm", labelMap: LABELS_DEP_ADM },
        { id: "filtroTreineiroRedacao", col: "IN_TREINEIRO", labelMap: LABELS_TREINEIRO },
        { id: "filtroMaeRedacao", col: "escolaridade_mae", labelMap: LABELS_ESCOLARIDADE_MAE },
        { id: "filtroRendaRedacao", col: "renda_familiar", labelMap: LABELS_RENDA },
        { id: "filtroInternetRedacao", col: "internet", labelMap: LABELS_INTERNET },
        { id: "filtroEstadocivilRedacao", col: "TP_ESTADO_CIVIL", labelMap: LABELS_ESTADO_CIVIL},
        { id: "filtroStatusRedacao", col: "redacao", labelMap: LABELS_STATUS_REDACAO } 
    ];

    for (let q of queries) {
        const container = document.getElementById(q.id);
        if (!container) continue;

        // Extrai os valores únicos daquela coluna para o ano selecionado
        const valoresUnicos = [...new Set(dadosAno.map(linha => linha[q.col]))]
                                .filter(v => v !== "" && v !== undefined)
                                .sort();

        container.innerHTML = "";
        valoresUnicos.forEach(valorBruto => {
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
    document.getElementById("filtroAnoRedacao")?.addEventListener("change", (e) => {
        carregarEstruturaFiltrosComponentes();
        filtrarEAtualizarPainelRedacao();
    });

    const menuFiltros = document.getElementById("menuFiltrosRedacao");
    menuFiltros?.addEventListener("change", (e) => {
        if (e.target && e.target.type === "checkbox") {
            filtrarEAtualizarPainelRedacao();
        }
    });
}

/* =========================================================================
   3. PROCESSAMENTO DOS DADOS NO ARRAY (JS PURO)
========================================================================= */
function filtrarEAtualizarPainelRedacao() {
    const ano = document.getElementById("filtroAnoRedacao")?.value || "2023";

    // 1. Coleta quais filtros estão ativados
    const filtrosAtivos = {};
    document.querySelectorAll('#menuFiltrosRedacao input[type="checkbox"]:checked').forEach(cb => {
        const coluna = cb.dataset.coluna;
        if (!filtrosAtivos[coluna]) filtrosAtivos[coluna] = [];
        filtrosAtivos[coluna].push(cb.value);
    });

    // 2. Filtra o Array redacaoZerada
    const dadosFiltrados = redacaoZerada.filter(linha => {
        // Filtra pelo Ano obrigatório
        if (linha.ANO !== ano) return false;

        // Verifica cada um dos checkboxes
        for (let coluna in filtrosAtivos) {
            if (!filtrosAtivos[coluna].includes(linha[coluna])) {
                return false;
            }
        }
        return true;
    });

    // 3. Processa dados para os CARDS
    let treineiros = 0;
    let ultimo_ano = 0;
    let contagemIdade = {};

    dadosFiltrados.forEach(linha => {
        if (linha.IN_TREINEIRO === '1') treineiros++;
        if (linha.TP_ST_CONCLUSAO === '2') ultimo_ano++;
        
        let idade = linha.TP_FAIXA_ETARIA;
        if (idade) {
            contagemIdade[idade] = (contagemIdade[idade] || 0) + 1;
        }
    });

    let faixa_comum = "1";
    let maxIdade = 0;
    for (let i in contagemIdade) {
        if (contagemIdade[i] > maxIdade) {
            maxIdade = contagemIdade[i];
            faixa_comum = i;
        }
    }

    const dadosCards = {
        total: dadosFiltrados.length,
        treineiros: treineiros,
        ultimo_ano: ultimo_ano,
        faixa_comum: faixa_comum
    };

    // 4. Função Auxiliar para Agrupar Dados (Equivalente ao GROUP BY do SQL)
    function agrupar(coluna) {
        let contagem = {};
        dadosFiltrados.forEach(linha => {
            let valor = linha[coluna];
            if (valor !== undefined && valor !== "") {
                contagem[valor] = (contagem[valor] || 0) + 1;
            }
        });
        
        // Retorna um array de objetos para compatibilidade com o Plotly/Tabelas
        return Object.keys(contagem).map(k => {
            let obj = { qtd: contagem[k] };
            obj[coluna] = k;
            return obj;
        });
    }

    const qEscola = agrupar('tipo_escola');
    const qDep = agrupar('dep_adm');
    const qConclusao = agrupar('TP_ST_CONCLUSAO');
    const qRaca = agrupar('TP_COR_RACA');
    const qSexo = agrupar('TP_SEXO');
    
    // Ordenar a idade numericamente
    const qIdade = agrupar('TP_FAIXA_ETARIA').sort((a, b) => parseInt(a.TP_FAIXA_ETARIA) - parseInt(b.TP_FAIXA_ETARIA));

    // 5. Envia para a Interface
    renderizarCardsInterface(dadosCards);
    renderizarTabelasInterface(qEscola, qDep, qConclusao);
    renderizarGraficosInterface(qRaca, qSexo, qIdade);
}

function renderizarCardsInterface(dados) {
    if (!dados) return;
    const total = Number(dados.total || 0);
    const treineiros = Number(dados.treineiros || 0);
    const ultimoAno = Number(dados.ultimo_ano || 0);
    const faixaCodigo = String(dados.faixa_comum || "1");

    document.getElementById("cardParticipantesRedacao").innerText = total.toLocaleString("pt-BR");
    document.getElementById("cardUltimoAnoRedacao").innerText = ultimoAno.toLocaleString("pt-BR");
    document.getElementById("cardTreineirosRedacao").innerText = treineiros.toLocaleString("pt-BR");
    document.getElementById("cardIdadeRedacao").innerText = LABELS_FAIXA_ETARIA[faixaCodigo] || faixaCodigo;
}

window.LABELS_ESCOLA = LABELS_ESCOLA;
window.LABELS_DEP_ADM = LABELS_DEP_ADM;
window.LABELS_CONCLUSAO = LABELS_CONCLUSAO;
window.LABELS_COR_RACA = LABELS_COR_RACA;
window.LABELS_FAIXA_ETARIA = LABELS_FAIXA_ETARIA;
window.LABELS_STATUS_REDACAO = LABELS_STATUS_REDACAO;

window.toggleFiltrosRedacao = function() {
    const menu = document.getElementById("menuFiltrosRedacao");
    if (menu) menu.style.display = (menu.style.display === "none" || menu.style.display === "") ? "block" : "none";
};

window.limparFiltrosRedacao = function() {
    const selectAno = document.getElementById("filtroAnoRedacao");
    if (selectAno) selectAno.value = "2023";

    const containerFiltros = document.querySelector(".filtros-card-redacao") || document.getElementById("menuFiltrosRedacao");
    if (containerFiltros) {
        containerFiltros.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    }
    
    carregarEstruturaFiltrosComponentes();
    filtrarEAtualizarPainelRedacao();
};

/* =========================================================================
   ATUALIZAR GRAFICOS
========================================================================= */

function renderizarGraficosInterface(raca, sexo, idade, labels) {
    const lb = labels || {};
    const lbRaca = lb.COR_RACA || window.LABELS_COR_RACA || {};
    const lbIdade = lb.FAIXA_ETARIA || window.LABELS_FAIXA_ETARIA || {};

    const containerRaca = document.getElementById('graficoRacaRedacao'); 
    if (containerRaca) {
        const traceRaca = [{
            x: raca.map(r => {
                const nomeCompleto = lbRaca[String(r.TP_COR_RACA)] || r.TP_COR_RACA;
                return nomeCompleto === "Não Informado" ? "Não<br>Informado" : nomeCompleto;
            }),
            y: raca.map(r => Number(r.qtd)),
            type: 'bar', marker: { color: '#e74c3c' }
        }];
        Plotly.newPlot('graficoRacaRedacao', traceRaca, { 
            margin: { t: 5, b: 25, l: 35, r: 10 },  
            xaxis: {automargin: true},
            yaxis: {automargin: true} 
        }, { responsive: true });
    }

    const containerSexo = document.getElementById('graficoSexoRedacao'); 
    if (containerSexo) {
        const dSexo = {};
        sexo.forEach(s => dSexo[s.TP_SEXO] = Number(s.qtd));
        const totalS = (dSexo['M'] || 0) + (dSexo['F'] || 0);
        const pF = totalS > 0 ? ((dSexo['F'] || 0) / totalS * 100).toFixed(1) : 0;
        const pM = totalS > 0 ? ((dSexo['M'] || 0) / totalS * 100).toFixed(1) : 0;

        const traceSexo = [
            { x: [dSexo['F'] || 0], y: ['Sexo'], orientation: 'h', type: 'bar', name: 'Feminino', text: [`${pF}%`], textposition: 'inside', marker: { color: '#f39c12' } },
            { x: [dSexo['M'] || 0], y: ['Sexo'], orientation: 'h', type: 'bar', name: 'Masculino', text: [`${pM}%`], textposition: 'inside', marker: { color: '#2ecc71' } }
        ];
        Plotly.newPlot('graficoSexoRedacao', traceSexo, { 
            barmode: 'stack', bargap: 0.5, margin: { t: 10, b: 30, l: 40, r: 20 }, 
            xaxis: { visible: false }, yaxis: { visible: false }, showlegend: true
        }, { responsive: true });
    }

    const containerIdade = document.getElementById('graficoIdadeRedacao');
    if (containerIdade) {
        const traceIdade = [{
            x: idade.map(i => Number(i.qtd)),
            y: idade.map(i => lbIdade[String(i.TP_FAIXA_ETARIA)] || i.TP_FAIXA_ETARIA),
            type: 'bar', 
            orientation: 'h', 
            marker: { color: '#c0392b' }
        }];

        Plotly.newPlot('graficoIdadeRedacao', traceIdade, { 
            height: 340, 
            bargap: 0.4, 
            margin: { t: 0, b: 40, l: 110, r: 20 }, 
            yaxis: { autorange: 'reversed', automargin: true },
            xaxis: { automargin: true }
        }, { responsive: true });
    }
};

/* =========================================================================
   ATUALIZAR TABELAS
========================================================================= */
function renderizarTabelasInterface(escola, dep, conclusao, labels) {
    const lb = labels || {};
    const lbEscola = lb.ESCOLA || window.LABELS_ESCOLA || {};
    const lbDep = lb.DEP_ADM || window.LABELS_DEP_ADM || {};
    const lbConclusao = lb.CONCLUSAO || window.LABELS_CONCLUSAO || {};

    const criarHtmlTabela = (dados, col, titulo, labelMap) => {
        let total = dados.reduce((s, l) => s + Number(l.qtd), 0);
        let html = `<table class="tabela-estilo-painel"><thead><tr><th>${titulo}</th><th>% Participantes</th></tr></thead><tbody>`;
        
        dados.forEach(l => {
            let valorBruto = String(l[col]);
            let nome = labelMap ? (labelMap[valorBruto] || l[col]) : l[col];
            
            // 🌟 CORREÇÃO: Substitui o "NA" por "Não Informado" para a tabela de dependência administrativa
            if (valorBruto === "NA" || nome === "NA") {
                nome = "Não Informado";
            }
            
            let qtdNumerica = Number(l.qtd);
            let perc = total > 0 ? ((qtdNumerica / total) * 100).toFixed(1) : 0;
            html += `<tr><td>${nome || "Não Informado"}</td><td>${perc}%</td></tr>`;
        });
        return html + "</tbody></table>";
    };

    if (document.getElementById("tabelaEscolaRedacao")) {
        document.getElementById("tabelaEscolaRedacao").innerHTML = criarHtmlTabela(escola, "tipo_escola", "Escola", lbEscola);
    }
    if (document.getElementById("tabelaDepAdmRedacao")) {
        document.getElementById("tabelaDepAdmRedacao").innerHTML = criarHtmlTabela(dep, "dep_adm", "Dependência", lbDep);
    }

    const containerConclusao = document.getElementById("tabelaConclusaoRedacao");
    if (containerConclusao) {
        let totalC = conclusao.reduce((s, l) => s + Number(l.qtd), 0);
        let htmlC = `<table class="tabela-estilo-painel"><thead><tr><th>Situação</th><th>Nº Participantes</th><th>% Participantes</th></tr></thead><tbody>`;
        conclusao.forEach(l => {
            let nomeConclusao = lbConclusao[String(l.TP_ST_CONCLUSAO)] || l.TP_ST_CONCLUSAO;
            let qtdNumerica = Number(l.qtd);
            let perc = totalC > 0 ? ((qtdNumerica / totalC) * 100).toFixed(1) : 0;
            htmlC += `<tr><td>${nomeConclusao || "Não Informado"}</td><td>${qtdNumerica.toLocaleString('pt-BR')}</td><td>${perc}%</td></tr>`;
        });
        containerConclusao.innerHTML = htmlC + "</tbody></table>";
    }
};

// Dispara o carregamento do CSV assim que o arquivo JS é lido
carregarRedacaoZerada();