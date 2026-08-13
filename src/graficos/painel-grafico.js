/* =========================================================================
   PAINEL-GRAFICO.JS — COMPONENTE DE CAIXA DE GRÁFICO

   Junta em um lugar só as quatro coisas que toda caixa de gráfico do painel
   precisa ter e que antes estavam espalhadas (ou faltando):

     1. TÍTULO DINÂMICO. O título é uma função do estado, não um texto fixo
        no HTML. Na página Desempenho, trocar a área de conhecimento troca o
        título das curvas de densidade — porque o conteúdo mudou, e um título
        fixo passaria a mentir.

     2. ESCOLHA DO TIPO DE GRÁFICO. O mesmo conjunto de dados pode ser barra,
        linha, área, pizza ou rosca (ver graficos/tipos.js). O menu lista
        apenas os tipos que fazem sentido para aquele conjunto.

     3. PREFERÊNCIA PERSISTIDA. A escolha vai para o SQLite (infra/
        preferencias.js) com a chave "grafico:<id>" e volta na próxima visita.

     4. TABELA EQUIVALENTE. Nenhum valor existe apenas dentro de um tooltip.
        A tabela é montada do MESMO conjunto de dados que alimenta o gráfico,
        então nunca diverge do que está desenhado.

   E um ganho de desempenho que vem de graça: o último conjunto de dados fica
   guardado por gráfico. Trocar de tipo redesenha a partir dele, sem
   consultar o banco de novo.
========================================================================= */
import { desenhar } from "./tema.js";
import { TIPOS, tiposAplicaveis, montar } from "./tipos.js";
import * as preferencias from "../infra/preferencias.js";

const ICONE_TABELA = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1.8" y="2.5" width="12.4" height="11" rx="1.5"/><line x1="1.8" y1="6.2" x2="14.2" y2="6.2"/><line x1="6" y1="6.2" x2="6" y2="13.5"/></svg>';

const registrados = new Map();

/**
 * Registra uma caixa de gráfico.
 *
 * @param {object} spec
 * @param {string}   spec.id          id do <div class="grafico">
 * @param {string[]} spec.tipos       ids de tipo oferecidos, na ordem do menu
 * @param {string}   spec.tipoPadrao  tipo usado quando não há preferência
 * @param {string|function} spec.titulo  texto ou função(contexto) → texto
 * @returns {{ atualizar: Function, redesenhar: Function }}
 */
export function registrarGrafico(spec) {
    const painel = {
        id: spec.id,
        tipos: spec.tipos || ["barra", "linha", "area"],
        tipoPadrao: spec.tipoPadrao || (spec.tipos && spec.tipos[0]) || "barra",
        titulo: spec.titulo,
        dados: null,
        contexto: null,
        tabelaAberta: false
    };

    registrados.set(spec.id, painel);

    return {
        /**
         * Recebe o conjunto de dados canônico (ver graficos/tipos.js) e o
         * contexto usado para compor o título.
         */
        atualizar(dados, contexto) {
            painel.dados = dados;
            painel.contexto = contexto;
            renderizar(painel);
        },
        /** Redesenha com o último conjunto — usado na troca de tema. */
        redesenhar() {
            if (painel.dados) renderizar(painel);
        }
    };
}

/* =========================================================================
   RENDERIZAÇÃO
========================================================================= */
function renderizar(painel) {
    const elemento = document.getElementById(painel.id);
    if (!elemento || !painel.dados) return;

    const caixa = elemento.closest(".painel-box");
    const disponiveis = tiposAplicaveis(painel.tipos, painel.dados);
    const tipo = tipoEscolhido(painel, disponiveis);

    const { tracos, layout } = montar(tipo, painel.dados);
    desenhar(painel.id, tracos, layout);

    if (caixa) {
        escreverTitulo(caixa, painel);
        montarAcoes(caixa, painel, disponiveis, tipo);
        if (painel.tabelaAberta) montarTabela(caixa, painel);
    }
}

function tipoEscolhido(painel, disponiveis) {
    const salvo = preferencias.obter("grafico:" + painel.id, null);
    if (salvo && disponiveis.includes(salvo)) return salvo;
    if (disponiveis.includes(painel.tipoPadrao)) return painel.tipoPadrao;
    return disponiveis[0] || "barra";
}

function escreverTitulo(caixa, painel) {
    const alvo = caixa.querySelector("h2");
    if (!alvo || !painel.titulo) return;

    const texto = typeof painel.titulo === "function"
        ? painel.titulo(painel.contexto)
        : painel.titulo;

    if (alvo.textContent !== texto) alvo.textContent = texto;
}

