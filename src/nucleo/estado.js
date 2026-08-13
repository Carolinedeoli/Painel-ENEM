/* =========================================================================
   ESTADO.JS — ESTADO CENTRAL DOS FILTROS

   Antes, o estado dos filtros era o próprio DOM: cada página lia os
   checkboxes marcados na hora de montar a consulta, e cada página tinha o
   seu próprio <select> de ano. Isso trazia três problemas concretos:

     1. Trocar o ano em Perfil não trocava em Desempenho. Duas abas do mesmo
        painel mostravam anos diferentes sem nenhum aviso.
     2. Não havia como saber "o que está filtrado" sem varrer o DOM, então
        não dava para mostrar tags, nem para comparar o recorte anterior com
        o novo e evitar recomputar o que não mudou.
     3. Cada página repetia o mesmo código de ligar eventos e reagir.

   Aqui existe uma fonte de verdade só. O DOM continua sendo a *entrada*
   (o usuário clica em checkbox), mas quem guarda o estado é este módulo, e
   todo consumidor lê daqui.

   POLÍTICA DE NOTIFICAÇÃO — é o que impede processamento excessivo:
     · só a página visível é avisada na hora;
     · as demais ficam marcadas como desatualizadas e se refazem quando o
       usuário abre a aba (sincronizar);
     · avisos em rajada (três cliques seguidos em checkbox) são agrupados
       em um só, com um pequeno atraso.
========================================================================= */

export const ANOS = ["2019", "2020", "2021", "2022", "2023"];
export const ANO_PADRAO = "2023";

/** Páginas que consomem filtros. "dados" é estática e não entra aqui. */
export const PAGINAS_COM_FILTRO = ["geral", "redacao", "perfil", "desempenho"];

const ESPERA_RAJADA = 120;   // ms para agrupar cliques seguidos

const estadoInterno = {
    ano: ANO_PADRAO,
    anosDisponiveis: ANOS.slice(),
    area: "GERAL",
    recortes: {},           // pagina -> { coluna: [valores] }
    paginaAtiva: "geral"
};

PAGINAS_COM_FILTRO.forEach(function (pagina) {
    estadoInterno.recortes[pagina] = {};
});

const ouvintes = {};             // pagina -> função
const desatualizadas = new Set();
const observadores = [];         // avisados a cada mudança (tags, títulos, contadores)
let timerRajada = null;

/* =========================================================================
   LEITURA
========================================================================= */
export function ano() {
    return estadoInterno.ano;
}

export function anosDisponiveis() {
    return estadoInterno.anosDisponiveis.slice();
}

export function area() {
    return estadoInterno.area;
}

export function paginaAtiva() {
    return estadoInterno.paginaAtiva;
}

/**
 * Recorte de uma página: { coluna: [valores] }. Devolve uma cópia, para que
 * ninguém consiga alterar o estado por fora das funções deste módulo.
 */
export function recorte(pagina) {
    const original = estadoInterno.recortes[pagina] || {};
    const copia = {};
    for (const coluna in original) {
        if (original[coluna].length > 0) copia[coluna] = original[coluna].slice();
    }
    return copia;
}

/** Quantos valores estão marcados na página, somando todas as colunas. */
export function contarFiltros(pagina) {
    const atual = estadoInterno.recortes[pagina] || {};
    let total = 0;
    for (const coluna in atual) total += atual[coluna].length;
    return total;
}

/** Valores marcados de uma coluna específica. */
export function valoresDe(pagina, coluna) {
    const atual = estadoInterno.recortes[pagina] || {};
    return (atual[coluna] || []).slice();
}

/**
 * Assinatura estável do recorte + ano + área de uma página. É a chave usada
 * pelo cache de consultas e a forma barata de responder "mudou alguma coisa
 * que exija recalcular?".
 */
export function assinatura(pagina) {
    const atual = estadoInterno.recortes[pagina] || {};
    const partes = Object.keys(atual).sort().map(function (coluna) {
        return coluna + "=" + atual[coluna].slice().sort().join("|");
    });
    return [pagina, estadoInterno.ano, estadoInterno.area].concat(partes).join(";");
}

/* =========================================================================
   ESCRITA
========================================================================= */
export function definirAno(novoAno) {
    const alvo = String(novoAno);
    if (alvo === estadoInterno.ano || !estadoInterno.anosDisponiveis.includes(alvo)) return;

    estadoInterno.ano = alvo;
    // O ano é global: todas as páginas dependem dele.
    avisar(PAGINAS_COM_FILTRO);
}

/** Restringe as opções de ano às edições que existem de fato na base. */
export function definirAnosDisponiveis(anos) {
    if (!anos || anos.length === 0) return;

    estadoInterno.anosDisponiveis = anos.map(String);
    if (!estadoInterno.anosDisponiveis.includes(estadoInterno.ano)) {
        estadoInterno.ano = estadoInterno.anosDisponiveis[estadoInterno.anosDisponiveis.length - 1];
    }
    avisarObservadores();
}

export function definirArea(novaArea) {
    if (novaArea === estadoInterno.area) return;
    estadoInterno.area = novaArea;
    // A área de conhecimento só existe na página Desempenho.
    avisar(["desempenho"]);
}

/** Marca ou desmarca um valor de uma coluna. */
export function alternarValor(pagina, coluna, valor, marcado) {
    const recortes = estadoInterno.recortes[pagina] || (estadoInterno.recortes[pagina] = {});
    const lista = recortes[coluna] || (recortes[coluna] = []);
    const posicao = lista.indexOf(valor);

    if (marcado && posicao === -1) {
        lista.push(valor);
    } else if (!marcado && posicao !== -1) {
        lista.splice(posicao, 1);
    } else {
        return;   // nada mudou
    }

    if (lista.length === 0) delete recortes[coluna];
    avisar([pagina]);
}

