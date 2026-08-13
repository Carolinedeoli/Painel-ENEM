/* =========================================================================
   TIPOS.JS — CATÁLOGO DE TIPOS DE GRÁFICO

   O painel é uma peça de apresentação: o mesmo conjunto de dados pode ser
   mais convincente como barra, como pizza ou como linha dependendo de quem
   está olhando. Em vez de espalhar condicionais pelas páginas, existe aqui
   um catálogo: cada tipo sabe converter o MESMO conjunto de dados nas séries
   do Plotly.

   O CONTRATO — todo gráfico do painel fala esta língua:

     {
       categorias: ["Branca", "Parda", …]   eixo de categorias (ou x numérico)
       series: [{ nome, valores: [], cor }] uma ou mais séries
       formato: "inteiro" | "percentual" | "decimal"
       eixoX, eixoY: rótulos dos eixos
       numerico: true                       x contínuo (curvas de densidade)
       unidade: "participantes"             usado no hover
     }

   Para acrescentar um tipo novo, acrescente uma entrada em TIPOS. Nenhuma
   página precisa saber que ele existe: quem lista os tipos disponíveis é o
   próprio catálogo, filtrado por aplicavel().
========================================================================= */
import { tinta, comAlfa, eixoAno, MARGEM, MARGEM_COMPACTA, serie } from "./tema.js";

/* =========================================================================
   AJUDANTES
========================================================================= */
function corDaSerie(dados, indice) {
    return dados.series[indice].cor || serie(indice);
}

function sufixoHover(dados) {
    return dados.unidade ? " " + dados.unidade : "";
}

/** Formato do valor no hover, conforme o tipo de número da série. */
function hoverValor(dados, campo) {
    if (dados.formato === "percentual") return "%{" + campo + ":.1%}";
    if (dados.formato === "decimal") return "%{" + campo + ":,.1f}";
    return "%{" + campo + ":,.0f}" + sufixoHover(dados);
}

/**
 * Monta o hovertemplate.
 *
 * O Plotly já escreve parte da caixa sozinho, e repetir o que ele escreve é
 * o que deixava os tooltips confusos. Dois casos:
 *
 *   · MODO UNIFICADO (x unified). O valor de x vira o cabeçalho da caixa e o
 *     nome da série encabeça cada linha. Repetir o x dentro da linha produzia
 *     "Inscritos 2021 3.389.832 pessoas" embaixo de um cabeçalho "2021".
 *     Aqui a linha traz só o valor.
 *   · SÉRIE ÚNICA. O <extra> vira uma caixinha lateral com o nome da série —
 *     "Participantes" ao lado de "Parda 1.062.833 participantes". O título do
 *     card já diz isso, então a caixinha sai.
 *
 * @param {string} campoCategoria  "x" ou "y", conforme a orientação
 * @param {string} campoValor      o outro eixo
 * @param {boolean} [unificado]    o tipo desenha com hovermode "x unified"
 */
function hoverTemplate(dados, campoCategoria, campoValor, unificado) {
    const valor = hoverValor(dados, campoValor);

    if (unificado) return valor + "<extra>%{fullData.name}</extra>";

    const nome = dados.series.length > 1 ? "%{fullData.name}" : "";
    return "%{" + campoCategoria + "}<br>" + valor + "<extra>" + nome + "</extra>";
}

function eixoValor(dados, extras) {
    const base = { title: { text: dados.eixoY || "", standoff: 8 }, rangemode: "tozero" };
    if (dados.formato === "percentual") base.tickformat = ".0%";
    return Object.assign(base, extras || {});
}

function eixoCategoria(dados, extras) {
    const base = { title: { text: dados.eixoX || "", standoff: 8 } };

    // Eixo de anos: os rótulos são exatamente as edições que existem. Sem
    // fixar tickvals, o Plotly folga a escala e desenha um tick a mais em
    // cada ponta ("2018", "2024"), que aparece cortado na borda do gráfico.
    if (dados.eixoAno) {
        Object.assign(base, eixoAno(), {
            tickmode: "array",
            tickvals: dados.categorias
        });
    }

    return Object.assign(base, extras || {});
}

function total(valores) {
    return valores.reduce(function (soma, v) { return soma + Number(v || 0); }, 0);
}

