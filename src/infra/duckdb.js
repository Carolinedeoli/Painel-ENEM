/* =========================================================================
   DUCKDB.JS — MOTOR DE CONSULTAS ÚNICO DO PAINEL

   Uma instância só, criada sob demanda na primeira consulta, com os Parquet
   registrados em modo de leitura parcial (directIO) para que o DuckDB busque
   apenas os trechos que a consulta precisa — a diferença entre alguns
   megabytes e ~290 MB por sessão.

   Duas responsabilidades além de conectar:

   1. CACHE DE CONSULTAS. Toda consulta passa por um cache com chave no texto
      do SQL (ver nucleo/cache.js). A base é imutável, então o mesmo SQL tem
      sempre o mesmo resultado.

   2. A BASE DE REDAÇÕES ZERADAS TAMBÉM VIVE AQUI. Ela é um CSV de 39,7 MB
      com 413 mil linhas. A página carregava esse arquivo com o PapaParse e
      guardava 413 mil objetos JavaScript na memória, refazendo um
      `Array.filter` sobre todos eles a cada clique em filtro. Era o gargalo
      mais caro do painel — centenas de MB de heap e um laço completo por
      interação. Agora o CSV é carregado uma vez para dentro do DuckDB, onde
      vira uma tabela colunar, e a filtragem acontece no motor, junto com o
      resto do painel e com o mesmo cache.
========================================================================= */
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm";
import { config } from "../nucleo/config.js";
import { criarCache } from "../nucleo/cache.js";
import * as cachePersistente from "./cache-consultas.js";
import * as agregados from "./agregados.js";

export const ANOS_DISPONIVEIS = ["2019", "2020", "2021", "2022", "2023"];

/** Nome lógico do Parquet de um ano dentro do DuckDB. */
export function tabelaDoAno(ano) {
    return `ENEM_${ano}.parquet`;
}

const ARQUIVO_REDACAO = "redacao_zerada_total.csv";

/** Nome da tabela materializada com as redações zeradas. */
export const TABELA_REDACAO = "redacao_zerada";

const cacheConsultas = criarCache({ nome: "consultas", teto: 80 });

let promessaConexao = null;
let promessaRedacao = null;

/* =========================================================================
   CONEXÃO
========================================================================= */

/**
 * Devolve a conexão compartilhada, criando-a na primeira chamada. Chamadas
 * simultâneas recebem a mesma promessa, então a inicialização nunca acontece
 * duas vezes.
 *
 * @param {(mensagem: string) => void} [aoProgredir]
 */
export function obterConexao(aoProgredir) {
    if (!promessaConexao) {
        promessaConexao = inicializar(aoProgredir).catch(function (erro) {
            // Sem isso, uma falha de rede deixaria a promessa rejeitada em
            // cache e nenhuma aba conseguiria tentar de novo.
            promessaConexao = null;
            throw erro;
        });
    }
    return promessaConexao;
}

let bancoGlobal = null;

async function inicializar(aoProgredir) {
    const avisar = aoProgredir || function () {};

    if (!config.podeCarregarDados) throw new ErroSemServidor();

    avisar("Carregando o motor de consultas…");

    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());

    const blob = new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript"
    });
    const urlWorker = URL.createObjectURL(blob);

    const worker = new Worker(urlWorker);
    const db = new duckdb.AsyncDuckDB(
        new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING),
        worker
    );
    await db.instantiate(bundle.mainModule, bundle.pthreadModule);
    URL.revokeObjectURL(urlWorker);

    bancoGlobal = db;
    const conexao = await db.connect();

    avisar("Conectando aos arquivos de dados…");

    for (const ano of ANOS_DISPONIVEIS) {
        const nome = tabelaDoAno(ano);
        await db.registerFileURL(nome, config.arquivo(nome), duckdb.DuckDBDataProtocol.HTTP, true);
    }

    // Diagnóstico: sem suporte a Range o DuckDB volta a baixar tudo. Vale
    // avisar no console, porque o "python -m http.server" tem esse problema.
    config.suportaRange(tabelaDoAno(ANOS_DISPONIVEIS[0])).then(function (temRange) {
        if (!temRange) {
            console.warn(
                "[Painel ENEM] O servidor atual não aceita requisições parciais (Range). "
                + "O DuckDB vai baixar os arquivos Parquet inteiros, o que deixa o painel "
                + 'bem mais lento. No ambiente local, use "node servidor-local.mjs".'
            );
        }
    });

    // Confirma que os arquivos existem de fato antes de liberar as abas.
    try {
        await conexao.query(`SELECT 1 FROM '${tabelaDoAno("2023")}' LIMIT 1`);
    } catch (erro) {
        throw new ErroDadosIndisponiveis(config.arquivo(tabelaDoAno("2023")), erro);
    }

    return conexao;
}

