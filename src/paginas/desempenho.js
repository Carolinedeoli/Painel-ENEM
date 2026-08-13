/* =========================================================================
   DESEMPENHO.JS — PÁGINA "DESEMPENHO"

   Consulta os Parquet pelo DuckDB compartilhado, no primeiro acesso à aba.

   SOBRE O CUSTO DAS CONSULTAS. Seis consultas alimentam a página, e elas não
   dependem todas das mesmas coisas:

     · resumo, estados e conclusão   dependem do ano e do recorte;
     · média por área e ano          depende só do recorte — e varre os CINCO
                                     arquivos, sendo a consulta mais cara;
     · as duas curvas de densidade   dependem também da área escolhida.

   Como o cache tem por chave o texto do SQL (ver nucleo/cache.js), trocar a
   área de conhecimento refaz apenas as duas curvas: o SQL das outras quatro
   não muda de texto, então elas voltam prontas. Antes, cada troca de área
   refazia a varredura dos cinco arquivos sem necessidade nenhuma.
========================================================================= */
import {
    obterConexao, consultar, consultarPrimeira, montarWhere, tabelaDoAno,
    opcoesDeFiltro, ANOS_DISPONIVEIS
} from "../infra/duckdb.js";
import { sincronizarOpcoes } from "../dominio/filtros-servico.js";
import { COLUNAS_POR_PAGINA } from "../dominio/dimensoes.js";
import { registrarGrafico } from "../graficos/painel-grafico.js";
import { corDe, serie } from "../graficos/tema.js";
import { montarIndicadores, definirValores } from "../ui/indicador.js";
import { INDICADORES_POR_PAGINA } from "../dominio/indicadores.js";
import {
    AREAS, AREA_GERAL, OPCOES_AREA, expressaoDaArea, nomeDaArea, rotuloDoEixo,
    TEM_TODAS_AS_NOTAS, EXPR_PROFICIENTE
} from "../dominio/areas.js";
import { traduzir, normalizarCodigo, DEP_ADM } from "../dominio/rotulos.js";
import { barra, formatarDecimal, escapar } from "./perfil-comum.js";
import { config } from "../nucleo/config.js";
import * as estado from "../nucleo/estado.js";
import * as ui from "../ui/estados.js";

const ID_PAGINA = "desempenho";

let iniciado = false;
let graficos = null;

/* =========================================================================
   1. INICIALIZAÇÃO
========================================================================= */
export async function iniciar() {
    if (iniciado) return;

    montarIndicadores("indicadoresDesempenho", INDICADORES_POR_PAGINA.desempenho);
    montarSeletorArea();
    registrarGraficos();

    if (!config.podeCarregarDados) {
        ui.avisarSemServidor(ID_PAGINA);
        return;
    }

    ui.carregando(ID_PAGINA, "Preparando a consulta aos microdados…",
        "Na primeira vez o navegador baixa o motor DuckDB. Depois disso a troca de "
        + "filtros é rápida — os resultados já vistos ficam em memória.");

    // A primeira pintura NÃO espera o motor subir — ver o comentário
    // equivalente em perfil.js.
    obterConexao(function (mensagem) { ui.progresso(ID_PAGINA, mensagem); })
        .catch(function () {
            // A falha aparece na tela pelo caminho da consulta, em atualizar().
        });

    iniciado = true;
    estado.assinar(ID_PAGINA, atualizar);
    estado.revalidar(ID_PAGINA);
}

/**
 * A área de conhecimento não é um recorte da população: ela troca a métrica
 * analisada. Por isso fica visível na página, ao lado dos gráficos que ela
 * governa, e não escondida na gaveta de filtros junto dos recortes.
 */
function montarSeletorArea() {
    const select = document.getElementById("seletorArea");
    if (!select || select.dataset.pronto) return;

    select.innerHTML = OPCOES_AREA.map(function (opcao) {
        return '<option value="' + opcao.valor + '">' + escapar(opcao.rotulo) + "</option>";
    }).join("");

    select.value = estado.area();
    select.dataset.pronto = "1";
    select.addEventListener("change", function () { estado.definirArea(select.value); });

    // Se a área for alterada por outro caminho (limpar filtros), o select
    // acompanha — o estado continua sendo a única verdade.
    estado.observar(function () {
        if (select.value !== estado.area()) select.value = estado.area();
    });
}

function registrarGraficos() {
    if (graficos) return;

    graficos = {
        densidade: registrarGrafico({
            id: "graficoDensidade",
            titulo: function (ctx) { return "Densidade de desempenho — " + nomeDaArea(ctx.area); },
            tipos: ["area", "linha", "barra"],
            tipoPadrao: "area"
        }),
        densidadeDep: registrarGrafico({
            id: "graficoDensidadeDepAdm",
            titulo: function (ctx) {
                return "Densidade por dependência — " + nomeDaArea(ctx.area);
            },
            tipos: ["linha", "area", "barra"],
            tipoPadrao: "linha"
        }),
        mediaAno: registrarGrafico({
            id: "graficoNotaMediaAno",
            titulo: "Nota média por área e ano",
            tipos: ["linha", "area", "barra", "empilhada"],
            tipoPadrao: "linha"
        })
    };
}

