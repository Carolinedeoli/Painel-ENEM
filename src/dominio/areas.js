/* =========================================================================
   AREAS.JS — ÁREAS DE CONHECIMENTO DA PROVA

   A lista das cinco áreas e, principalmente, a tradução "coluna escolhida no
   filtro → nome que aparece na tela". Essa tradução é a fonte dos títulos
   dinâmicos: quando o usuário troca a área, o título do gráfico troca junto,
   sem que nenhuma página precise saber como escrever esse texto.
========================================================================= */

export const AREAS = [
    { coluna: "NU_NOTA_CN",      chave: "media_cn",      nome: "Ciências da Natureza", curto: "C. Natureza" },
    { coluna: "NU_NOTA_CH",      chave: "media_ch",      nome: "Ciências Humanas",     curto: "C. Humanas" },
    { coluna: "NU_NOTA_LC",      chave: "media_lc",      nome: "Linguagens e Códigos", curto: "Linguagens" },
    { coluna: "NU_NOTA_MT",      chave: "media_mt",      nome: "Matemática",           curto: "Matemática" },
    { coluna: "NU_NOTA_REDACAO", chave: "media_redacao", nome: "Redação",              curto: "Redação" }
];

/** Valor do seletor quando o usuário quer a média das cinco áreas. */
export const AREA_GERAL = "GERAL";

/** Opções do seletor de área, na ordem em que aparecem. */
export const OPCOES_AREA = [{ valor: AREA_GERAL, rotulo: "Média Geral (5 áreas)" }]
    .concat(AREAS.map(function (area) {
        return { valor: area.coluna, rotulo: area.nome };
    }));

/** Expressão SQL da nota que está sendo analisada. */
export function expressaoDaArea(area) {
    return area === AREA_GERAL
        ? "((NU_NOTA_CN + NU_NOTA_CH + NU_NOTA_LC + NU_NOTA_MT + NU_NOTA_REDACAO) / 5.0)"
        : area;
}

/**
 * Nome curto da área, para compor títulos dinâmicos.
 * Ex.: "Densidade de desempenho — Matemática"
 */
export function nomeDaArea(area) {
    if (area === AREA_GERAL) return "Média Geral";
    const encontrada = AREAS.find(function (a) { return a.coluna === area; });
    return encontrada ? encontrada.nome : "Nota";
}

/** Rótulo do eixo de notas, que também acompanha a área escolhida. */
export function rotuloDoEixo(area) {
    return area === AREA_GERAL ? "Nota média das 5 áreas" : "Nota — " + nomeDaArea(area);
}

/** Só quem tem as cinco notas entra nas médias e na proficiência. */
export const TEM_TODAS_AS_NOTAS = AREAS
    .map(function (area) { return area.coluna + " IS NOT NULL"; })
    .join(" AND ");

/**
 * Recorte de proficiência adotado por este painel: nota mínima em cada uma
 * das quatro áreas objetivas e na redação, simultaneamente. Não é uma
 * classificação oficial do INEP.
 */
export const EXPR_PROFICIENTE =
    "(NU_NOTA_CN >= 450 AND NU_NOTA_CH >= 450 AND NU_NOTA_LC >= 450 "
    + "AND NU_NOTA_MT >= 450 AND NU_NOTA_REDACAO >= 500)";

export default {
    AREAS, AREA_GERAL, OPCOES_AREA,
    expressaoDaArea, nomeDaArea, rotuloDoEixo, TEM_TODAS_AS_NOTAS, EXPR_PROFICIENTE
};