/* =========================================================================
   TABELA DE REDAÇÕES ZERADAS

   Carregada uma vez por sessão, só quando a aba é aberta. As colunas que o
   painel não usa (as cinco competências, notas, NU_INSCRICAO, TP_LINGUA…)
   ficam de fora já na leitura: não adianta materializar 30 colunas para usar
   14.

   Os códigos vêm do CSV como texto, com "NA" onde falta valor. O TRY_CAST
   normaliza os dois problemas de uma vez: "NA" vira NULL e o código vira
   número, do mesmo tipo que a coluna equivalente nos Parquet. É isso que
   permite a esta tabela usar exatamente o mesmo montarWhere() das outras
   páginas, sem nenhum caso especial.
========================================================================= */
const COLUNAS_REDACAO_NUMERICAS = [
    "TP_FAIXA_ETARIA", "TP_ESTADO_CIVIL", "TP_COR_RACA",
    "TP_ST_CONCLUSAO", "tipo_escola", "IN_TREINEIRO", "dep_adm", "redacao"
];

const COLUNAS_REDACAO_TEXTO = [
    "estado_prova", "TP_SEXO", "escolaridade_mae", "renda_familiar", "internet"
];

/**
 * Garante que a tabela de redações zeradas existe. Idempotente: chamadas
 * seguintes recebem a mesma promessa.
 *
 * @param {(mensagem: string) => void} [aoProgredir]
 */
export function garantirTabelaRedacao(aoProgredir) {
    if (!promessaRedacao) {
        promessaRedacao = carregarRedacao(aoProgredir).catch(function (erro) {
            promessaRedacao = null;
            throw erro;
        });
    }
    return promessaRedacao;
}

async function carregarRedacao(aoProgredir) {
    const avisar = aoProgredir || function () {};
    const conexao = await obterConexao(avisar);

    avisar("Baixando a base de redações zeradas (39 MB, uma vez por sessão)…");

    await bancoGlobal.registerFileURL(
        ARQUIVO_REDACAO,
        config.arquivo(ARQUIVO_REDACAO),
        duckdb.DuckDBDataProtocol.HTTP,
        false
    );

    avisar("Organizando as redações zeradas…");

    const numericas = COLUNAS_REDACAO_NUMERICAS
        .map(function (coluna) { return `TRY_CAST(${coluna} AS DOUBLE) AS ${coluna}`; })
        .join(", ");

    const textos = COLUNAS_REDACAO_TEXTO
        .map(function (coluna) { return `NULLIF(NULLIF(${coluna}, 'NA'), '') AS ${coluna}`; })
        .join(", ");

    await conexao.query(`
        CREATE OR REPLACE TABLE ${TABELA_REDACAO} AS
        SELECT TRY_CAST(ANO AS INTEGER) AS ANO, ${textos}, ${numericas}
        FROM read_csv_auto('${ARQUIVO_REDACAO}', all_varchar=true)
        WHERE ANO IS NOT NULL
    `);

    // Libera o texto bruto do CSV: a partir daqui só a tabela importa.
    try {
        await bancoGlobal.dropFile(ARQUIVO_REDACAO);
    } catch (erro) {
        /* versões antigas não expõem dropFile — seguir em frente */
    }

    return TABELA_REDACAO;
}

/* =========================================================================
   CONSULTAS
========================================================================= */

/**
 * Executa uma consulta e devolve linhas como objetos JavaScript comuns, já
 * convertendo BigInt (que o Arrow devolve em COUNT/SUM) para Number.
 *
 * São três níveis, do mais barato para o mais caro:
 *
 *   1. memória   nucleo/cache.js — instantâneo, morre com a aba
 *   2. IndexedDB infra/cache-consultas.js — milissegundos, sobrevive à sessão
 *   3. DuckDB    varredura do Parquet, segundos na primeira vez
 *
 * A chave dos dois caches é o próprio texto do SQL; o cabeçalho de
 * nucleo/cache.js explica por que essa escolha resolve sozinha o caso das
 * consultas que não dependem do filtro que mudou.
 */
export function consultar(sql) {
    return cacheConsultas.memo(sql, function () { return buscar(sql); });
}

async function buscar(sql) {
    // Espera o arquivo de agregados capaz de atender esta consulta entrar no
    // cache antes de decidir se ela precisa mesmo do Parquet. Sem isso, uma
    // consulta poderia passar na frente da carga e ir ao arquivo de dados
    // buscar algo que já veio pronto com o site.
    await agregados.garantirParaConsulta(sql);

    const guardado = await cachePersistente.ler(sql);
    if (guardado) return guardado;

    const linhas = await executar(sql);
    cachePersistente.gravar(sql, linhas);
    return linhas;
}

/** Igual a consultar(), mas devolve apenas a primeira linha (ou null). */
export async function consultarPrimeira(sql) {
    const linhas = await consultar(sql);
    return linhas.length > 0 ? linhas[0] : null;
}

async function executar(sql) {
    const conexao = await obterConexao();
    const resultado = await conexao.query(sql);

    return resultado.toArray().map(function (linha) {
        const objeto = linha.toJSON();
        for (const chave in objeto) {
            if (typeof objeto[chave] === "bigint") objeto[chave] = Number(objeto[chave]);
        }
        return objeto;
    });
}

