/* =========================================================================
   PREFERENCIAS.JS — PERSISTÊNCIA DAS ESCOLHAS DO USUÁRIO (SQLite)

   O painel é um site estático: não há backend onde guardar preferência de
   usuário. Para o MVP, a persistência é um banco SQLite de verdade rodando
   no próprio navegador (sql.js, o SQLite compilado para WebAssembly), com o
   arquivo do banco guardado no IndexedDB entre as visitas.

   Por que SQLite e não só localStorage:
     · é um banco real, com esquema declarado — dá para acrescentar colunas,
       consultar e migrar sem inventar um formato de string;
     · o mesmo arquivo pode ser exportado e inspecionado com qualquer
       ferramenta SQLite;
     · o dia em que o painel ganhar backend, a tabela vai junto sem mudar de
       forma.

   Três cuidados para isso não custar desempenho — que é o problema número um
   deste projeto:

     1. CARGA PREGUIÇOSA. O wasm do SQLite (~1,2 MB) só é baixado quando uma
        preferência é lida ou escrita pela primeira vez, e em paralelo com o
        carregamento dos dados da página, nunca antes da primeira pintura.
     2. LEITURA SÍNCRONA. Depois de carregado, tudo vive num Map em memória.
        Nenhum gráfico espera consulta de banco para decidir como se desenhar.
     3. ESCRITA AGRUPADA. Gravar no IndexedDB é adiado e agrupado: trocar
        três vezes o tipo de um gráfico grava uma vez.

   Se o wasm não puder ser carregado (offline, CDN bloqueado), o módulo cai
   para localStorage automaticamente e o painel continua funcionando. A
   preferência é conforto, não pode derrubar a tela.
========================================================================= */

const URL_SQLJS = "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/";
const BANCO_IDB = "painel-enem";
const LOJA_IDB = "sqlite";
const CHAVE_IDB = "preferencias.db";
const CHAVE_LOCAL = "painel-enem:preferencias";
const ESPERA_GRAVACAO = 400;   // ms de agrupamento das escritas

const memoria = new Map();

let bd = null;                 // instância sql.js, quando disponível
let promessaInicio = null;
let timerGravacao = null;
let modo = "nenhum";           // 'sqlite' | 'local' | 'nenhum'

/* =========================================================================
   API PÚBLICA
========================================================================= */

/**
 * Carrega as preferências. Idempotente — pode ser chamada por qualquer
 * página, quantas vezes for.
 */
export function iniciar() {
    if (!promessaInicio) promessaInicio = carregar();
    return promessaInicio;
}

/**
 * Lê uma preferência. Síncrona de propósito: é chamada na hora de desenhar
 * um gráfico, e um await ali significaria um quadro a mais de tela vazia.
 * Antes de iniciar() terminar, devolve o padrão.
 */
export function obter(chave, padrao) {
    return memoria.has(chave) ? memoria.get(chave) : padrao;
}