/* =========================================================================
   CATÁLOGO
========================================================================= */
export const TIPOS = {

    barra: {
        rotulo: "Barras",
        icone: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1.5" y="8" width="3" height="6" rx="1"/><rect x="6.5" y="4" width="3" height="10" rx="1"/><rect x="11.5" y="6" width="3" height="8" rx="1"/></svg>',
        aplicavel() { return true; },
        montar(dados) {
            const tracos = dados.series.map(function (s, i) {
                const cor = corDaSerie(dados, i);
                return {
                    type: "bar",
                    name: s.nome,
                    x: dados.categorias,
                    y: s.valores,
                    marker: { color: cor, cornerradius: 4, line: { color: tinta().superficie, width: 2 } },
                    hovertemplate: hoverTemplate(dados, "x", "y")
                };
            });

            return {
                tracos,
                layout: {
                    margin: MARGEM,
                    bargap: 0.3,
                    xaxis: eixoCategoria(dados, { type: dados.numerico ? "linear" : "category" }),
                    yaxis: eixoValor(dados)
                }
            };
        }
    },

    "barra-h": {
        rotulo: "Barras horizontais",
        icone: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="2" y="2" width="7" height="3" rx="1"/><rect x="2" y="6.5" width="12" height="3" rx="1"/><rect x="2" y="11" width="5" height="3" rx="1"/></svg>',
        aplicavel(dados) { return !dados.numerico; },
        montar(dados) {
            const tracos = dados.series.map(function (s, i) {
                const cor = corDaSerie(dados, i);
                return {
                    type: "bar",
                    orientation: "h",
                    name: s.nome,
                    y: dados.categorias,
                    x: s.valores,
                    marker: { color: cor, cornerradius: 4, line: { color: tinta().superficie, width: 2 } },
                    hovertemplate: hoverTemplate(dados, "y", "x")
                };
            });

            return {
                tracos,
                layout: {
                    // A margem esquerda é maior porque os rótulos das
                    // categorias moram nela; automargin cuida do resto.
                    margin: { t: 10, r: 16, b: 32, l: 96 },
                    bargap: 0.28,
                    yaxis: { autorange: "reversed", title: { text: "" } },
                    xaxis: eixoValor(dados, { title: { text: dados.eixoY || "", standoff: 8 } })
                }
            };
        }
    },

    linha: {
        rotulo: "Linha",
        icone: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,11 6,6 9,9 14,3"/></svg>',
        aplicavel() { return true; },
        montar(dados) {
            // Várias séries pedem a caixa unificada: comparar quatro valores
            // no mesmo x é a razão de existir de um gráfico de linhas.
            const unificado = dados.series.length > 1;

            const tracos = dados.series.map(function (s, i) {
                const cor = corDaSerie(dados, i);
                return {
                    type: "scatter",
                    mode: dados.categorias.length > 40 ? "lines" : "lines+markers",
                    name: s.nome,
                    x: dados.categorias,
                    y: s.valores,
                    line: { color: cor, width: 2, shape: dados.numerico ? "spline" : "linear" },
                    marker: { color: cor, size: 7 },
                    hovertemplate: hoverTemplate(dados, "x", "y", unificado)
                };
            });

            return {
                tracos,
                layout: {
                    margin: MARGEM,
                    hovermode: unificado ? "x unified" : "closest",
                    xaxis: eixoCategoria(dados),
                    yaxis: eixoValor(dados, { rangemode: dados.zeroObrigatorio === false ? "normal" : "tozero" })
                }
            };
        }
    },

    area: {
        rotulo: "Área",
        icone: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" opacity=".85"><path d="M2 13V8l4-4 3 3 5-5v11z"/></svg>',
        aplicavel() { return true; },
        montar(dados) {
            const unificado = dados.series.length > 1;

            const tracos = dados.series.map(function (s, i) {
                const cor = corDaSerie(dados, i);
                return {
                    type: "scatter",
                    mode: "lines",
                    name: s.nome,
                    x: dados.categorias,
                    y: s.valores,
                    line: { color: cor, width: 2, shape: dados.numerico ? "spline" : "linear" },
                    fill: "tozeroy",
                    fillcolor: comAlfa(cor, unificado ? 0.1 : 0.16),
                    hovertemplate: hoverTemplate(dados, "x", "y", unificado)
                };
            });

            return {
                tracos,
                layout: {
                    margin: MARGEM,
                    hovermode: unificado ? "x unified" : "closest",
                    xaxis: eixoCategoria(dados),
                    yaxis: eixoValor(dados)
                }
            };
        }
    },

    empilhada: {
        rotulo: "Barras empilhadas",
        icone: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="3" y="8" width="4" height="6" rx="1"/><rect x="3" y="3" width="4" height="4" rx="1" opacity=".55"/><rect x="9" y="6" width="4" height="8" rx="1"/><rect x="9" y="2" width="4" height="3" rx="1" opacity=".55"/></svg>',
        aplicavel(dados) { return dados.series.length > 1 && !dados.numerico; },
        montar(dados) {
            const tracos = dados.series.map(function (s, i) {
                return {
                    type: "bar",
                    name: s.nome,
                    x: dados.categorias,
                    y: s.valores,
                    marker: { color: corDaSerie(dados, i) },
                    hovertemplate: hoverTemplate(dados, "x", "y")
                };
            });

            return {
                tracos,
                layout: {
                    barmode: "stack",
                    margin: MARGEM,
                    bargap: 0.3,
                    xaxis: eixoCategoria(dados, { type: "category" }),
                    yaxis: eixoValor(dados)
                }
            };
        }
    },

    /**
     * Barra única de 100%, dividida proporcionalmente entre as categorias.
     * É a leitura certa quando a pergunta é "que fatia cada categoria ocupa"
     * e não "quantos são" — o caso do gráfico de sexo, que antes usava duas
     * barras separadas e obrigava a comparar duas alturas para chegar a uma
     * proporção.
     */
    "cem-porcento": {
        rotulo: "Barra 100%",
        icone: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1" y="6" width="8" height="4" rx="1"/><rect x="9.5" y="6" width="5.5" height="4" rx="1" opacity=".55"/></svg>',
        aplicavel(dados) {
            return !dados.numerico && dados.series.length === 1 && dados.categorias.length <= 8;
        },
        montar(dados) {
            const valores = dados.series[0].valores;
            const soma = total(valores);
            const cores = dados.series[0].cores || [];
            const superficie = tinta().superficie;

            const tracos = dados.categorias.map(function (categoria, i) {
                const quantidade = Number(valores[i] || 0);
                const fatia = soma > 0 ? quantidade / soma : 0;

                return {
                    type: "bar",
                    orientation: "h",
                    name: String(categoria),
                    x: [fatia],
                    y: ["total"],
                    customdata: [quantidade],
                    marker: {
                        color: cores[i] || serie(i),
                        line: { color: superficie, width: 2 }
                    },
                    text: [porcentagem(fatia)],
                    // "auto" mantém o rótulo dentro quando cabe e o joga para
                    // fora quando o segmento é estreito, em vez de cortá-lo.
                    textposition: "auto",
                    insidetextfont: { color: "#ffffff", size: 13 },
                    outsidetextfont: { color: tinta().secundaria, size: 12 },
                    hovertemplate: "%{fullData.name}<br>%{customdata:,.0f}" + sufixoHover(dados)
                        + " (%{x:.1%})<extra></extra>"
                };
            });

            return {
                tracos,
                layout: {
                    barmode: "stack",
                    bargap: 0.6,
                    margin: MARGEM_COMPACTA,
                    xaxis: { visible: false, range: [0, 1] },
                    yaxis: { visible: false },
                    showlegend: true,
                    // Sem "normal" o Plotly inverte a legenda das barras
                    // empilhadas e a ordem dos nomes fica ao contrário da
                    // ordem dos segmentos.
                    legend: {
                        orientation: "h", y: -0.35, x: 0.5, xanchor: "center",
                        traceorder: "normal"
                    }
                }
            };
        }
    },

    pizza: {
        rotulo: "Pizza",
        icone: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 0 7 7H8z" opacity=".55"/><path d="M9 0v6h6a6 6 0 0 0-6-6z"/></svg>',
        aplicavel(dados) {
            return !dados.numerico && dados.series.length === 1 && dados.categorias.length <= 12;
        },
        montar(dados) { return torta(dados, 0); }
    },

    donut: {
        rotulo: "Rosca",
        icone: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2"><circle cx="8" cy="8" r="5.5" opacity=".45"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5"/></svg>',
        aplicavel(dados) {
            return !dados.numerico && dados.series.length === 1 && dados.categorias.length <= 12;
        },
        montar(dados) { return torta(dados, 0.55); }
    }
};

