/* =========================================================================
   TAGS-FILTROS.JS — TAGS DO RECORTE ATIVO

   O contador "Filtros 3" dizia que havia três filtros, mas não quais. Para
   descobrir era preciso abrir a gaveta e percorrer doze grupos fechados —
   e, na prática, ninguém fazia isso: lia-se o gráfico achando que era o
   total nacional.

   Cada tag mostra "Dimensão: valor" e pode ser removida ali mesmo. É a
   leitura do estado, não uma cópia dele: some sozinha quando o filtro sai
   por qualquer outro caminho.
========================================================================= */
import * as estado from "../nucleo/estado.js";
import { rotuloDaColuna, mapaDaColuna } from "../dominio/dimensoes.js";
import { traduzir } from "../dominio/rotulos.js";

const ICONE_X = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

export function pintar() {
    const container = document.getElementById("tagsFiltros");
    if (!container) return;

    const pagina = estado.paginaAtiva();
    const recorte = estado.recorte(pagina);
    const colunas = Object.keys(recorte);

    if (colunas.length === 0) {
        container.innerHTML = "";
        container.hidden = true;
        return;
    }

    let html = '<span class="tags-rotulo">Filtros ativos</span>';

    colunas.forEach(function (coluna) {
        const mapa = mapaDaColuna(coluna);

        recorte[coluna].forEach(function (valor) {
            html += '<button type="button" class="tag-filtro" '
                + 'data-coluna="' + escapar(coluna) + '" data-valor="' + escapar(valor) + '" '
                + 'title="Remover este filtro">'
                + '<span class="tag-filtro-dimensao">' + escapar(rotuloDaColuna(coluna)) + "</span>"
                + '<span class="tag-filtro-valor">' + escapar(traduzir(mapa, valor)) + "</span>"
                + ICONE_X
                + "</button>";
        });
    });

    html += '<button type="button" class="tag-limpar" data-limpar-tudo>Limpar tudo</button>';

    container.innerHTML = html;
    container.hidden = false;
}

export function iniciar() {
    const container = document.getElementById("tagsFiltros");
    if (!container) return;

    container.addEventListener("click", function (evento) {
        const pagina = estado.paginaAtiva();

        if (evento.target.closest("[data-limpar-tudo]")) {
            estado.limpar(pagina);
            return;
        }

        const tag = evento.target.closest(".tag-filtro");
        if (tag) estado.removerValor(pagina, tag.dataset.coluna, tag.dataset.valor);
    });

    estado.observar(pintar);
    pintar();
}

function escapar(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export default { iniciar, pintar };