/** Grava uma preferência. A escrita em disco é adiada e agrupada. */
export function definir(chave, valor) {
    if (memoria.get(chave) === valor) return;

    memoria.set(chave, valor);

    if (bd) {
        try {
            bd.run("INSERT INTO preferencias (chave, valor) VALUES (?, ?) "
                 + "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [chave, String(valor)]);
        } catch (erro) {
            console.warn("[Painel ENEM] Falha ao gravar preferência no SQLite:", erro);
        }
    }

    agendarGravacao();
}

/** Apaga todas as preferências — útil em teste e no console. */
export async function limpar() {
    memoria.clear();
    if (bd) bd.run("DELETE FROM preferencias");
    agendarGravacao();
}

/** Diagnóstico: onde as preferências estão sendo guardadas. */
export function modoAtual() {
    return modo;
}

/* =========================================================================
   CARGA
========================================================================= */
async function carregar() {
    try {
        const initSqlJs = await carregarBiblioteca();
        const SQL = await initSqlJs({ locateFile: function (arquivo) { return URL_SQLJS + arquivo; } });

        const bytes = await lerDoIndexedDb();
        bd = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();

        bd.run(`CREATE TABLE IF NOT EXISTS preferencias (
                    chave TEXT PRIMARY KEY,
                    valor TEXT NOT NULL
                )`);

        const resultado = bd.exec("SELECT chave, valor FROM preferencias");
        if (resultado.length > 0) {
            resultado[0].values.forEach(function (linha) {
                memoria.set(linha[0], linha[1]);
            });
        }

        modo = "sqlite";
    } catch (erro) {
        console.warn(
            "[Painel ENEM] SQLite indisponível; as preferências vão para o localStorage.",
            erro
        );
        usarLocalStorage();
    }

    return memoria;
}

function carregarBiblioteca() {
    if (window.initSqlJs) return Promise.resolve(window.initSqlJs);

    return new Promise(function (resolver, rejeitar) {
        const script = document.createElement("script");
        script.src = URL_SQLJS + "sql-wasm.js";
        script.onload = function () { resolver(window.initSqlJs); };
        script.onerror = function () { rejeitar(new Error("não foi possível carregar o sql.js")); };
        document.head.appendChild(script);
    });
}

function usarLocalStorage() {
    modo = "local";
    bd = null;
    try {
        const bruto = localStorage.getItem(CHAVE_LOCAL);
        if (bruto) {
            const objeto = JSON.parse(bruto);
            for (const chave in objeto) memoria.set(chave, objeto[chave]);
        }
    } catch (erro) {
        modo = "nenhum";
    }
}

/* =========================================================================
   GRAVAÇÃO
========================================================================= */
function agendarGravacao() {
    clearTimeout(timerGravacao);
    timerGravacao = setTimeout(gravar, ESPERA_GRAVACAO);
}

async function gravar() {
    if (modo === "sqlite" && bd) {
        try {
            await escreverNoIndexedDb(bd.export());
            return;
        } catch (erro) {
            console.warn("[Painel ENEM] Falha ao persistir o SQLite; caindo para localStorage.", erro);
            usarLocalStorage();
        }
    }

    if (modo === "nenhum") return;

    try {
        const objeto = {};
        memoria.forEach(function (valor, chave) { objeto[chave] = valor; });
        localStorage.setItem(CHAVE_LOCAL, JSON.stringify(objeto));
    } catch (erro) {
        /* modo privado, cota cheia — a preferência simplesmente não dura */
    }
}

/* =========================================================================
   INDEXEDDB — o arquivo do banco é um blob binário só
========================================================================= */
function abrirIndexedDb() {
    return new Promise(function (resolver, rejeitar) {
        const pedido = indexedDB.open(BANCO_IDB, 1);
        pedido.onupgradeneeded = function () {
            pedido.result.createObjectStore(LOJA_IDB);
        };
        pedido.onsuccess = function () { resolver(pedido.result); };
        pedido.onerror = function () { rejeitar(pedido.error); };
    });
}

async function lerDoIndexedDb() {
    const banco = await abrirIndexedDb();
    return new Promise(function (resolver, rejeitar) {
        const transacao = banco.transaction(LOJA_IDB, "readonly");
        const pedido = transacao.objectStore(LOJA_IDB).get(CHAVE_IDB);
        pedido.onsuccess = function () { resolver(pedido.result || null); };
        pedido.onerror = function () { rejeitar(pedido.error); };
    });
}

async function escreverNoIndexedDb(bytes) {
    const banco = await abrirIndexedDb();
    return new Promise(function (resolver, rejeitar) {
        const transacao = banco.transaction(LOJA_IDB, "readwrite");
        transacao.objectStore(LOJA_IDB).put(bytes, CHAVE_IDB);
        transacao.oncomplete = function () { resolver(); };
        transacao.onerror = function () { rejeitar(transacao.error); };
    });
}

export default { iniciar, obter, definir, limpar, modoAtual };
