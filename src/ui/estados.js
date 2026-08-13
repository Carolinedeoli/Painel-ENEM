/* =========================================================================
   ESTADOS.JS — CAMADAS DE CARREGANDO, ERRO E VAZIO

   Antes, qualquer falha de carregamento virava só um console.error e a tela
   ficava com zeros para sempre. Aqui as três situações viram estado visível.
========================================================================= */

const ICONE_ERRO = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
const ICONE_VAZIO = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v4H3z"></path><path d="M5 7v13h14V7"></path><line x1="9" y1="12" x2="15" y2="12"></line></svg>';

/** Cria (uma vez) a camada de estado dentro de uma página. */
function obterCamada(idPagina) {
    const pagina = document.getElementById("pagina-" + idPagina);
    if (!pagina) return null;

    let camada = pagina.querySelector(":scope > .estado-camada");
    if (!camada) {
        camada = document.createElement("div");
        camada.className = "estado-camada";
        camada.setAttribute("role", "status");
        camada.setAttribute("aria-live", "polite");
        pagina.appendChild(camada);
    }
    return camada;
}

function pintar(idPagina, classe, icone, titulo, detalhe) {
    const camada = obterCamada(idPagina);
    if (!camada) return;

    camada.className = "estado-camada " + classe;
    camada.innerHTML =
        '<div class="estado-caixa">'
        + icone
        + '<p class="estado-titulo">' + escapar(titulo) + "</p>"
        + (detalhe ? '<p class="estado-detalhe">' + escapar(detalhe) + "</p>" : "")
        + "</div>";
    camada.hidden = false;
}

const SPINNER = '<div class="estado-spinner" aria-hidden="true"></div>';

/** Estado de carregamento sobre a página. */
export function carregando(idPagina, titulo, detalhe) {
    pintar(idPagina, "estado-carregando", SPINNER, titulo, detalhe);
}

/**
 * Indicador de que a página está se refazendo — troca de ano, de filtro ou
 * de área. Diferente de carregando(): é uma pílula discreta, não a caixa
 * grande da primeira carga, porque aqui já existe conteúdo na tela.
 *
 * Três cuidados, todos necessários:
 *
 *   1. ATRASO. Muita atualização volta do cache em poucos milissegundos.
 *      Mostrar o indicador na hora produziria um piscar a cada clique, que
 *      incomoda mais do que a espera que ele anuncia. Só aparece se a
 *      consulta passar do atraso.
 *   2. CONFERE A EXECUÇÃO. Uma atualização já superada não pode pintar nada:
 *      o indicador ficaria na tela depois de a atualização atual terminar.
 *   3. NÃO ATROPELA OUTRO ESTADO. Se já há camada visível (a carga inicial,
 *      um erro, um "nenhum resultado"), essa mensagem é mais importante e
 *      permanece.
 *
 * @returns {() => void} função que encerra o indicador
 */
export function atualizando(idPagina, titulo, execucao, atraso) {
    const timer = setTimeout(function () {
        if (execucao && !execucao.ehAtual()) return;

        const camada = obterCamada(idPagina);
        if (!camada) return;

        if (!camada.hidden) {
            // Já há uma camada na tela. Se for de carregamento, ela está
            // desatualizada: a caixa da primeira carga continuava dizendo
            // "Preparando a consulta aos microdados…" durante toda a consulta
            // do ano padrão, sem nunca dizer que ano estava sendo carregado.
            // Erro e "nenhum resultado" são mais importantes e ficam.
            const carregando = camada.classList.contains("estado-carregando")
                || camada.classList.contains("estado-atualizando");

            if (carregando) {
                const alvo = camada.querySelector(".estado-titulo");
                if (alvo) alvo.textContent = titulo;
            }
            return;
        }

        pintar(idPagina, "estado-atualizando", SPINNER, titulo, "");
    }, atraso === undefined ? 160 : atraso);

    return function encerrar() { clearTimeout(timer); };
}

/** Atualiza só a linha secundária, sem repintar a camada. */
export function progresso(idPagina, detalhe) {
    const camada = obterCamada(idPagina);
    if (!camada || camada.hidden) return;

    let alvo = camada.querySelector(".estado-detalhe");
    if (!alvo) {
        alvo = document.createElement("p");
        alvo.className = "estado-detalhe";
        camada.querySelector(".estado-caixa").appendChild(alvo);
    }
    alvo.textContent = detalhe;
}

/** Erro com uma dica do que fazer. */
export function erro(idPagina, titulo, detalhe) {
    pintar(idPagina, "estado-erro",
        '<div class="estado-icone" aria-hidden="true">' + ICONE_ERRO + "</div>", titulo, detalhe);
}

/** "Nenhum resultado para os filtros". */
export function vazio(idPagina, titulo, detalhe) {
    pintar(idPagina, "estado-vazio",
        '<div class="estado-icone" aria-hidden="true">' + ICONE_VAZIO + "</div>", titulo, detalhe);
}

/** Esconde a camada e libera a página. */
export function pronto(idPagina) {
    const camada = obterCamada(idPagina);
    if (camada) camada.hidden = true;
}

/** Mensagem padrão para quando o painel foi aberto em file://. */
export function avisarSemServidor(idPagina) {
    erro(
        idPagina,
        "O painel precisa de um servidor para ler os dados",
        "A página foi aberta direto do disco (file://) e o navegador bloqueia a leitura "
        + "da pasta dados/ nesse modo. Na pasta do projeto, rode "
        + '"node servidor-local.mjs" e acesse o endereço que aparecer — ou use a versão '
        + "publicada no GitHub Pages."
    );
}

/**
 * Traduz um erro de carregamento em uma camada de erro pronta. Todas as
 * páginas tratavam isso com o mesmo bloco copiado.
 */
export function mostrarFalha(idPagina, nomePagina, erroOriginal) {
    console.error("[Painel ENEM] Página " + nomePagina + ":", erroOriginal);

    if (erroOriginal && erroOriginal.semServidor) {
        avisarSemServidor(idPagina);
        return;
    }

    erro(
        idPagina,
        "Não foi possível consultar os dados",
        (erroOriginal && erroOriginal.url ? "Arquivo esperado em " + erroOriginal.url + ". " : "")
        + "Verifique a conexão e se os arquivos de dados foram publicados. Detalhe: "
        + (erroOriginal && erroOriginal.message ? erroOriginal.message : erroOriginal)
    );
}

function escapar(texto) {
    return String(texto == null ? "" : texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export default {
    carregando, atualizando, progresso, erro, vazio, pronto,
    avisarSemServidor, mostrarFalha
};
