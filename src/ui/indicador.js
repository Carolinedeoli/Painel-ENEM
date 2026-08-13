/* =========================================================================
   INDICADOR.JS — COMPONENTE DE INDICADOR (KPI)

   Um indicador é sempre a mesma coisa: rótulo, valor e explicação. Este
   componente monta os três a partir do catálogo em dominio/indicadores.js,
   então acrescentar um indicador novo é acrescentar uma linha lá e citar o
   id na página — o HTML deixa de existir como coisa a manter.

   A explicação fica visível ao lado do próprio número, não escondida atrás
   de um ícone. Quem lê um painel de estatística precisa saber sobre que
   população o número foi calculado; esconder isso num tooltip transforma
   cada card numa pequena adivinhação.
========================================================================= */
import { INDICADORES } from "../dominio/indicadores.js";

/**
 * Monta a faixa de indicadores de uma página.
 *
 * @param {string} idContainer  elemento que recebe os cards
 * @param {string[]} ids        ids do catálogo, na ordem desejada
 */
export function montarIndicadores(idContainer, ids) {
    const container = document.getElementById(idContainer);
    if (!container) return;

    container.className = "faixa-indicadores";
    container.innerHTML = ids.map(function (id) {
        const indicador = INDICADORES[id];
        if (!indicador) {
            console.warn("[Painel ENEM] Indicador não encontrado no catálogo:", id);
            return "";
        }

        return '<article class="indicador" data-indicador="' + id + '">'
            + '<p class="indicador-rotulo">' + escapar(indicador.rotulo) + "</p>"
            + '<p class="indicador-valor" data-valor-de="' + id + '">—</p>'
            + '<p class="indicador-descricao">' + escapar(indicador.descricao) + "</p>"
            + "</article>";
    }).join("");
}

/**
 * Escreve o valor de um indicador, já formatado conforme o catálogo.
 * Valores ausentes viram travessão, e não "NaN" ou "0".
 */
export function definirValor(id, valor) {
    const alvo = document.querySelector('[data-valor-de="' + id + '"]');
    if (!alvo) return;

    const indicador = INDICADORES[id];
    const texto = formatar(valor, indicador ? indicador.formato : "texto");

    alvo.textContent = texto;
    alvo.classList.toggle("indicador-valor-texto", indicador && indicador.formato === "texto");
}

/** Escreve vários de uma vez: { "perfil.treineiros": 1234, ... } */
export function definirValores(valores) {
    for (const id in valores) definirValor(id, valores[id]);
}

/* =========================================================================
   FORMATAÇÃO
========================================================================= */
export function formatar(valor, formato) {
    if (valor === null || valor === undefined || valor === "") return "—";

    if (formato === "texto") return String(valor);

    const numero = Number(valor);
    if (Number.isNaN(numero)) return "—";

    if (formato === "percentual") return decimal(numero, 1) + "%";
    if (formato === "decimal") return decimal(numero, 1);

    return Math.round(numero).toLocaleString("pt-BR");
}

function decimal(numero, casas) {
    return numero.toLocaleString("pt-BR", {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    });
}

function escapar(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export default { montarIndicadores, definirValor, definirValores, formatar };