/* =========================================================================
   2. ATUALIZAÇÃO
========================================================================= */
async function atualizar(execucao) {
    const ano = estado.ano();
    const area = estado.area();
    const tabela = `'${tabelaDoAno(ano)}'`;
    const encerrarIndicador = ui.atualizando(ID_PAGINA, "Consultando " + ano + "…", execucao);

    try {
        await sincronizarOpcoes(ID_PAGINA, tabela);

        const recorte = estado.recorte(ID_PAGINA);
        const resumo = await consultarResumo(ano, recorte);

        // Uma atualização mais nova já começou: esta não pode escrever na
        // tela, ou sobrescreveria o recorte atual com um recorte antigo.
        if (execucao && !execucao.ehAtual()) return;

        if (!resumo || resumo.total === 0) {
            ui.vazio(ID_PAGINA, "Nenhum participante neste recorte",
                "Os filtros selecionados não retornaram participantes com as cinco notas em "
                + ano + ".");
            return;
        }
        ui.pronto(ID_PAGINA);

        const [estados, densidade, densidadeDep, porAno, conclusao] =
            await consultarDetalhes(ano, recorte, area);

        if (execucao && !execucao.ehAtual()) return;

        const contexto = { ano, area };

        renderizarIndicadores(resumo);
        renderizarMediasPorArea(resumo);
        renderizarTabelaEstados(estados);
        renderizarTabelaConclusao(conclusao, ano);

        graficos.densidade.atualizar(conjuntoDensidade(densidade, area), contexto);
        graficos.densidadeDep.atualizar(conjuntoDensidadePorDependencia(densidadeDep, area), contexto);
        graficos.mediaAno.atualizar(conjuntoMediaPorAno(porAno), contexto);
    } catch (erro) {
        ui.mostrarFalha(ID_PAGINA, "Desempenho", erro);
    } finally {
        encerrarIndicador();
    }
}

/* =========================================================================
   3. CONSULTAS

   Separadas da renderização para deixar visível de que cada uma depende — é
   o que o cache aproveita — e para o pré-aquecimento
   (infra/preaquecimento.js) poder rodá-las para outros anos sem tocar na
   tela.

   Só quem tem as cinco notas entra nas médias e na proficiência. Sem isso, a
   média de cada área mudaria de significado conforme a área selecionada, e a
   faixa "Nota média por área" mostraria números incomparáveis entre si.
========================================================================= */
function filtroComNotas(recorte) {
    return `${montarWhere(recorte)} AND ${TEM_TODAS_AS_NOTAS}`;
}

/** Depende do ano e do recorte. */
function consultarResumo(ano, recorte) {
    const comNotas = filtroComNotas(recorte);

    return consultarPrimeira(`
        SELECT
            CAST(COUNT(*) AS BIGINT) AS total,
            CAST(SUM(CASE WHEN NU_NOTA_REDACAO = 1000 THEN 1 ELSE 0 END) AS BIGINT) AS redacoes_1000,
            CAST(SUM(CASE WHEN ${EXPR_PROFICIENTE} THEN 1 ELSE 0 END) AS BIGINT) AS proficientes,
            ${AREAS.map(function (a) { return `AVG(${a.coluna}) AS ${a.chave}`; }).join(", ")},
            AVG((NU_NOTA_CN + NU_NOTA_CH + NU_NOTA_LC + NU_NOTA_MT + NU_NOTA_REDACAO) / 5.0) AS media_geral
        FROM '${tabelaDoAno(ano)}' ${comNotas}
    `);
}

/**
 * As cinco consultas restantes. Só as duas de densidade dependem da área —
 * as outras três têm SQL idêntico quando a área muda, e por isso voltam do
 * cache sem tocar em arquivo.
 */
