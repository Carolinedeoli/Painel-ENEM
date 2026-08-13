/* =========================================================================
   PERFIL-COMUM.JS — VISÃO DE PERFIL COMPARTILHADA

   "Perfil dos Participantes" e "Redações Zeradas" mostram exatamente o mesmo
   conjunto: três gráficos (cor/raça, faixa etária, sexo) e três tabelas
   (escola, dependência, conclusão). O código estava duplicado entre os dois
   arquivos, com divergências de cor e de tratamento do "NA".

   Aqui existe uma implementação só, parametrizada pelo sufixo dos ids. As
   duas páginas ficam idênticas em tamanho, proporção e comportamento — que
   era justamente a inconsistência visual mais visível do painel.
========================================================================= */
import { registrarGrafico } from "../graficos/painel-grafico.js";
import { serie, corDe } from "../graficos/tema.js";
import { traduzir, normalizarCodigo, COR_RACA, FAIXA_ETARIA, SEXO, ESCOLA, DEP_ADM, CONCLUSAO }
    from "../dominio/rotulos.js";

/** Um conjunto de painéis por sufixo — registrados uma vez só. */
const paineis = new Map();

function obterPaineis(sufixo) {
    if (paineis.has(sufixo)) return paineis.get(sufixo);

    const conjunto = {
        raca: registrarGrafico({
            id: "graficoRaca" + sufixo,
            titulo: function (ctx) { return "Cor/Raça — " + ctx.ano; },
            tipos: ["barra", "barra-h", "pizza", "donut", "linha"],
            tipoPadrao: "barra"
        }),
        idade: registrarGrafico({
            id: "graficoIdade" + sufixo,
            titulo: function (ctx) { return "Faixa Etária — " + ctx.ano; },
            tipos: ["barra-h", "barra", "linha", "area"],
            tipoPadrao: "barra-h"
        }),
        sexo: registrarGrafico({
            id: "graficoSexo" + sufixo,
            titulo: function (ctx) { return "Sexo — " + ctx.ano; },
            tipos: ["cem-porcento", "donut", "pizza", "barra-h"],
            tipoPadrao: "cem-porcento"
        })
    };

    paineis.set(sufixo, conjunto);
    return conjunto;
}

/**
 * Renderiza a visão completa de perfil.
 *
 * @param {object} dados
 * @param {string} dados.sufixo     "" para Perfil, "Redacao" para Redações Zeradas
 * @param {string} dados.ano        ano selecionado, para os títulos dinâmicos
 * @param {Array}  dados.raca       [{ valor, qtd }]
 * @param {Array}  dados.sexo       [{ valor, qtd }]
 * @param {Array}  dados.idade      [{ valor, qtd }] já ordenado por código
 * @param {Array}  dados.escola     [{ valor, qtd }]
 * @param {Array}  dados.dep        [{ valor, qtd }]
 * @param {Array}  dados.conclusao  [{ valor, qtd }]
 */
export function renderizarVisaoPerfil(dados) {
    const sufixo = dados.sufixo || "";
    const contexto = { ano: dados.ano };
    const conjunto = obterPaineis(sufixo);

    conjunto.raca.atualizar(porCategoria(dados.raca, COR_RACA, "Participantes"), contexto);
    conjunto.idade.atualizar(porCategoria(dados.idade, FAIXA_ETARIA, "Participantes"), contexto);
    conjunto.sexo.atualizar(conjuntoSexo(dados.sexo), contexto);

    tabelaDistribuicao("tabelaEscola" + sufixo, dados.escola, "Tipo de Escola", ESCOLA);
    tabelaDistribuicao("tabelaDepAdm" + sufixo, dados.dep, "Dependência", DEP_ADM);
    tabelaDistribuicao("tabelaConclusao" + sufixo, dados.conclusao, "Situação", CONCLUSAO, true);
}

