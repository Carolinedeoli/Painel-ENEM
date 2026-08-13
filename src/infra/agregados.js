/* =========================================================================
   AGREGADOS.JS — RESULTADOS PRÉ-CALCULADOS, PUBLICADOS COM O SITE

   O PROBLEMA QUE ISTO RESOLVE

   Todo visitante recalculava, no próprio navegador, os mesmos ~106 agregados:
   cada ano × cada área de conhecimento, sem filtro. Medido com um contador de
   bytes no servidor, essa carga transferia **cerca de 3 GB** — onze vezes o
   tamanho dos arquivos em disco (276 MB), porque cada consulta reabre o
   Parquet e relê as mesmas colunas (1.530 requisições para um arquivo de
   53 MB). Nesse ritmo, os 100 GB mensais recomendados pelo GitHub Pages
   acabariam com cerca de 33 visitantes.

   Esses agregados são iguais para todo mundo e cabem em arquivos pequenos.
   Calcular uma vez e publicar junto com o site troca ~3 GB por ~25 KB.

   COMO A CARGA É DIVIDIDA

   Os arquivos são separados por ano, e o painel carrega em duas ondas:

     1ª onda, esperada:   comum.json + o ano que está na tela
     2ª onda, em fundo:   os demais anos, enquanto o usuário lê a primeira tela

   Ninguém precisa dos números de 2019 para ver a tela de 2023. A primeira
   pintura espera por uns poucos KB em vez do conjunto inteiro — e a divisão
   passa a valer cada vez mais conforme novas edições entram na base.

   O `comum.json` guarda o que não pertence a um ano só: a evolução da nota
   média por área, que consulta os cinco arquivos numa consulta só.

   QUAL ARQUIVO ATENDE QUAL CONSULTA

   A mesma regra vale na geração e na leitura, e por isso está escrita uma vez
   só, em `anoDaConsulta()`: se o SQL cita exatamente um `ENEM_<ano>.parquet`,
   o resultado é daquele ano; se cita vários (ou nenhum), é comum. Se as duas
   pontas discordassem, o arquivo existiria e simplesmente nunca daria acerto.

   O QUE FICA DE FORA, E POR QUÊ

   Só o previsível entra aqui: ano e área são finitos e poucos. Combinações de
   FILTRO são infinitas — continuam indo ao DuckDB na hora, pagas apenas por
   quem de fato filtra. É a divisão certa: o caminho da apresentação fica
   instantâneo; a exploração livre continua possível.

   COMO GERAR OS ARQUIVOS — veja o README, seção "Antes de publicar".
========================================================================= */
import { config } from "../nucleo/config.js";
import { importarLote, estaMarcado, marcar, exportarTudo, VERSAO_CACHE }
    from "./cache-consultas.js";
import * as estado from "../nucleo/estado.js";

const PASTA = "agregados/";
const COMUM = "comum";
const MARCADOR = "carga-completa";

/** Uma promessa por arquivo já pedido — nenhum é baixado duas vezes. */
const promessas = new Map();

let promessaBase = null;
let situacaoAtual = { origem: "—", arquivos: 0, entradas: 0 };

/* =========================================================================
   CLASSIFICAÇÃO — a regra que geração e leitura compartilham
========================================================================= */

/**
 * A qual arquivo pertence o resultado de um SQL.
 * @returns {string} o ano ("2023") ou COMUM
 */
export function anoDaConsulta(sql) {
    const citados = new Set();
    let achado;

    // Os Parquet trazem o ano no próprio nome do arquivo.
    const porArquivo = /ENEM_(\d{4})\.parquet/g;
    while ((achado = porArquivo.exec(sql)) !== null) citados.add(achado[1]);

    // A base de redações zeradas é uma tabela só, com o ano no WHERE.
    const porColuna = /\bANO\s*=\s*(\d{4})\b/g;
    while ((achado = porColuna.exec(sql)) !== null) citados.add(achado[1]);

    return citados.size === 1 ? [...citados][0] : COMUM;
}

/* =========================================================================
   1ª ONDA — o que a primeira tela precisa
========================================================================= */

/**
 * Garante o mínimo para a tela atual: o arquivo comum e o ano selecionado.
 * Idempotente — todas as consultas esperam a mesma promessa.
 */
export function semearBase() {
    if (!promessaBase) promessaBase = carregarBase();
    return promessaBase;
}

async function carregarBase() {
    if (!config.podeCarregarDados) return situacaoAtual;

    // Já semeado numa visita anterior: nem chega a pedir os arquivos.
    if (await estaMarcado(MARCADOR)) {
        situacaoAtual = { origem: "cache-local", arquivos: 0, entradas: 0 };
        return situacaoAtual;
    }

    const [comum, doAno] = await Promise.all([
        carregarArquivo(COMUM),
        carregarArquivo(estado.ano())
    ]);

    if (comum === null && doAno === null) {
        // Não é erro: o painel funciona sem os arquivos, apenas mais caro.
        // Quem cuida desse caso é o pré-aquecimento em segundo plano.
        situacaoAtual = { origem: "ausente", arquivos: 0, entradas: 0 };
        return situacaoAtual;
    }

    situacaoAtual = {
        origem: "publicado",
        arquivos: [comum, doAno].filter(function (n) { return n !== null; }).length,
        entradas: (comum || 0) + (doAno || 0)
    };

    return situacaoAtual;
}

/* =========================================================================
   2ª ONDA — os demais anos, em segundo plano
========================================================================= */

/**
 * Carrega os anos que faltam. Chamado depois da primeira pintura, sem que
 * ninguém espere por ele.
 */
