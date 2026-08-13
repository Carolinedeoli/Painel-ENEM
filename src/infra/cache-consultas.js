/* =========================================================================
   CACHE-CONSULTAS.JS — SEGUNDO NÍVEL DE CACHE, EM INDEXEDDB

   O cache em memória (nucleo/cache.js) resolve a repetição dentro de uma
   sessão, mas morre com a aba. Quem fecha o painel e volta no dia seguinte
   paga de novo os mesmos segundos de varredura de Parquet — e, numa
   apresentação, paga na frente da plateia.

   Aqui os resultados ficam gravados no IndexedDB. A base é imutável: cinco
   arquivos publicados junto com o site. O mesmo SQL sobre os mesmos arquivos
   dá o mesmo resultado hoje e daqui a um mês, então guardar é seguro.

   POR QUE ISTO É BARATO
   Os resultados do painel são agregados, não linhas individuais: a maior
   consulta devolve algumas dezenas de linhas. Guardar 200 resultados custa
   poucos megabytes, enquanto cada acerto economiza uma varredura de arquivo
   de dezenas de MB pela rede.

   DUAS PROTEÇÕES CONTRA DADO VELHO
     · VERSAO — mude esta constante ao republicar os arquivos de dados e todo
       o cache antigo é descartado na próxima visita;
     · VALIDADE — um resultado guardado há mais de 30 dias é ignorado, para o
       caso de alguém trocar os arquivos sem lembrar da constante.

   O cache nunca pode derrubar o painel: qualquer falha do IndexedDB (modo
   privado, cota cheia, navegador antigo) é registrada e ignorada, e a
   consulta segue para o DuckDB.
========================================================================= */

const BANCO = "painel-enem-consultas";
const LOJA = "resultados";
const VERSAO = 1;                       // suba ao republicar os dados
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

/** Resultados maiores que isto não são guardados: não compensam o espaço. */
const MAXIMO_LINHAS = 5000;

/** Prefixo das chaves de controle: o caractere nulo nunca aparece em SQL,
    então um marcador jamais colide com o texto de uma consulta. */
const PREFIXO_MARCADOR = "\u0000marcador:";

let promessaBanco = null;
let disponivel = true;
let acertos = 0;
let gravacoes = 0;

/* =========================================================================
   ABERTURA
========================================================================= */
function abrir() {
    if (!promessaBanco) {
        promessaBanco = new Promise(function (resolver, rejeitar) {
            if (typeof indexedDB === "undefined") {
                rejeitar(new Error("IndexedDB indisponível"));
                return;
            }

            const pedido = indexedDB.open(BANCO, 1);
            pedido.onupgradeneeded = function () {
                const bd = pedido.result;
                if (!bd.objectStoreNames.contains(LOJA)) bd.createObjectStore(LOJA);
            };
            pedido.onsuccess = function () { resolver(pedido.result); };
            pedido.onerror = function () { rejeitar(pedido.error); };
        }).catch(function (erro) {
            disponivel = false;
            console.warn("[Painel ENEM] Cache em IndexedDB indisponível:", erro);
            throw erro;
        });
    }
    return promessaBanco;
}

/* =========================================================================
   LEITURA
========================================================================= */

/**
 * Devolve o resultado guardado para um SQL, ou null.
 * Nunca lança: na dúvida, devolve null e a consulta vai para o DuckDB.
 */
export async function ler(sql) {
    if (!disponivel) return null;

    try {
        const bd = await abrir();
        const registro = await promessaDePedido(bd, "readonly", function (loja) {
            return loja.get(sql);
        });

        if (!registro) return null;

        if (registro.versao !== VERSAO || Date.now() - registro.gravadoEm > VALIDADE_MS) {
            apagar(sql);
            return null;
        }

        acertos++;
        return registro.linhas;
    } catch (erro) {
        return null;
    }
}

/* =========================================================================
   ESCRITA — adiada, para não competir com a renderização
========================================================================= */
const fila = [];
let timerFila = null;

export function gravar(sql, linhas) {
    if (!disponivel || !linhas || linhas.length > MAXIMO_LINHAS) return;

    fila.push({ sql, linhas });

    if (!timerFila) {
        timerFila = setTimeout(function () {
            timerFila = null;
            descarregarFila();
        }, 300);
    }
}

async function descarregarFila() {
    const pendentes = fila.splice(0, fila.length);
    if (pendentes.length === 0) return;

    try {
        const bd = await abrir();
        await new Promise(function (resolver, rejeitar) {
            const transacao = bd.transaction(LOJA, "readwrite");
            const loja = transacao.objectStore(LOJA);

            pendentes.forEach(function (item) {
                loja.put({
                    linhas: item.linhas,
                    versao: VERSAO,
                    gravadoEm: Date.now()
                }, item.sql);
            });

            transacao.oncomplete = function () { resolver(); };
            transacao.onerror = function () { rejeitar(transacao.error); };
        });

        gravacoes += pendentes.length;
    } catch (erro) {
        // Cota cheia é o caso comum. Desligar é melhor do que insistir a
        // cada consulta e encher o console de erro.
        disponivel = false;
        console.warn("[Painel ENEM] Cache em IndexedDB desligado após falha de escrita:", erro);
    }
}