/* =========================================================================
   CONJUNTOS DE DADOS

   Uma série só, então uma cor só: pintar cada barra de uma cor gastaria o
   canal de cor com informação que a altura já dá. As cores por fatia só
   entram quando o tipo escolhido é pizza ou rosca, onde não há altura.
========================================================================= */
function porCategoria(linhas, mapa, nomeSerie) {
    const lista = linhas || [];

    return {
        categorias: lista.map(function (l) { return traduzir(mapa, l.valor); }),
        series: [{
            nome: nomeSerie,
            valores: lista.map(function (l) { return Number(l.qtd); }),
            cor: serie(0),
            cores: lista.map(function (_, i) { return serie(i); })
        }],
        formato: "inteiro",
        eixoX: "",
        eixoY: "Participantes",
        unidade: "participantes"
    };
}

/**
 * Sexo — uma barra única de 100%, dividida entre feminino e masculino.
 * A ordem é fixa para que a cor fique presa à categoria mesmo quando um
 * filtro deixa só uma das duas.
 */
function conjuntoSexo(linhas) {
    const porValor = {};
    (linhas || []).forEach(function (l) {
        porValor[normalizarCodigo(l.valor)] = Number(l.qtd);
    });

    const ordem = ["F", "M"];

    return {
        categorias: ordem.map(function (chave) { return traduzir(SEXO, chave); }),
        series: [{
            nome: "Participantes",
            valores: ordem.map(function (chave) { return porValor[chave] || 0; }),
            cores: ordem.map(function (chave) { return corDe(chave); })
        }],
        formato: "inteiro",
        eixoX: "Sexo",
        eixoY: "Participantes",
        unidade: "participantes"
    };
}

/* =========================================================================
   TABELAS

   As tabelas são também o "gêmeo acessível" dos gráficos: nenhum número
   existe apenas dentro de um tooltip.
========================================================================= */
function tabelaDistribuicao(id, linhas, tituloColuna, mapa, mostrarQuantidade) {
    const container = document.getElementById(id);
    if (!container) return;

    if (!linhas || linhas.length === 0) {
        container.innerHTML =
            '<table class="tabela"><tbody><tr class="tabela-vazia">'
            + "<td>Sem dados para este recorte.</td></tr></tbody></table>";
        return;
    }

    const total = linhas.reduce(function (soma, l) { return soma + Number(l.qtd); }, 0);
    const ordenadas = linhas.slice().sort(function (a, b) { return b.qtd - a.qtd; });

    let html = '<div class="tabela-rolagem"><table class="tabela"><thead><tr>'
        + '<th scope="col">' + escapar(tituloColuna) + "</th>";

    if (mostrarQuantidade) html += '<th scope="col" class="num">Nº</th>';
    html += '<th scope="col" class="num">%</th></tr></thead><tbody>';

    ordenadas.forEach(function (linha) {
        const proporcao = total > 0 ? (linha.qtd / total) * 100 : 0;

        html += "<tr><td>" + escapar(traduzir(mapa, linha.valor)) + "</td>";
        if (mostrarQuantidade) {
            html += '<td class="num">' + Number(linha.qtd).toLocaleString("pt-BR") + "</td>";
        }
        html += '<td class="num">' + barra(proporcao) + "</td></tr>";
    });

    container.innerHTML = html + "</tbody></table></div>";
}

/**
 * Percentual acompanhado de uma barra proporcional. O número continua
 * legível sozinho — a barra só ajuda a comparar as linhas de relance.
 */
export function barra(valor) {
    const largura = Math.max(0, Math.min(100, valor));
    return '<span class="celula-barra">'
        + '<span class="barra-mini" aria-hidden="true"><span style="width:' + largura + '%"></span></span>'
        + "<span>" + formatarDecimal(valor, 1) + "%</span></span>";
}

export function formatarDecimal(valor, casas) {
    if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
    return Number(valor).toLocaleString("pt-BR", {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    });
}

export function escapar(texto) {
    return String(texto == null ? "" : texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export default { renderizarVisaoPerfil, barra, formatarDecimal, escapar };
