/* =========================================================================
   PAINEL-FILTROS.JS — GAVETA DE FILTROS

   As quatro páginas repetiam o mesmo bloco de filtros no HTML, com cerca de
   700 linhas quase idênticas. Bastava esquecer um sufixo em um id para o
   filtro não funcionar naquela aba, sem erro nenhum no console.

   Agora as gavetas são geradas a partir de dominio/dimensoes.js, e o estado
   marcado vive em nucleo/estado.js — o DOM é só a superfície de entrada.
   Marcar um checkbox não "é" o filtro: é um evento que atualiza o estado, e
   quem redesenha a página é a assinatura do estado.

   O ano saiu daqui. Era o recorte mais trocado do painel e estava a três
   cliques de distância, com um select diferente por aba; agora é uma faixa
   de tags no cabeçalho (ver seletor-ano.js), única para o painel inteiro.
========================================================================= */
import * as estado from "../nucleo/estado.js";
import { COLUNAS_POR_PAGINA, rotuloDaColuna, mapaDaColuna } from "../dominio/dimensoes.js";
import { normalizarCodigo, traduzir } from "../dominio/rotulos.js";

let fundo = null;
let botaoAbrir = null;

/* =========================================================================
   MONTAGEM
========================================================================= */
function montarGaveta(idPagina) {
    const colunas = COLUNAS_POR_PAGINA[idPagina] || [];

    const grupos = colunas.map(function (coluna) {
        return '<details class="filtro-grupo">'
            + '<summary class="filtro-titulo">' + escapar(rotuloDaColuna(coluna))
            + '<span class="filtro-selo" data-selo-de="' + coluna + '" hidden></span>'
            + "</summary>"
            + '<div class="filtro-conteudo">'
            + '<div class="checkbox-lista" data-coluna="' + coluna + '"></div>'
            + "</div></details>";
    }).join("");

    const gaveta = document.createElement("aside");
    gaveta.className = "filtro-drawer";
    gaveta.id = "gavetaFiltros-" + idPagina;
    gaveta.dataset.pagina = idPagina;
    gaveta.setAttribute("aria-label", "Filtros");
    gaveta.hidden = true;

    gaveta.innerHTML =
        '<header class="drawer-topo">'
        + "<h2>Filtros</h2>"
        + '<button type="button" class="drawer-fechar" data-acao="fechar" aria-label="Fechar filtros">'
        + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        + "</button></header>"

        + '<div class="drawer-busca">'
        + '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>'
        + '<input type="search" class="drawer-busca-campo" placeholder="Buscar opção…" aria-label="Buscar opção de filtro">'
        + "</div>"

        + '<div class="drawer-corpo">' + grupos + "</div>"

        + '<footer class="drawer-rodape">'
        + '<button type="button" class="btn-limpar-filtros" data-acao="limpar">'
        + '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        + " Limpar filtros</button></footer>";

    return gaveta;
}

function gavetaDe(idPagina) {
    return document.getElementById("gavetaFiltros-" + idPagina);
}

/* =========================================================================
   ABRIR / FECHAR
========================================================================= */
export function abrir(idPagina) {
    const gaveta = gavetaDe(idPagina || estado.paginaAtiva());
    if (!gaveta) return;

    fecharTodos();
    gaveta.hidden = false;
    void gaveta.offsetWidth;              // reflow: garante a transição de entrada
    gaveta.classList.add("aberto");

    if (fundo) fundo.hidden = false;
    if (botaoAbrir) botaoAbrir.setAttribute("aria-expanded", "true");

    const busca = gaveta.querySelector(".drawer-busca-campo");
    if (busca) busca.focus();
}

export function fecharTodos() {
    document.querySelectorAll(".filtro-drawer").forEach(function (gaveta) {
        gaveta.classList.remove("aberto");
        gaveta.hidden = true;
    });
    if (fundo) fundo.hidden = true;
    if (botaoAbrir) botaoAbrir.setAttribute("aria-expanded", "false");
}

export function alternar(idPagina) {
    const gaveta = gavetaDe(idPagina || estado.paginaAtiva());
    if (gaveta && gaveta.classList.contains("aberto")) {
        fecharTodos();
    } else {
        abrir(idPagina);
    }
}

/* =========================================================================
   PREENCHIMENTO DAS LISTAS

   Os valores chegam crus da base ("2.0", "NA") e são normalizados aqui, uma
   vez só — é o que faz o value do checkbox bater com a chave do dicionário e
   com o valor guardado no estado.
========================================================================= */
export function preencherOpcoes(idPagina, porColuna) {
    const gaveta = gavetaDe(idPagina);
    if (!gaveta) return;

    (COLUNAS_POR_PAGINA[idPagina] || []).forEach(function (coluna) {
        const container = gaveta.querySelector('.checkbox-lista[data-coluna="' + coluna + '"]');
        if (!container) return;

        const valores = porColuna[coluna] || [];
        if (valores.length === 0) {
            container.innerHTML = '<p class="filtro-vazio">Sem opções para este recorte.</p>';
            return;
        }

        const marcados = new Set(estado.valoresDe(idPagina, coluna));
        const mapa = mapaDaColuna(coluna);
        const fragmento = document.createDocumentFragment();

        normalizados(valores).forEach(function (codigo) {
            const rotulo = document.createElement("label");
            rotulo.className = "filtro-checkbox-label";

            const caixa = document.createElement("input");
            caixa.type = "checkbox";
            caixa.value = codigo;
            caixa.checked = marcados.has(codigo);
            caixa.dataset.coluna = coluna;
            caixa.dataset.pagina = idPagina;

            rotulo.appendChild(caixa);
            rotulo.appendChild(document.createTextNode(" " + traduzir(mapa, codigo)));
            fragmento.appendChild(rotulo);
        });

        container.innerHTML = "";
        container.appendChild(fragmento);
    });

    atualizarSelos();
}

