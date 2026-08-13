/* =========================================================================
   GERAL.JS — PÁGINA "ESTATÍSTICAS GERAIS"

   Esta página lê dois CSV já agregados (GERAL.csv e REDACAO.csv), algumas
   milhares de linhas ao todo. É a única que trabalha em JavaScript puro, e
   pode: são 7.827 linhas por arquivo, não 413 mil.

   Antes vivia em quatro arquivos (geral.js, cards.js, graficos.js,
   tabelas.js) que só existiam para esta página e só se comunicavam por
   funções globais no window. Agora é um módulo só, com as mesmas quatro
   responsabilidades separadas por seções.

   Duas escolhas de leitura que ficam explícitas aqui:
     · os indicadores e a tabela usam o ANO selecionado;
     · os dois gráficos de evolução ignoram o ano de propósito — são séries
       históricas, e recortá-las por um ano deixaria um ponto só.
========================================================================= */
import { config } from "../nucleo/config.js";
import { registrarGrafico } from "../graficos/painel-grafico.js";
import { corDe } from "../graficos/tema.js";
import { montarIndicadores, definirValores } from "../ui/indicador.js";
import { INDICADORES_POR_PAGINA } from "../dominio/indicadores.js";
import { COLUNAS_POR_PAGINA } from "../dominio/dimensoes.js";
import * as painelFiltros from "../ui/painel-filtros.js";
import * as estado from "../nucleo/estado.js";
import * as ui from "../ui/estados.js";

const ID_PAGINA = "geral";

let base = [];
let baseRedacao = [];
let iniciado = false;
let graficos = null;

/* =========================================================================
   1. CARREGAMENTO
========================================================================= */
export async function iniciar() {
    if (iniciado) return;

    montarIndicadores("indicadoresGeral", INDICADORES_POR_PAGINA.geral);
    registrarGraficos();

    if (!config.podeCarregarDados) {
        ui.avisarSemServidor(ID_PAGINA);
        return;
    }

    ui.carregando(ID_PAGINA, "Carregando as estatísticas gerais…");

    try {
        const [geral, redacao] = await Promise.all([
            baixar("GERAL.csv"),
            baixar("REDACAO.csv")
        ]);

        base = geral;
        baseRedacao = redacao;

        preencherFiltros();

        iniciado = true;
        estado.assinar(ID_PAGINA, atualizar);
        atualizar();
        ui.pronto(ID_PAGINA);
    } catch (erro) {
        console.error("[Painel ENEM] Falha ao carregar os CSV da página Geral:", erro);
        ui.erro(
            ID_PAGINA,
            "Não foi possível carregar os dados agregados",
            "Verifique se GERAL.csv e REDACAO.csv estão em " + config.baseDados
            + ". Detalhe: " + (erro && erro.message ? erro.message : erro)
        );
    }
}