export async function carregarRestante() {
    const base = await semearBase();
    if (base.origem !== "publicado") return situacaoAtual;

    const restantes = estado.anosDisponiveis()
        .filter(function (ano) { return !promessas.has(ano); });

    const contagens = await Promise.all(restantes.map(carregarArquivo));
    const carregados = contagens.filter(function (n) { return n !== null; });

    situacaoAtual = {
        origem: "publicado",
        arquivos: situacaoAtual.arquivos + carregados.length,
        entradas: situacaoAtual.entradas
            + carregados.reduce(function (s, n) { return s + n; }, 0)
    };

    // Só agora o cache está completo — antes disso, um marcador faria a
    // próxima visita pular arquivos que nunca chegaram a ser baixados.
    if (carregados.length === restantes.length) await marcar(MARCADOR);

    console.log(
        "%c[Painel ENEM]%c " + situacaoAtual.entradas + " agregados pré-calculados em "
        + situacaoAtual.arquivos + " arquivos. Trocar de ano ou de área não lê Parquet.",
        "font-weight:bold;color:#1baf7a", "color:inherit"
    );

    return situacaoAtual;
}

/**
 * Garante que o arquivo capaz de atender esta consulta já esteja no cache.
 * Chamado pelo DuckDB antes de decidir se precisa abrir o Parquet — sem
 * isso, trocar para um ano cuja 2ª onda ainda não chegou cairia direto no
 * arquivo de dados, que é justamente o que se quer evitar.
 */
export async function garantirParaConsulta(sql) {
    const base = await semearBase();
    if (base.origem !== "publicado") return;

    const ano = anoDaConsulta(sql);
    if (ano !== COMUM) await carregarArquivo(ano);
}

/* =========================================================================
   DOWNLOAD E IMPORTAÇÃO DE UM ARQUIVO
========================================================================= */

/** @returns {Promise<number|null>} entradas gravadas, ou null se não existe */
function carregarArquivo(nome) {
    if (!promessas.has(nome)) promessas.set(nome, baixarEImportar(nome));
    return promessas.get(nome);
}

async function baixarEImportar(nome) {
    let dados;

    try {
        const resposta = await fetch(config.arquivo(PASTA + nome + ".json"));
        if (!resposta.ok) return null;
        dados = await resposta.json();
    } catch (erro) {
        return null;
    }

    if (!dados || dados.versao !== VERSAO_CACHE || !Array.isArray(dados.entradas)) {
        console.warn(
            "[Painel ENEM] agregados/" + nome + ".json foi gerado para a versão "
            + (dados && dados.versao) + ", mas o painel espera a " + VERSAO_CACHE
            + ". Ignorando — gere os arquivos de novo com PainelENEM.gerarAgregados()."
        );
        return null;
    }

    return await importarLote(dados.entradas);
}

/** Diagnóstico no console. */
export function situacao() {
    return situacaoAtual;
}

/* =========================================================================
   GERAÇÃO — roda na máquina de quem publica, não no visitante
========================================================================= */

/**
 * A base de redações zeradas não faz parte do conjunto publicado: ela vive
 * numa tabela que só existe depois de baixar 39 MB, e o pré-aquecimento a
 * deixa de fora de propósito. Consultas dela podem estar no cache local de
 * quem visitou a aba — mas não devem ir para o arquivo.
 */
function ehDoPreaquecimento(sql) {
    return !/\bredacao_zerada\b/.test(sql);
}

/**
 * Separa o cache atual nos arquivos a publicar.
 * @returns {Map<string, object>} nome do arquivo → conteúdo
 */
export async function montarArquivos() {
    const conteudo = await exportarTudo();
    const porArquivo = new Map();

    conteudo.entradas.forEach(function (entrada) {
        // Só o que o pré-aquecimento produz entra nos arquivos publicados.
        // Sem este filtro, o resultado dependeria de quais abas quem gerou
        // por acaso visitou — e regerar daria um conjunto diferente.
        if (!ehDoPreaquecimento(entrada.sql)) return;

        const nome = anoDaConsulta(entrada.sql);

        if (!porArquivo.has(nome)) {
            porArquivo.set(nome, {
                versao: conteudo.versao,
                geradoEm: conteudo.geradoEm,
                entradas: []
            });
        }
        porArquivo.get(nome).entradas.push(entrada);
    });

    return porArquivo;
}

/**
 * Despeja o cache atual como arquivos de agregados e oferece os downloads.
 * Rode depois que a carga completa terminar.
 *
 * São vários arquivos, então o navegador pede permissão para baixar mais de
 * um — aceite. Salve todos em dados/agregados/.
 */
export async function gerar() {
    const arquivos = await montarArquivos();

    if (arquivos.size === 0) {
        console.warn(
            "[Painel ENEM] O cache está vazio — não há o que gerar. "
            + "Espere PainelENEM.preaquecimento() chegar a 100% e tente de novo."
        );
        return null;
    }

    const resumo = [];

    for (const [nome, dados] of arquivos) {
        const texto = JSON.stringify(dados);
        const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));

        const link = document.createElement("a");
        link.href = url;
        link.download = nome + ".json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);

        resumo.push({ arquivo: nome + ".json", entradas: dados.entradas.length,
                      kb: Math.round(texto.length / 1024) });

        // Um respiro entre downloads: em rajada o navegador descarta os
        // últimos sem avisar.
        await new Promise(function (r) { setTimeout(r, 350); });
    }

    console.log(
        "%c[Painel ENEM]%c " + arquivos.size + " arquivos exportados. "
        + "Salve todos em dados/agregados/ e publique junto com o site.",
        "font-weight:bold;color:#2a78d6", "color:inherit"
    );
    console.table(resumo);

    return resumo;
}

export default {
    semearBase, carregarRestante, garantirParaConsulta,
    situacao, gerar, montarArquivos, anoDaConsulta
};