/** Normaliza e remove duplicados que só diferiam pela forma ("2" e "2.0"). */
function normalizados(valores) {
    const vistos = new Set();
    const saida = [];

    valores.forEach(function (valor) {
        const codigo = normalizarCodigo(valor);
        if (codigo === "" || vistos.has(codigo)) return;
        vistos.add(codigo);
        saida.push(codigo);
    });

    return saida;
}

/**
 * Conjunto de opções válidas por coluna, no formato que
 * estado.reconciliar() espera.
 */
export function opcoesNormalizadas(porColuna) {
    const saida = {};
    for (const coluna in porColuna) saida[coluna] = normalizados(porColuna[coluna]);
    return saida;
}

/* =========================================================================
   SELOS E CONTADOR — sempre derivados do estado, nunca do DOM
========================================================================= */
export function atualizarSelos() {
    const idPagina = estado.paginaAtiva();
    const gaveta = gavetaDe(idPagina);

    const total = estado.contarFiltros(idPagina);
    const contador = document.getElementById("contadorFiltros");
    if (contador) {
        contador.textContent = total;
        contador.hidden = total === 0;
    }

    if (!gaveta) return;

    gaveta.querySelectorAll(".filtro-selo").forEach(function (selo) {
        const marcados = estado.valoresDe(idPagina, selo.dataset.seloDe).length;
        selo.textContent = marcados;
        selo.hidden = marcados === 0;
    });

    // Um checkbox pode ter sido desmarcado pela tag de filtro ativo ou pelo
    // botão "limpar": o estado é a verdade, o DOM só a acompanha.
    gaveta.querySelectorAll('input[type="checkbox"]').forEach(function (caixa) {
        const marcado = estado.valoresDe(idPagina, caixa.dataset.coluna).includes(caixa.value);
        if (caixa.checked !== marcado) caixa.checked = marcado;
    });
}

/* =========================================================================
   BUSCA DENTRO DA GAVETA
========================================================================= */
function aplicarBusca(gaveta, termo) {
    const alvo = termo.trim().toLowerCase();

    gaveta.querySelectorAll(".filtro-grupo").forEach(function (grupo) {
        const rotulos = grupo.querySelectorAll(".filtro-checkbox-label");
        if (rotulos.length === 0) return;

        let visiveis = 0;
        rotulos.forEach(function (rotulo) {
            const combina = !alvo || rotulo.textContent.toLowerCase().includes(alvo);
            rotulo.hidden = !combina;
            if (combina) visiveis++;
        });

        grupo.hidden = alvo !== "" && visiveis === 0;
        if (alvo) grupo.open = visiveis > 0;
    });
}

/* =========================================================================
   INICIALIZAÇÃO
========================================================================= */
export function iniciar() {
    fundo = document.getElementById("fundoDrawer");
    botaoAbrir = document.getElementById("btnFiltros");

    Object.keys(COLUNAS_POR_PAGINA).forEach(function (idPagina) {
        document.body.appendChild(montarGaveta(idPagina));
    });

    if (botaoAbrir) botaoAbrir.addEventListener("click", function () { alternar(); });
    if (fundo) fundo.addEventListener("click", fecharTodos);

    document.addEventListener("keydown", function (evento) {
        if (evento.key === "Escape") fecharTodos();
    });

    // Um ouvinte só na raiz cobre as quatro gavetas, inclusive os checkboxes
    // criados depois pelas consultas.
    document.addEventListener("click", function (evento) {
        const botao = evento.target.closest(".filtro-drawer [data-acao]");
        if (!botao) return;

        if (botao.dataset.acao === "fechar") {
            fecharTodos();
        } else if (botao.dataset.acao === "limpar") {
            estado.limpar(botao.closest(".filtro-drawer").dataset.pagina);
        }
    });

    document.addEventListener("change", function (evento) {
        const caixa = evento.target;
        if (!caixa.matches('.filtro-drawer input[type="checkbox"]')) return;

        estado.alternarValor(caixa.dataset.pagina, caixa.dataset.coluna, caixa.value, caixa.checked);
    });

    document.addEventListener("input", function (evento) {
        if (evento.target.matches(".drawer-busca-campo")) {
            aplicarBusca(evento.target.closest(".filtro-drawer"), evento.target.value);
        }
    });

    // Selos, contador e checkboxes seguem o estado, venha a mudança de onde vier.
    estado.observar(atualizarSelos);
}

export function definirPaginaAtiva() {
    fecharTodos();
    atualizarSelos();
}

function escapar(texto) {
    return String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default {
    iniciar, abrir, fecharTodos, alternar, preencherOpcoes,
    opcoesNormalizadas, atualizarSelos, definirPaginaAtiva
};
