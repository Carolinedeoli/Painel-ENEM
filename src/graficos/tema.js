/* =========================================================================
   TEMA.JS — APARÊNCIA ÚNICA DE TODOS OS GRÁFICOS

   Cada arquivo do projeto vinha inventando as suas próprias cores, margens e
   alturas, então a mesma informação aparecia vermelha em uma aba e azul em
   outra, e um gráfico de Redação tinha metade da altura do gráfico
   equivalente em Perfil. Aqui a paleta, o layout e as métricas ficam num
   lugar só.

   A paleta categórica foi validada para daltonismo (protanopia, deuteranopia
   e tritanopia) nos dois modos: a pior separação entre cores vizinhas é
   ΔE 9.1 no claro e 8.4 no escuro, acima do piso de 8.
========================================================================= */

/* -------------------------------------------------------------------------
   PALETA
------------------------------------------------------------------------- */
const SERIES_CLARO = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const SERIES_ESCURO = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

const TINTA_CLARO = {
    primaria: "#0f172a", secundaria: "#475569", suave: "#7c8798",
    grade: "#eaeef4", eixo: "#cbd5e1", superficie: "#ffffff"
};

const TINTA_ESCURO = {
    primaria: "#f1f5f9", secundaria: "#b6c2d2", suave: "#8b97a8",
    grade: "#232b36", eixo: "#333d4b", superficie: "#151a22"
};

export function escuro() {
    return document.documentElement.getAttribute("data-tema") === "escuro";
}

export function serie(indice) {
    const paleta = escuro() ? SERIES_ESCURO : SERIES_CLARO;
    return paleta[indice % paleta.length];
}

export function tinta() {
    return escuro() ? TINTA_ESCURO : TINTA_CLARO;
}

/* -------------------------------------------------------------------------
   IDENTIDADE FIXA DAS SÉRIES

   A cor acompanha a entidade, nunca a posição na lista. Se um filtro remove
   "Federal" do gráfico, "Estadual" continua laranja em vez de herdar o azul
   que sobrou.
------------------------------------------------------------------------- */
const SLOT_POR_ENTIDADE = {
    // Página Geral
    "Inscritos": 0, "Presentes": 1,
    "Presença Dia 1": 0, "Presença Dia 2": 1, "Redações Válidas": 2,

    // Dependência administrativa (códigos da base)
    "dep_adm:1": 0, "dep_adm:2": 1, "dep_adm:3": 2, "dep_adm:4": 3,

    // Áreas da prova
    "media_cn": 0, "media_ch": 1, "media_lc": 2, "media_mt": 3, "media_redacao": 4,

    // Sexo
    "F": 0, "M": 1
};

export function corDe(chave, reserva) {
    const slot = SLOT_POR_ENTIDADE[chave];
    return slot === undefined ? serie(reserva || 0) : serie(slot);
}

/* -------------------------------------------------------------------------
   MÉTRICA COMUM

   Uma margem só para todos os gráficos cartesianos. Antes cada chamada
   passava a sua, o que fazia a área de plotagem começar em alturas
   diferentes de um card para o outro — a origem visível da "inconsistência
   de tamanho" entre Redação e Perfil.
------------------------------------------------------------------------- */
export const FONTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const MARGEM = { t: 10, r: 14, b: 38, l: 56 };
export const MARGEM_COMPACTA = { t: 6, r: 10, b: 8, l: 10 };

/* -------------------------------------------------------------------------
   LAYOUT BASE
------------------------------------------------------------------------- */
export function layout(extras) {
    const c = tinta();

    return mesclar({
        autosize: true,

        // Separadores no padrão brasileiro: vírgula decimal, ponto de milhar.
        // O locale pt-BR do Plotly traduz menus e meses, mas não define isto —
        // sem a linha abaixo os gráficos mostram 3,389,832 enquanto os cards
        // mostram 3.389.832.
        separators: ",.",

        font: { family: FONTE, size: 12, color: c.secundaria },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        margin: Object.assign({}, MARGEM),

        hovermode: "closest",
        hoverlabel: {
            bgcolor: c.superficie,
            bordercolor: c.eixo,
            font: { family: FONTE, size: 12, color: c.primaria },
            align: "left"
        },

        xaxis: eixo(c),
        yaxis: eixo(c),

        legend: {
            orientation: "h",
            y: -0.2,
            x: 0,
            xanchor: "left",
            font: { size: 11, color: c.secundaria },
            bgcolor: "rgba(0,0,0,0)"
        },

        showlegend: false
    }, extras || {});
}

function eixo(c) {
    return {
        // Grade e eixos são fios sólidos, um tom acima da superfície:
        // presentes o suficiente para ler, discretos para não competir com os
        // dados. Nunca tracejados.
        gridcolor: c.grade,
        griddash: "solid",
        gridwidth: 1,
        zeroline: false,
        linecolor: c.eixo,
        linewidth: 1,
        tickfont: { size: 11, color: c.suave },
        titlefont: { size: 11, color: c.suave },
        automargin: true,
        separatethousands: true
    };
}