function apagar(sql) {
    abrir().then(function (bd) {
        promessaDePedido(bd, "readwrite", function (loja) { return loja.delete(sql); });
    }).catch(function () { /* já registrado em abrir() */ });
}

/* =========================================================================
   EXPORTAÇÃO E IMPORTAÇÃO EM LOTE

   É o que permite publicar os agregados já calculados junto com o site (ver
   infra/agregados.js). A exportação roda uma vez, na máquina de quem publica;
   a importação roda no navegador de cada visitante, em uma transação só.
========================================================================= */

/** Despeja o cache inteiro, pronto para virar o arquivo de agregados. */
export async function exportarTudo() {
    const bd = await abrir();

    const chaves = await promessaDePedido(bd, "readonly", function (loja) {
        return loja.getAllKeys();
    });
    const registros = await promessaDePedido(bd, "readonly", function (loja) {
        return loja.getAll();
    });

    const entradas = [];
    chaves.forEach(function (chave, i) {
        // Marcadores são estado local de cada visitante, não dado a publicar.
        if (String(chave).startsWith(PREFIXO_MARCADOR)) return;
        entradas.push({ sql: chave, linhas: registros[i].linhas });
    });

    return { versao: VERSAO, geradoEm: new Date().toISOString(), entradas };
}

/**
 * Grava um lote de resultados de uma vez. Uma transação só para as ~91
 * entradas, em vez de uma por consulta.
 */
export async function importarLote(entradas) {
    if (!disponivel || !entradas || entradas.length === 0) return 0;

    try {
        const bd = await abrir();
        await new Promise(function (resolver, rejeitar) {
            const transacao = bd.transaction(LOJA, "readwrite");
            const loja = transacao.objectStore(LOJA);

            entradas.forEach(function (item) {
                loja.put({
                    linhas: item.linhas,
                    versao: VERSAO,
                    gravadoEm: Date.now()
                }, item.sql);
            });

            transacao.oncomplete = function () { resolver(); };
            transacao.onerror = function () { rejeitar(transacao.error); };
        });

        gravacoes += entradas.length;
        return entradas.length;
    } catch (erro) {
        console.warn("[Painel ENEM] Falha ao importar os agregados publicados:", erro);
        return 0;
    }
}

/** Versão do formato, para o arquivo publicado poder ser conferido. */
export const VERSAO_CACHE = VERSAO;

/* =========================================================================
   MARCADORES

   Bandeiras de controle guardadas no mesmo armazenamento, para que sigam a
   mesma versão e a mesma validade dos resultados. É assim que o
   pré-aquecimento sabe se já terminou uma vez: contar quantas consultas
   existem não serviria, porque uma carga interrompida no meio deixaria o
   cache parcialmente cheio e o painel concluiria, errado, que já acabou.

   O prefixo que separa marcadores de consultas está declarado junto das
   outras constantes, no topo do arquivo.
========================================================================= */
export async function estaMarcado(nome) {
    return (await ler(PREFIXO_MARCADOR + nome)) !== null;
}

/**
 * Grava um marcador IMEDIATAMENTE, sem passar pela fila adiada das
 * consultas. A decisão de rodar ou não a carga de 3 GB depende deste
 * registro: se ele levasse os 300 ms de atraso da fila, quem perguntasse
 * "já terminou?" logo em seguida receberia não, e o painel baixaria os
 * agregados publicados E recalcularia tudo mesmo assim.
 */
export async function marcar(nome) {
    if (!disponivel) return false;

    try {
        const bd = await abrir();
        await promessaDePedido(bd, "readwrite", function (loja) {
            return loja.put({
                linhas: [{ concluidoEm: new Date().toISOString() }],
                versao: VERSAO,
                gravadoEm: Date.now()
            }, PREFIXO_MARCADOR + nome);
        });
        return true;
    } catch (erro) {
        return false;
    }
}

/* =========================================================================
   MANUTENÇÃO E DIAGNÓSTICO
========================================================================= */
export async function limpar() {
    try {
        const bd = await abrir();
        await promessaDePedido(bd, "readwrite", function (loja) { return loja.clear(); });
        return true;
    } catch (erro) {
        return false;
    }
}

export async function estatisticas() {
    if (!disponivel) return { disponivel: false };

    try {
        const bd = await abrir();
        const total = await promessaDePedido(bd, "readonly", function (loja) {
            return loja.count();
        });
        return { disponivel: true, guardadas: total, acertos, gravacoes };
    } catch (erro) {
        return { disponivel: false };
    }
}

function promessaDePedido(bd, modo, montar) {
    return new Promise(function (resolver, rejeitar) {
        const pedido = montar(bd.transaction(LOJA, modo).objectStore(LOJA));
        pedido.onsuccess = function () { resolver(pedido.result); };
        pedido.onerror = function () { rejeitar(pedido.error); };
    });
}

export default {
    ler, gravar, limpar, estatisticas, marcar, estaMarcado,
    exportarTudo, importarLote, VERSAO_CACHE
};