function consultarDetalhes(ano, recorte, area) {
    const tabela = `'${tabelaDoAno(ano)}'`;
    const comNotas = filtroComNotas(recorte);
    const expressao = expressaoDaArea(area);

    return Promise.all([
        consultar(`
            SELECT estado_prova, CAST(COUNT(*) AS BIGINT) AS qtd
            FROM ${tabela} ${comNotas} AND NU_NOTA_REDACAO = 1000
            GROUP BY estado_prova ORDER BY qtd DESC
        `),

        consultar(`
            SELECT CAST(FLOOR(${expressao} / 25) * 25 AS INTEGER) AS faixa,
                   CAST(COUNT(*) AS BIGINT) AS qtd
            FROM ${tabela} ${comNotas}
            GROUP BY faixa ORDER BY faixa
        `),

        consultar(`
            SELECT CAST(FLOOR(${expressao} / 25) * 25 AS INTEGER) AS faixa,
                   CAST(dep_adm AS VARCHAR) AS dep_adm,
                   CAST(COUNT(*) AS BIGINT) AS qtd
            FROM ${tabela} ${comNotas} AND dep_adm IS NOT NULL
            GROUP BY faixa, dep_adm ORDER BY faixa
        `),

        // Os cinco anos em uma consulta só. Antes eram cinco consultas em
        // sequência, cada uma abrindo um arquivo diferente e esperando a
        // anterior terminar. Não depende do ano nem da área selecionados.
        consultar(ANOS_DISPONIVEIS.map(function (anoLoop) {
            return `SELECT '${anoLoop}' AS ano, `
                + AREAS.map(function (a) { return `AVG(${a.coluna}) AS ${a.chave}`; }).join(", ")
                + ` FROM '${tabelaDoAno(anoLoop)}' ${comNotas}`;
        }).join(" UNION ALL ") + " ORDER BY ano"),

        consultar(`
            SELECT TP_ANO_CONCLUIU AS ano_conclusao,
                   CAST(COUNT(*) AS BIGINT) AS total,
                   CAST(SUM(CASE WHEN ${EXPR_PROFICIENTE} THEN 1 ELSE 0 END) AS BIGINT) AS proficientes
            FROM ${tabela} ${comNotas}
              AND TP_ST_CONCLUSAO = 1 AND TP_ANO_CONCLUIU IS NOT NULL
            GROUP BY TP_ANO_CONCLUIU ORDER BY TP_ANO_CONCLUIU DESC
        `)
    ]);
}

/**
 * Tarefas de pré-aquecimento deste ano.
 *
 * Esta página tem uma dimensão a mais que as outras: a ÁREA DE CONHECIMENTO,
 * que troca as duas curvas de densidade. Numa apresentação, percorrer as seis
 * áreas é justamente o que se faz — então todas entram na fila, e não só a
 * média geral.
 *
 * As três consultas que não dependem da área (estados, evolução por ano e
 * conclusão × proficiência) têm o mesmo SQL nas seis tarefas, então só a
 * primeira toca em arquivo; as outras cinco voltam do cache.
 */
export function tarefasPreaquecimento(ano) {
    const tarefas = [{
        rotulo: "desempenho " + ano + " (base)",
        executar: function () {
            return Promise.all([
                opcoesDeFiltro(`'${tabelaDoAno(ano)}'`, COLUNAS_POR_PAGINA.desempenho),
                consultarResumo(ano, {}),
                consultarDetalhes(ano, {}, AREA_GERAL)
            ]);
        }
    }];

    OPCOES_AREA.filter(function (opcao) { return opcao.valor !== AREA_GERAL; })
        .forEach(function (opcao) {
            tarefas.push({
                rotulo: "desempenho " + ano + " · " + opcao.rotulo,
                executar: function () { return consultarDetalhes(ano, {}, opcao.valor); }
            });
        });

    return tarefas;
}

/* =========================================================================
   4. INDICADORES E FAIXA DE MÉDIAS
========================================================================= */
function renderizarIndicadores(dados) {
    const total = Number(dados.total || 0);
    const proficientes = Number(dados.proficientes || 0);

    definirValores({
        "desempenho.total": total,
        "desempenho.redacoes1000": dados.redacoes_1000,
        "desempenho.proficiencia": total > 0 ? (proficientes / total) * 100 : 0,
        "desempenho.mediaGeral": dados.media_geral
    });
}

/**
 * A média por área é uma faixa de tiles, e não uma tabela de uma linha só: o
 * número é a informação, e o ponto colorido amarra cada área à cor que ela
 * tem no gráfico de evolução logo abaixo.
 */
function renderizarMediasPorArea(dados) {
    const container = document.getElementById("mediasPorArea");
    if (!container) return;

    container.innerHTML = AREAS.map(function (area) {
        return '<div class="media-area">'
            + '<div class="media-area-nome">'
            + '<span class="media-area-ponto" style="background:' + corDe(area.chave) + '"></span>'
            + escapar(area.nome) + "</div>"
            + '<div class="media-area-valor">' + formatarDecimal(dados[area.chave], 1) + "</div>"
            + "</div>";
    }).join("");
}