async function baixar(nomeArquivo) {
    const linhas = await config.baixarCsv(nomeArquivo);

    // Tira aspas e espaços sobrando de chaves e valores.
    return linhas.map(function (linha) {
        const limpa = {};
        for (const chave in linha) {
            const valor = linha[chave];
            limpa[chave.replace(/"/g, "").trim()] =
                valor ? String(valor).replace(/"/g, "").trim() : "";
        }
        return limpa;
    });
}

/* =========================================================================
   2. FILTROS
========================================================================= */
function valoresUnicos(coluna) {
    return [...new Set(base.map(function (linha) { return linha[coluna]; }))]
        .filter(function (valor) { return valor !== undefined && String(valor).trim() !== ""; })
        .sort();
}

function preencherFiltros() {
    const porColuna = {};
    COLUNAS_POR_PAGINA.geral.forEach(function (coluna) {
        porColuna[coluna] = valoresUnicos(coluna);
    });

    estado.reconciliar(ID_PAGINA, painelFiltros.opcoesNormalizadas(porColuna));
    painelFiltros.preencherOpcoes(ID_PAGINA, porColuna);

    const anos = valoresUnicos("ANO");
    if (anos.length > 0) estado.definirAnosDisponiveis(anos);
}

/** Uma lista vazia significa "sem recorte", ou seja, aceita tudo. */
function aceita(lista, valor) {
    return !lista || lista.length === 0 || lista.includes(valor);
}

/* =========================================================================
   3. ATUALIZAÇÃO
========================================================================= */
function atualizar() {
    if (base.length === 0) return;

    const recorte = estado.recorte(ID_PAGINA);
    const ano = estado.ano();

    function passaRecorte(linha) {
        return aceita(recorte.estado_prova, linha.estado_prova)
            && aceita(recorte.tipo_escola, linha.tipo_escola)
            && aceita(recorte.dep_adm, linha.dep_adm)
            && aceita(recorte.motivo_status, linha.motivo_status);
    }

    const serieHistorica = base.filter(passaRecorte);
    const doAno = serieHistorica.filter(function (l) { return String(l.ANO) === ano; });
    const redacaoDoAno = baseRedacao.filter(function (l) {
        return String(l.ANO) === ano && passaRecorte(l);
    });

    if (doAno.length === 0) {
        ui.vazio(ID_PAGINA, "Nenhum registro neste recorte",
            "Os filtros selecionados não retornaram linhas para " + ano + ".");
    } else {
        ui.pronto(ID_PAGINA);
    }

    atualizarIndicadores(doAno, serieHistorica);
    atualizarTabelaRedacao(redacaoDoAno);

    const contexto = { ano };
    graficos.inscritos.atualizar(conjuntoPorAno(serieHistorica, [
        { coluna: "total_inscritos", nome: "Inscritos" },
        { coluna: "qtd_participantes", nome: "Presentes" }
    ]), contexto);

    graficos.presenca.atualizar(conjuntoPorAno(serieHistorica, [
        { coluna: "qtd_presenca_dia_1", nome: "Presença Dia 1" },
        { coluna: "qtd_presenca_dia_2", nome: "Presença Dia 2" },
        { coluna: "qtd_redacoes_validas", nome: "Redações Válidas" }
    ]), contexto);
}

/* =========================================================================
   4. INDICADORES
========================================================================= */
function atualizarIndicadores(doAno, serieHistorica) {
    let inscritos = 0, presentes = 0, redacoesValidas = 0, presentesDia1 = 0;

    doAno.forEach(function (linha) {
        inscritos += paraNumero(linha.total_inscritos);
        presentes += paraNumero(linha.qtd_participantes);
        redacoesValidas += paraNumero(linha.qtd_redacoes_validas);
        presentesDia1 += paraNumero(linha.qtd_presenca_dia_1);
    });

    // Média histórica: total de presentes dividido pelo número de edições
    // presentes no recorte.
    let totalHistorico = 0;
    const anos = new Set();
    serieHistorica.forEach(function (linha) {
        totalHistorico += paraNumero(linha.qtd_participantes);
        if (linha.ANO) anos.add(linha.ANO);
    });

    definirValores({
        "geral.inscritos": inscritos,
        "geral.presentes": presentes,
        "geral.participacao": inscritos > 0 ? (presentes / inscritos) * 100 : 0,
        "geral.redacoesValidas": presentesDia1 > 0 ? (redacoesValidas / presentesDia1) * 100 : 0,
        "geral.mediaPorAno": anos.size > 0 ? totalHistorico / anos.size : 0
    });
}

/** Aceita "1.234", "1 234" ou 1234 e devolve sempre um número. */
function paraNumero(valor) {
    if (valor === null || valor === undefined || valor === "") return 0;
    return Number(String(valor).replace(/[^\d]/g, "")) || 0;
}

/* =========================================================================
   5. GRÁFICOS
========================================================================= */
function registrarGraficos() {
    if (graficos) return;

    graficos = {
        inscritos: registrarGrafico({
            id: "graficoInscritos",
            titulo: "Evolução de inscritos e presentes",
            tipos: ["linha", "area", "barra", "empilhada"],
            tipoPadrao: "linha"
        }),
        presenca: registrarGrafico({
            id: "graficoPresenca",
            titulo: "Presença por dia e redações válidas",
            tipos: ["linha", "area", "barra"],
            tipoPadrao: "linha"
        })
    };
}

/** Soma as colunas indicadas agrupando por ano. */
function conjuntoPorAno(linhas, colunas) {
    const resumo = {};

    linhas.forEach(function (linha) {
        const ano = linha.ANO;
        if (!ano) return;

        const acumulado = resumo[ano] || (resumo[ano] = {});
        colunas.forEach(function (coluna) {
            acumulado[coluna.coluna] = (acumulado[coluna.coluna] || 0) + paraNumero(linha[coluna.coluna]);
        });
    });

    const anos = Object.keys(resumo).map(Number).sort(function (a, b) { return a - b; });

    return {
        categorias: anos,
        series: colunas.map(function (coluna) {
            return {
                nome: coluna.nome,
                cor: corDe(coluna.nome),
                valores: anos.map(function (ano) { return resumo[ano][coluna.coluna] || 0; })
            };
        }),
        formato: "inteiro",
        eixoAno: true,
        eixoX: "Ano",
        eixoY: "Pessoas",
        unidade: "pessoas"
    };
}

/* =========================================================================
   6. TABELA DE STATUS DA REDAÇÃO
========================================================================= */
function atualizarTabelaRedacao(linhas) {
    const corpo = document.querySelector("#tabelaRedacao tbody");
    if (!corpo) return;

    const resumo = {};
    let total = 0;

    linhas.forEach(function (linha) {
        const status = linha.motivo_status || "Não Informado";
        const quantidade = paraNumero(linha.numero_pessoas);
        resumo[status] = (resumo[status] || 0) + quantidade;
        total += quantidade;
    });

    const ordenadas = Object.keys(resumo)
        .map(function (status) { return { status, quantidade: resumo[status] }; })
        .sort(function (a, b) { return b.quantidade - a.quantidade; });

    if (ordenadas.length === 0) {
        corpo.innerHTML = '<tr class="tabela-vazia"><td colspan="3">'
            + "Nenhum registro para os filtros selecionados.</td></tr>";
        return;
    }

    corpo.innerHTML = ordenadas.map(function (linha) {
        const proporcao = total > 0 ? (linha.quantidade / total) * 100 : 0;
        return "<tr><td>" + escapar(linha.status) + "</td>"
            + '<td class="num">' + linha.quantidade.toLocaleString("pt-BR") + "</td>"
            + '<td class="num">' + barraPercentual(proporcao) + "</td></tr>";
    }).join("");
}

function barraPercentual(valor) {
    const largura = Math.max(0, Math.min(100, valor));
    const texto = valor.toLocaleString("pt-BR", {
        minimumFractionDigits: 1, maximumFractionDigits: 1
    }) + "%";

    return '<span class="celula-barra">'
        + '<span class="barra-mini" aria-hidden="true"><span style="width:' + largura + '%"></span></span>'
        + "<span>" + texto + "</span></span>";
}

function escapar(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export default { iniciar };
