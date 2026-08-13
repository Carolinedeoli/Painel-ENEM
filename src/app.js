/* =========================================================================
   APP.JS — CASCA DO PAINEL: NAVEGAÇÃO, TEMA E ORQUESTRAÇÃO

   Ponto de entrada único. É o único <script> do index.html; todo o resto do
   painel é importado a partir daqui, na ordem que os módulos declaram.

   Cada página só é inicializada quando o usuário abre a aba correspondente.
   Antes, perfil.js e desempenho.js subiam o DuckDB assim que a página
   carregava — duas instâncias, os cinco Parquet baixados duas vezes, cerca
   de 580 MB antes de qualquer clique.
========================================================================= */
import { config } from "./nucleo/config.js";
import * as estado from "./nucleo/estado.js";
import * as painelFiltros from "./ui/painel-filtros.js";
import * as seletorAno from "./ui/seletor-ano.js";
import * as tagsFiltros from "./ui/tags-filtros.js";
import * as preferencias from "./infra/preferencias.js";
import * as preaquecimento from "./infra/preaquecimento.js";
import * as agregados from "./infra/agregados.js";
import { repintarTudo, ajustarPagina } from "./graficos/tema.js";
import { estatisticasCache, limparCachePersistente } from "./infra/duckdb.js";

import * as geral from "./paginas/geral.js";
import * as redacao from "./paginas/redacao.js";
import * as perfil from "./paginas/perfil.js";
import * as desempenho from "./paginas/desempenho.js";

const PAGINAS = {
    geral: {
        iniciar: geral.iniciar,
        titulo: "Estatísticas Gerais",
        subtitulo: "Inscrição, presença e validade das redações entre 2019 e 2023."
    },
    redacao: {
        iniciar: redacao.iniciar,
        titulo: "Redações Zeradas",
        subtitulo: "Quem são os participantes que entregaram redação, mas ficaram com nota zero."
    },
    perfil: {
        iniciar: perfil.iniciar,
        titulo: "Perfil dos Participantes",
        subtitulo: "Composição socioeconômica de quem esteve presente e teve notas registradas."
    },
    desempenho: {
        iniciar: desempenho.iniciar,
        titulo: "Desempenho",
        subtitulo: "Distribuição das notas, proficiência e evolução das médias por área."
    },
    dados: {
        titulo: "Sobre os Dados",
        subtitulo: "Origem, tratamento aplicado e como interpretar cada indicador do painel."
    }
};

const jaIniciadas = new Set();
let paginaAtual = "geral";

/* =========================================================================
   TROCA DE PÁGINA
========================================================================= */
function alterarPagina(idPagina) {
    const pagina = PAGINAS[idPagina];
    if (!pagina) return;

    paginaAtual = idPagina;

    document.querySelectorAll(".pagina-view").forEach(function (secao) {
        secao.hidden = secao.id !== "pagina-" + idPagina;
    });

    document.querySelectorAll(".btn-nav").forEach(function (botao) {
        const ativo = botao.dataset.pagina === idPagina;
        botao.classList.toggle("ativo", ativo);
        if (ativo) {
            botao.setAttribute("aria-current", "page");
        } else {
            botao.removeAttribute("aria-current");
        }
    });

    document.getElementById("tituloPagina").textContent = pagina.titulo;
    document.getElementById("subtituloPagina").textContent = pagina.subtitulo;
    document.title = pagina.titulo + " — Painel ENEM";

    // A página "Sobre os Dados" é estática: nem filtros nem ano se aplicam.
    const comFiltro = estado.PAGINAS_COM_FILTRO.includes(idPagina);
    document.getElementById("btnFiltros").hidden = !comFiltro;
    document.getElementById("controlesAno").hidden = !comFiltro;

    estado.definirPaginaAtiva(idPagina);
    painelFiltros.definirPaginaAtiva();

    // Primeiro acesso à aba: dispara o carregamento pesado agora, e não no
    // load da página. Nas vezes seguintes, sincronizar() só refaz a página se
    // o ano tiver mudado enquanto ela estava fechada.
    if (!jaIniciadas.has(idPagina)) {
        jaIniciadas.add(idPagina);
        if (typeof pagina.iniciar === "function") {
            Promise.resolve()
                .then(pagina.iniciar)
                .catch(function (erro) {
                    console.error("[Painel ENEM] Falha ao iniciar a aba " + idPagina, erro);
                });
        }
    } else {
        estado.sincronizar(idPagina);
    }

    // O Plotly não recalcula o tamanho de um gráfico que estava escondido.
    // Só os gráficos desta página precisam disso — a versão anterior
    // disparava um "resize" global e mandava as cinco páginas recalcularem.
    requestAnimationFrame(function () { ajustarPagina(idPagina); });

    history.replaceState(null, "", "#" + idPagina);
    window.scrollTo({ top: 0, behavior: "instant" });
}