/* =========================================================================
   AÇÕES DO CABEÇALHO
========================================================================= */
function montarAcoes(caixa, painel, disponiveis, tipoAtivo) {
    let acoes = caixa.querySelector(".acoes-grafico");

    if (!acoes) {
        acoes = document.createElement("div");
        acoes.className = "acoes-grafico";
        const topo = caixa.querySelector(".painel-box-topo");
        if (!topo) return;
        topo.appendChild(acoes);
        ligarEventos(acoes, painel, caixa);
    }

    // Só remonta quando algo mudou de verdade: remontar a cada atualização
    // fecharia o menu no meio do clique do usuário.
    const assinatura = disponiveis.join(",") + "|" + tipoAtivo;
    if (acoes.dataset.assinatura === assinatura) return;
    acoes.dataset.assinatura = assinatura;

    const opcoes = disponiveis.map(function (id) {
        const tipo = TIPOS[id];
        return '<button type="button" class="opcao-tipo' + (id === tipoAtivo ? " ativa" : "")
            + '" data-tipo="' + id + '" role="menuitemradio" aria-checked="'
            + (id === tipoAtivo ? "true" : "false") + '">'
            + tipo.icone + "<span>" + tipo.rotulo + "</span></button>";
    }).join("");

    const iconeAtual = TIPOS[tipoAtivo] ? TIPOS[tipoAtivo].icone : "";

    acoes.innerHTML =
        (disponiveis.length > 1
            ? '<div class="menu-tipo">'
              + '<button type="button" class="btn-acao btn-tipo" aria-haspopup="menu" '
              + 'aria-expanded="false" title="Tipo de gráfico">' + iconeAtual
              + '<svg viewBox="0 0 16 16" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 8,11 13,6"/></svg>'
              + "</button>"
              + '<div class="menu-tipo-lista" role="menu" hidden>' + opcoes + "</div>"
              + "</div>"
            : "")
        + '<button type="button" class="btn-acao btn-tabela" aria-pressed="'
        + (painel.tabelaAberta ? "true" : "false") + '" title="Ver os valores em tabela">'
        + ICONE_TABELA + "</button>";
}

function ligarEventos(acoes, painel, caixa) {
    acoes.addEventListener("click", function (evento) {
        const abrirMenu = evento.target.closest(".btn-tipo");
        if (abrirMenu) {
            const lista = acoes.querySelector(".menu-tipo-lista");
            const abrindo = lista.hidden;
            fecharMenusAbertos();
            lista.hidden = !abrindo;
            abrirMenu.setAttribute("aria-expanded", String(abrindo));
            return;
        }

        const opcao = evento.target.closest(".opcao-tipo");
        if (opcao) {
            preferencias.definir("grafico:" + painel.id, opcao.dataset.tipo);
            fecharMenusAbertos();
            renderizar(painel);
            return;
        }

        const tabela = evento.target.closest(".btn-tabela");
        if (tabela) {
            painel.tabelaAberta = !painel.tabelaAberta;
            tabela.setAttribute("aria-pressed", String(painel.tabelaAberta));
            if (painel.tabelaAberta) {
                montarTabela(caixa, painel);
            } else {
                const twin = caixa.querySelector(".tabela-twin");
                if (twin) twin.remove();
            }
        }
    });
}

function fecharMenusAbertos() {
    document.querySelectorAll(".menu-tipo-lista").forEach(function (lista) {
        lista.hidden = true;
    });
    document.querySelectorAll(".btn-tipo").forEach(function (botao) {
        botao.setAttribute("aria-expanded", "false");
    });
}

document.addEventListener("click", function (evento) {
    if (!evento.target.closest(".menu-tipo")) fecharMenusAbertos();
});

/* =========================================================================
   TABELA EQUIVALENTE
========================================================================= */
function montarTabela(caixa, painel) {
    const dados = painel.dados;
    if (!dados) return;

    let html = '<table class="tabela"><thead><tr><th scope="col">'
        + escapar(dados.eixoX || "Categoria") + "</th>";

    dados.series.forEach(function (s) {
        html += '<th scope="col" class="num">' + escapar(s.nome || "Valor") + "</th>";
    });
    html += "</tr></thead><tbody>";

    dados.categorias.forEach(function (categoria, i) {
        html += "<tr><td>" + escapar(categoria) + "</td>";
        dados.series.forEach(function (s) {
            html += '<td class="num">' + formatar(s.valores[i], dados.formato) + "</td>";
        });
        html += "</tr>";
    });
    html += "</tbody></table>";

    let twin = caixa.querySelector(".tabela-twin");
    if (!twin) {
        twin = document.createElement("div");
        twin.className = "tabela-twin";
        caixa.appendChild(twin);
    }
    twin.innerHTML = html;
}

function formatar(valor, formato) {
    if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
    const numero = Number(valor);

    if (formato === "percentual") {
        return (numero * 100).toLocaleString("pt-BR", {
            minimumFractionDigits: 1, maximumFractionDigits: 1
        }) + "%";
    }
    if (formato === "decimal" || !Number.isInteger(numero)) {
        return numero.toLocaleString("pt-BR", {
            minimumFractionDigits: 1, maximumFractionDigits: 1
        });
    }
    return numero.toLocaleString("pt-BR");
}

/** Redesenha todos os gráficos registrados — usado na troca de tema. */
export function redesenharTodos() {
    registrados.forEach(function (painel) {
        if (painel.dados) renderizar(painel);
    });
}

function escapar(texto) {
    return String(texto == null ? "" : texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export default { registrarGrafico, redesenharTodos };