/** Estatísticas dos dois caches, para diagnóstico no console. */
export async function estatisticasCache() {
    return {
        memoria: cacheConsultas.estatisticas(),
        indexedDb: await cachePersistente.estatisticas()
    };
}

/** Descarta o cache persistente — use ao republicar os arquivos de dados. */
export function limparCachePersistente() {
    return cachePersistente.limpar();
}

/** Verdadeiro quando a tabela de redações zeradas já foi materializada. */
export function redacaoCarregada() {
    return promessaRedacao !== null;
}

/* =========================================================================
   OPÇÕES DE FILTRO

   As doze listas de um painel vêm em uma consulta só, com UNION ALL. Antes
   eram doze idas ao DuckDB em sequência, cada uma varrendo o arquivo do
   começo. Como o texto do SQL só depende da fonte e das colunas, o cache
   devolve as opções de um ano já visitado sem tocar no arquivo de novo.
========================================================================= */

/**
 * @param {string} fonte    nome da tabela ou do arquivo ('ENEM_2023.parquet')
 * @param {string[]} colunas
 * @param {string} [filtroExtra]  condição adicional, ex.: "ANO = 2023"
 * @returns {Promise<Record<string, Array>>} valores por coluna, já ordenados
 */
export async function opcoesDeFiltro(fonte, colunas, filtroExtra) {
    const onde = filtroExtra ? `AND ${filtroExtra}` : "";

    const selects = colunas.map(function (coluna) {
        return `SELECT DISTINCT CAST(${coluna} AS VARCHAR) AS valor, '${coluna}' AS coluna `
             + `FROM ${fonte} WHERE ${coluna} IS NOT NULL ${onde}`;
    }).join(" UNION ALL ");

    const linhas = await consultar(`SELECT * FROM (${selects}) ORDER BY coluna, valor`);

    const porColuna = {};
    colunas.forEach(function (coluna) { porColuna[coluna] = []; });
    linhas.forEach(function (linha) {
        (porColuna[linha.coluna] || (porColuna[linha.coluna] = [])).push(linha.valor);
    });

    return porColuna;
}

/* =========================================================================
   MONTAGEM DO WHERE

   A entrada é o recorte guardado em nucleo/estado.js, e não o DOM. Isso é o
   que garante que nenhum componente possa consultar com um filtro diferente
   do que a tela está mostrando.
========================================================================= */

/** Colunas que o painel aceita filtrar. Nada fora desta lista entra no SQL. */
const COLUNAS_PERMITIDAS = new Set([
    "estado_prova", "TP_SEXO", "TP_COR_RACA", "TP_ESTADO_CIVIL", "TP_FAIXA_ETARIA",
    "TP_ST_CONCLUSAO", "tipo_escola", "dep_adm", "IN_TREINEIRO",
    "escolaridade_mae", "renda_familiar", "internet", "redacao", "motivo_status"
]);

/**
 * Escapa um literal de texto para uso em SQL. Necessário porque os valores
 * dos filtros vêm dos próprios dados e podem conter apóstrofo.
 */
export function literal(valor) {
    return "'" + String(valor).replace(/'/g, "''") + "'";
}

/**
 * Monta a cláusula WHERE a partir de um recorte { coluna: [valores] }.
 * Valores de uma mesma coluna são combinados com OR; colunas diferentes,
 * com AND.
 *
 * As colunas são conferidas contra uma lista fixa, então um id de filtro
 * escrito errado vira aviso visível no console, e não SQL malformado.
 */
export function montarWhere(recorte) {
    let sql = "WHERE 1=1";

    // Ordenar as colunas mantém o texto do SQL estável para o mesmo recorte,
    // independentemente da ordem em que o usuário clicou — o que faz o cache
    // acertar em vez de guardar duas entradas para a mesma coisa.
    Object.keys(recorte || {}).sort().forEach(function (coluna) {
        if (!COLUNAS_PERMITIDAS.has(coluna)) {
            console.warn("[Painel ENEM] Coluna de filtro desconhecida, ignorada:", coluna);
            return;
        }

        const valores = recorte[coluna];
        if (!valores || valores.length === 0) return;

        const lista = valores.slice().sort().map(function (valor) {
            // Códigos numéricos estão gravados como número; os demais
            // (UF, letras do questionário) como texto.
            return valor !== "" && !isNaN(valor) ? Number(valor) : literal(valor);
        });

        sql += ` AND ${coluna} IN (${lista.join(",")})`;
    });

    return sql;
}

/* =========================================================================
   ERROS COM MENSAGEM PRONTA PARA A TELA
========================================================================= */
export class ErroSemServidor extends Error {
    constructor() {
        super("O painel precisa de um servidor HTTP para ler os arquivos Parquet.");
        this.name = "ErroSemServidor";
        this.semServidor = true;
    }
}

export class ErroDadosIndisponiveis extends Error {
    constructor(url, causa) {
        super("Não foi possível ler os dados em " + url);
        this.name = "ErroDadosIndisponiveis";
        this.url = url;
        this.causa = causa;
    }
}