/** Pizza e rosca só diferem no buraco do meio. */
function torta(dados, buraco) {
    const cores = dados.series[0].cores
        || dados.categorias.map(function (_, i) { return serie(i); });

    return {
        tracos: [{
            type: "pie",
            hole: buraco,
            labels: dados.categorias,
            values: dados.series[0].valores,
            marker: { colors: cores, line: { color: tinta().superficie, width: 2 } },
            sort: false,
            direction: "clockwise",
            textinfo: "percent",
            textposition: "inside",
            insidetextfont: { color: "#ffffff", size: 12 },
            hovertemplate: "%{label}<br>%{value:,.0f}" + sufixoHover(dados)
                + " (%{percent})<extra></extra>"
        }],
        layout: {
            margin: { t: 8, r: 8, b: 8, l: 8 },
            showlegend: true,
            legend: { orientation: "h", y: -0.05, x: 0.5, xanchor: "center", font: { size: 11 } }
        }
    };
}

/* =========================================================================
   CONSULTA AO CATÁLOGO
========================================================================= */

/** Ids de tipo que fazem sentido para este conjunto de dados. */
export function tiposAplicaveis(ids, dados) {
    return (ids || Object.keys(TIPOS)).filter(function (id) {
        const tipo = TIPOS[id];
        return tipo && tipo.aplicavel(dados);
    });
}

/** Converte o conjunto de dados nas séries e no layout de um tipo. */
export function montar(idTipo, dados) {
    const tipo = TIPOS[idTipo] || TIPOS.barra;
    return tipo.montar(dados);
}

export function rotuloDoTipo(idTipo) {
    return TIPOS[idTipo] ? TIPOS[idTipo].rotulo : idTipo;
}

function porcentagem(fracao) {
    return (fracao * 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }) + "%";
}

function escapar(texto) {
    return String(texto == null ? "" : texto).replace(/</g, "&lt;");
}

export default { TIPOS, tiposAplicaveis, montar, rotuloDoTipo };