/* =========================================================================
   4. TABELAS
========================================================================= */
function renderizarTabelaEstados(linhas) {
    const corpo = document.querySelector("#tabelaEstadosRedacoes1000 tbody");
    if (!corpo) return;

    if (!linhas || linhas.length === 0) {
        corpo.innerHTML = '<tr class="tabela-vazia"><td colspan="3">'
            + "Nenhuma redação nota 1000 neste recorte.</td></tr>";
        return;
    }

    const total = linhas.reduce(function (soma, l) { return soma + Number(l.qtd); }, 0);

    corpo.innerHTML = linhas.map(function (linha) {
        const quantidade = Number(linha.qtd);
        return "<tr><td>" + escapar(linha.estado_prova || "—") + "</td>"
            + '<td class="num">' + quantidade.toLocaleString("pt-BR") + "</td>"
            + '<td class="num">' + barra(total > 0 ? (quantidade / total) * 100 : 0) + "</td></tr>";
    }).join("");
}

function renderizarTabelaConclusao(linhas, anoSelecionado) {
    const corpo = document.querySelector("#tabelaConclusaoProficiencia tbody");
    if (!corpo) return;

    if (!linhas || linhas.length === 0) {
        corpo.innerHTML = '<tr class="tabela-vazia"><td colspan="3">'
            + "Sem dados de ano de conclusão neste recorte.</td></tr>";
        return;
    }

    const anoBase = Number(anoSelecionado);

    corpo.innerHTML = linhas.map(function (linha) {
        // TP_ANO_CONCLUIU guarda a distância em anos até a edição, não o ano
        // em si: 0 = não informado, 17 = "antes de" o limite da faixa.
        const codigo = Number(linha.ano_conclusao);
        let texto;

        if (codigo === 0) {
            texto = "Não Informado";
        } else if (codigo === 17) {
            texto = "Antes de " + (anoBase - 16);
        } else {
            texto = String(anoBase - codigo);
        }

        const total = Number(linha.total);
        const proficiencia = total > 0 ? (Number(linha.proficientes) / total) * 100 : 0;

        return "<tr><td>" + texto + "</td>"
            + '<td class="num">' + total.toLocaleString("pt-BR") + "</td>"
            + '<td class="num">' + barra(proficiencia) + "</td></tr>";
    }).join("");
}

/* =========================================================================
   5. CONJUNTOS DE DADOS DOS GRÁFICOS
========================================================================= */
function conjuntoDensidade(linhas, area) {
    const total = linhas.reduce(function (soma, l) { return soma + Number(l.qtd); }, 0);

    return {
        categorias: linhas.map(function (l) { return Number(l.faixa); }),
        series: [{
            nome: "Participantes",
            valores: linhas.map(function (l) { return total > 0 ? Number(l.qtd) / total : 0; }),
            cor: serie(0)
        }],
        formato: "percentual",
        numerico: true,
        eixoX: rotuloDoEixo(area),
        eixoY: "Proporção",
        unidade: "participantes"
    };
}

function conjuntoDensidadePorDependencia(linhas, area) {
    const grupos = {};
    const faixas = [];

    linhas.forEach(function (linha) {
        // O código vem como "2.0" do Parquet; normalizar é o que faz bater
        // com as chaves "1".."4" da ordem fixa de cores abaixo.
        const dep = normalizarCodigo(linha.dep_adm);
        const faixa = Number(linha.faixa);

        (grupos[dep] || (grupos[dep] = {}))[faixa] = Number(linha.qtd);
        if (!faixas.includes(faixa)) faixas.push(faixa);
    });

    faixas.sort(function (a, b) { return a - b; });

    // A ordem fixa mantém a cor presa à dependência: filtrar "Federal" não
    // repinta as outras três.
    const series = ["1", "2", "3", "4"]
        .filter(function (dep) { return grupos[dep]; })
        .map(function (dep) {
            const porFaixa = grupos[dep];
            const total = Object.keys(porFaixa)
                .reduce(function (soma, chave) { return soma + porFaixa[chave]; }, 0);

            return {
                nome: traduzir(DEP_ADM, dep),
                cor: corDe("dep_adm:" + dep),
                valores: faixas.map(function (faixa) {
                    return total > 0 ? (porFaixa[faixa] || 0) / total : 0;
                })
            };
        });

    return {
        categorias: faixas,
        series,
        formato: "percentual",
        numerico: true,
        eixoX: rotuloDoEixo(area),
        eixoY: "Proporção",
        unidade: "participantes"
    };
}

function conjuntoMediaPorAno(linhas) {
    return {
        categorias: linhas.map(function (l) { return Number(l.ano); }),
        series: AREAS.map(function (area) {
            return {
                nome: area.nome,
                cor: corDe(area.chave),
                valores: linhas.map(function (l) {
                    return l[area.chave] === null || l[area.chave] === undefined
                        ? null : Number(l[area.chave]);
                })
            };
        }),
        formato: "decimal",
        eixoAno: true,
        zeroObrigatorio: false,
        eixoX: "Ano",
        eixoY: "Nota média"
    };
}

export default { iniciar, tarefasPreaquecimento };