/** Remove um valor específico — usado pelo "x" das tags de filtro ativo. */
export function removerValor(pagina, coluna, valor) {
    alternarValor(pagina, coluna, valor, false);
}

/** Limpa o recorte de uma página. A área volta ao padrão junto. */
export function limpar(pagina) {
    estadoInterno.recortes[pagina] = {};
    if (pagina === "desempenho") estadoInterno.area = "GERAL";
    avisar([pagina]);
}

/**
 * Descarta valores que não existem mais nas opções da coluna.
 *
 * Ao trocar de ano, uma opção marcada pode simplesmente não existir na nova
 * edição. Sem esta limpeza, o filtro continuaria valendo de forma invisível
 * (nenhum checkbox marcado na tela, mas um IN (...) no SQL) e a página
 * mostraria "nenhum participante" sem explicação.
 *
 * @returns {boolean} true se algum valor foi descartado
 */
export function reconciliar(pagina, opcoesPorColuna) {
    const recortes = estadoInterno.recortes[pagina] || {};
    let mudou = false;

    for (const coluna in recortes) {
        const validos = opcoesPorColuna[coluna];
        if (!validos) continue;

        const permitidos = new Set(validos.map(String));
        const antes = recortes[coluna];
        const depois = antes.filter(function (valor) { return permitidos.has(valor); });

        if (depois.length !== antes.length) {
            mudou = true;
            if (depois.length === 0) {
                delete recortes[coluna];
            } else {
                recortes[coluna] = depois;
            }
        }
    }

    if (mudou) avisarObservadores();
    return mudou;
}

export function definirPaginaAtiva(pagina) {
    estadoInterno.paginaAtiva = pagina;
    avisarObservadores();
}

/* =========================================================================
   ASSINATURAS
========================================================================= */

/**
 * Registra como uma página reage a mudanças de estado.
 * @param {string} pagina
 * @param {() => void|Promise<void>} aoMudar
 */
export function assinar(pagina, aoMudar) {
    ouvintes[pagina] = aoMudar;
}

/**
 * Observadores globais: tags de filtro, indicador de ano no título,
 * contadores. São baratos e rodam sempre, para qualquer mudança.
 */
export function observar(aoMudar) {
    observadores.push(aoMudar);
}

/**
 * Chamado ao abrir uma aba. Se o estado mudou enquanto ela estava fechada,
 * refaz agora — e só agora. É isso que impede que trocar o ano dispare
 * consulta em quatro páginas ao mesmo tempo.
 */
export function sincronizar(pagina) {
    if (!desatualizadas.has(pagina)) return;
    desatualizadas.delete(pagina);
    executar(pagina);
}

/**
 * Refaz a página visível sem que nada tenha mudado no recorte. Usado na
 * troca de tema, em que as cores das séries precisam ser recalculadas — e
 * que sai de graça, porque as consultas envolvidas já estão em cache.
 */
export function revalidar(pagina) {
    executar(pagina || estadoInterno.paginaAtiva);
}

/* =========================================================================
   NOTIFICAÇÃO
========================================================================= */
function avisar(paginas) {
    paginas.forEach(function (pagina) {
        if (pagina !== estadoInterno.paginaAtiva) desatualizadas.add(pagina);
    });

    avisarObservadores();

    if (!paginas.includes(estadoInterno.paginaAtiva)) return;

    // Agrupa rajadas: marcar três checkboxes seguidos dispara um recálculo,
    // não três.
    clearTimeout(timerRajada);
    timerRajada = setTimeout(function () {
        executar(estadoInterno.paginaAtiva);
    }, ESPERA_RAJADA);
}

function avisarObservadores() {
    observadores.forEach(function (observador) {
        try {
            observador();
        } catch (erro) {
            console.error("[Painel ENEM] Observador de estado falhou:", erro);
        }
    });
}

/**
 * Cada disparo recebe um número de execução. A função da página recebe um
 * `ehAtual()` para conferir, depois dos awaits, se ainda é a renderização
 * mais recente.
 *
 * Sem isso, duas atualizações em sequência podem terminar fora de ordem: a
 * segunda encontra tudo em cache e responde na hora, enquanto a primeira
 * ainda espera o disco — e então a primeira sobrescreve a tela com números
 * de um recorte que o usuário já abandonou. O sintoma é cruel de depurar:
 * a tag do ano diz 2023 e os cards mostram 2021.
 */
const execucoes = {};

function executar(pagina) {
    const aoMudar = ouvintes[pagina];
    if (typeof aoMudar !== "function") return;

    const numero = (execucoes[pagina] || 0) + 1;
    execucoes[pagina] = numero;

    const execucao = {
        ehAtual: function () { return execucoes[pagina] === numero; }
    };

    Promise.resolve()
        .then(function () { return aoMudar(execucao); })
        .catch(function (erro) {
            console.error("[Painel ENEM] Falha ao atualizar a página " + pagina, erro);
        });
}

export default {
    ANOS, ANO_PADRAO, PAGINAS_COM_FILTRO,
    ano, anosDisponiveis, area, paginaAtiva, recorte, contarFiltros, valoresDe, assinatura,
    definirAno, definirAnosDisponiveis, definirArea, alternarValor, removerValor,
    limpar, reconciliar, definirPaginaAtiva,
    assinar, observar, sincronizar, revalidar
};