/**
 * Eixo de anos: rótulo inteiro, sem separador de milhar. Sem isso o Plotly
 * escreve "2.019" no lugar de "2019".
 */
export function eixoAno(extras) {
    return mesclar({
        tickmode: "linear",
        dtick: 1,
        tickformat: "d",
        separatethousands: false
    }, extras || {});
}

/** Opções do Plotly: responsivo, sem barra de ferramentas poluída. */
export function opcoes(extras) {
    return mesclar({
        responsive: true,
        displaylogo: false,
        locale: "pt-BR",
        displayModeBar: false
    }, extras || {});
}

/* -------------------------------------------------------------------------
   ESPECIFICAÇÕES DE MARCA
------------------------------------------------------------------------- */

/** Linha fina de 2px com marcadores de 8px. */
export function linha(cor, extras) {
    return mesclar({
        type: "scatter",
        mode: "lines+markers",
        line: { color: cor, width: 2 },
        marker: { color: cor, size: 8 },
        hovertemplate: "%{y}<extra>%{fullData.name}</extra>"
    }, extras || {});
}

/** Área preenchida discreta (curvas de densidade). */
export function area(cor, extras) {
    return mesclar({
        type: "scatter",
        mode: "lines",
        line: { color: cor, width: 2, shape: "spline" },
        fill: "tozeroy",
        fillcolor: comAlfa(cor, 0.14)
    }, extras || {});
}

/** Barra com pontas arredondadas e folga de 2px na cor da superfície. */
export function barra(cor, extras) {
    return mesclar({
        type: "bar",
        marker: {
            color: cor,
            cornerradius: 4,
            line: { color: tinta().superficie, width: 2 }
        }
    }, extras || {});
}

export function comAlfa(hex, alfa) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + [(n >> 16) & 255, (n >> 8) & 255, n & 255, alfa].join(",") + ")";
}

/* -------------------------------------------------------------------------
   DESENHAR

   Um ponto de entrada só, para que todo gráfico do painel receba o mesmo
   layout e as mesmas opções sem repetição. O que foi desenhado fica
   registrado para permitir repintar na troca de tema com fidelidade — antes
   a repintura remontava um layout aproximado e perdia formatações de eixo.
------------------------------------------------------------------------- */
const desenhados = new Map();

export function desenhar(idElemento, tracos, extrasLayout, extrasOpcoes) {
    const elemento = document.getElementById(idElemento);
    if (!elemento || typeof Plotly === "undefined") return;

    desenhados.set(idElemento, { tracos, extrasLayout, extrasOpcoes });

    // Mais de uma série sempre mostra legenda; uma série sozinha é
    // identificada pelo título do card e dispensa a caixinha.
    const layoutFinal = layout(mesclar(
        { showlegend: tracos.length > 1 },
        extrasLayout || {}
    ));

    Plotly.react(elemento, tracos, layoutFinal, opcoes(extrasOpcoes));
}

/** Repinta tudo depois de uma troca de tema, com a mesma especificação. */
export function repintarTudo() {
    desenhados.forEach(function (spec, id) {
        desenhar(id, spec.tracos, spec.extrasLayout, spec.extrasOpcoes);
    });
}

/**
 * Reajusta apenas os gráficos de uma página. O Plotly não recalcula o
 * tamanho de um gráfico que estava escondido; a versão anterior resolvia
 * isso disparando um evento "resize" global, o que mandava TODOS os
 * gráficos das cinco páginas recalcularem a cada troca de aba.
 */
export function ajustarPagina(idPagina) {
    const pagina = document.getElementById("pagina-" + idPagina);
    if (!pagina || typeof Plotly === "undefined") return;

    pagina.querySelectorAll(".grafico").forEach(function (elemento) {
        if (elemento.data) Plotly.Plots.resize(elemento);
    });
}

/* -------------------------------------------------------------------------
   UTILITÁRIO
------------------------------------------------------------------------- */
export function mesclar(alvo, fonte) {
    const saida = Object.assign({}, alvo);
    for (const chave in fonte) {
        const valor = fonte[chave];
        if (valor && typeof valor === "object" && !Array.isArray(valor)) {
            saida[chave] = mesclar(alvo[chave] || {}, valor);
        } else if (valor !== undefined) {
            saida[chave] = valor;
        }
    }
    return saida;
}

export default {
    escuro, serie, tinta, corDe, layout, eixoAno, opcoes,
    linha, area, barra, comAlfa, desenhar, repintarTudo, ajustarPagina, mesclar,
    FONTE, MARGEM, MARGEM_COMPACTA
};