/* =========================================================================
   TEMA CLARO / ESCURO
========================================================================= */
const CHAVE_TEMA = "painel-enem:tema";

function aplicarTema(tema) {
    document.documentElement.setAttribute("data-tema", tema);
    try { localStorage.setItem(CHAVE_TEMA, tema); } catch (e) { /* modo privado */ }

    // A grade e os eixos se resolvem com uma repintura; as cores das séries
    // ficam dentro dos conjuntos de dados, então a página visível se refaz —
    // o que é barato, porque as consultas envolvidas já estão em cache.
    repintarTudo();
    estado.revalidar();
}

function temaInicial() {
    try {
        const salvo = localStorage.getItem(CHAVE_TEMA);
        if (salvo) return salvo;
    } catch (e) { /* modo privado */ }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/* =========================================================================
   SELO DE AMBIENTE
========================================================================= */
const DESCRICAO_AMBIENTE = {
    "arquivo": {
        curto: "Sem servidor",
        longo: "O painel está aberto direto do disco (file://). O navegador bloqueia a "
             + "leitura da pasta dados/ nesse modo, então as páginas que dependem dos "
             + 'arquivos não carregam. Rode "node servidor-local.mjs" na pasta do projeto.',
        alerta: true
    },
    "local": {
        curto: "Ambiente local",
        longo: "O painel está rodando em um servidor local e lendo os arquivos da pasta "
             + "dados/ do próprio projeto."
    },
    "github-pages": {
        curto: "GitHub Pages",
        longo: "O painel está publicado no GitHub Pages e lendo os arquivos diretamente "
             + "do repositório."
    },
    "servidor": {
        curto: "Publicado",
        longo: "O painel está publicado em um servidor web e lendo os arquivos da pasta "
             + "dados/ do site."
    }
};

function mostrarAmbiente() {
    const info = DESCRICAO_AMBIENTE[config.ambiente];
    const selo = document.getElementById("seloAmbiente");
    const texto = document.getElementById("textoAmbiente");

    if (selo) {
        selo.textContent = info.curto;
        if (info.alerta) selo.dataset.estado = "alerta";
    }
    if (texto) {
        texto.textContent = info.longo + " Base de dados: " + config.baseDados;
    }
}

/* =========================================================================
   INICIALIZAÇÃO
========================================================================= */
function paginaDaAncora() {
    const alvo = (location.hash || "").replace("#", "");
    return PAGINAS[alvo] ? alvo : "geral";
}

function iniciar() {
    aplicarTema(temaInicial());
    mostrarAmbiente();

    // As preferências de gráfico são carregadas em paralelo com os dados;
    // nenhuma pintura espera por elas. Quando chegam, a página visível se
    // refaz para adotar o tipo de gráfico salvo.
    preferencias.iniciar().then(function () {
        estado.revalidar();
    });

    painelFiltros.iniciar();
    seletorAno.iniciar();
    tagsFiltros.iniciar();

    document.querySelectorAll(".btn-nav").forEach(function (botao) {
        botao.addEventListener("click", function () { alterarPagina(botao.dataset.pagina); });
    });

    document.getElementById("btnTema").addEventListener("click", function () {
        const atual = document.documentElement.getAttribute("data-tema");
        aplicarTema(atual === "escuro" ? "claro" : "escuro");
    });

    alterarPagina(paginaDaAncora());

    window.addEventListener("hashchange", function () {
        const alvo = paginaDaAncora();
        if (alvo !== paginaAtual) alterarPagina(alvo);
    });

    // 2ª onda dos agregados: os anos que não estão na tela, sem que a
    // primeira pintura espere por eles.
    agregados.carregarRestante();

    // Rede de segurança: se os agregados não estiverem publicados, recalcula
    // tudo em segundo plano. Nas visitas seguintes o marcador no IndexedDB
    // diz que já está tudo em cache e nada roda.
    preaquecimento.iniciar({ perfil, desempenho });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
} else {
    iniciar();
}

/* -------------------------------------------------------------------------
   Diagnóstico no console. Útil para conferir, durante uma apresentação, que
   trocar de filtro está mesmo aproveitando o cache em vez de reconsultar.
------------------------------------------------------------------------- */
window.PainelENEM = {
    config,
    estado,
    alterarPagina,
    cache: estatisticasCache,
    limparCache: limparCachePersistente,
    preaquecimento: preaquecimento.situacao,
    agregados: agregados.situacao,
    gerarAgregados: agregados.gerar,
    preferencias
};
