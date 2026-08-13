/* =========================================================================
   SELETOR-ANO.JS — FILTRO RÁPIDO DE ANO, EM TAGS, NO CABEÇALHO

   O ano é o recorte que mais se troca num painel de estatísticas e estava
   escondido dentro da gaveta de filtros: três cliques (abrir → escolher no
   select → fechar) e um select diferente por aba, o que deixava Perfil em
   2023 e Desempenho em 2019 sem nenhum aviso.

   Agora existe um ano só para o painel inteiro, sempre visível, a um clique.
   Trocar de aba mantém o ano; trocar o ano só recalcula a aba visível (ver a
   política de notificação em nucleo/estado.js).

   O indicador ao lado do título da página é preenchido aqui pelo mesmo
   motivo: o ano exibido tem de ser, por construção, o mesmo que está
   filtrando os dados — não uma segunda cópia que alguém precisa lembrar de
   atualizar.
========================================================================= */
import * as estado from "../nucleo/estado.js";

export function montar() {
    const container = document.getElementById("seletorAno");
    if (!container) return;

    container.setAttribute("role", "radiogroup");
    container.setAttribute("aria-label", "Ano da edição");

    container.innerHTML = estado.anosDisponiveis().map(function (ano) {
        return '<button type="button" class="tag-ano" role="radio" data-ano="' + ano + '" '
            + 'aria-checked="false">' + ano + "</button>";
    }).join("");

    // Um ouvinte só no container, ligado uma vez: as tags são recriadas
    // quando a lista de anos muda, e um addEventListener por remontagem
    // acumularia disparos duplicados.
    if (!container.dataset.ligado) {
        container.dataset.ligado = "1";
        container.addEventListener("click", function (evento) {
            const tag = evento.target.closest(".tag-ano");
            if (tag) estado.definirAno(tag.dataset.ano);
        });
    }

    pintar();
}

/** Marca a tag ativa e escreve o ano ao lado do título da página. */
export function pintar() {
    const atual = estado.ano();
    const disponiveis = estado.anosDisponiveis();
    const tags = document.querySelectorAll(".tag-ano");

    // A página Geral restringe os anos ao que existe de fato nos agregados,
    // depois que as tags já foram montadas. Sem remontar aqui, uma edição a
    // mais (ou a menos) na base não apareceria na faixa.
    if (tags.length !== disponiveis.length) {
        montar();
        return;
    }

    tags.forEach(function (tag) {
        const ativa = tag.dataset.ano === atual;
        tag.classList.toggle("ativa", ativa);
        tag.setAttribute("aria-checked", String(ativa));
    });

    const selo = document.getElementById("anoDoTitulo");
    if (selo) selo.textContent = atual;
}

export function iniciar() {
    montar();
    estado.observar(pintar);
}

export default { iniciar, montar, pintar };
