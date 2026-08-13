/* =========================================================================
   REDACAO.JS — PÁGINA "REDAÇÕES ZERADAS"

   ESTA PÁGINA ERA O GARGALO DO PAINEL.

   A versão anterior baixava redacao_zerada_total.csv (39,7 MB), pedia ao
   PapaParse para transformar as 413.467 linhas em 413.467 objetos
   JavaScript com 30 campos cada, guardava tudo isso numa variável de módulo
   e, a CADA clique em filtro, percorria a lista inteira com Array.filter,
   depois percorria de novo para contar seis distribuições.

   Duas contas explicam a lentidão:
     · o array de objetos ocupa centenas de MB de heap — o navegador passava
       a coletar lixo no meio das interações;
     · cada troca de filtro custava 413 mil iterações de JavaScript, com
       comparação de string, no thread da interface.

   Agora o CSV é carregado uma vez para dentro do DuckDB (ver
   infra/duckdb.js), onde vira uma tabela colunar, e esta página passa a ser
   igual às outras: SQL, o mesmo montarWhere e o mesmo cache de consultas.
   O JavaScript não toca em nenhuma linha individual.
========================================================================= */
import { consultar, consultarPrimeira, montarWhere, garantirTabelaRedacao, TABELA_REDACAO }
    from "../infra/duckdb.js";
import { sincronizarOpcoes } from "../dominio/filtros-servico.js";
import { renderizarVisaoPerfil } from "./perfil-comum.js";
import { montarIndicadores, definirValores } from "../ui/indicador.js";
import { INDICADORES_POR_PAGINA } from "../dominio/indicadores.js";
import { traduzir, FAIXA_ETARIA } from "../dominio/rotulos.js";
import { config } from "../nucleo/config.js";
import * as estado from "../nucleo/estado.js";
import * as ui from "../ui/estados.js";

const ID_PAGINA = "redacao";

const DIMENSOES = [
    "tipo_escola", "dep_adm", "TP_ST_CONCLUSAO",
    "TP_COR_RACA", "TP_SEXO", "TP_FAIXA_ETARIA"
];

let iniciado = false;

/* =========================================================================
   1. INICIALIZAÇÃO
========================================================================= */
export async function iniciar() {
    if (iniciado) return;

    montarIndicadores("indicadoresRedacao", INDICADORES_POR_PAGINA.redacao);

    if (!config.podeCarregarDados) {
        ui.avisarSemServidor(ID_PAGINA);
        return;
    }

    ui.carregando(ID_PAGINA, "Carregando as redações zeradas…",
        "São cerca de 39 MB, baixados uma vez por sessão. Depois disso os filtros "
        + "respondem sem novo download.");

    try {
        await garantirTabelaRedacao(function (mensagem) { ui.progresso(ID_PAGINA, mensagem); });

        iniciado = true;
        estado.assinar(ID_PAGINA, atualizar);
        estado.revalidar(ID_PAGINA);
    } catch (erro) {
        ui.mostrarFalha(ID_PAGINA, "Redações Zeradas", erro);
    }
}

/* =========================================================================
   2. ATUALIZAÇÃO
========================================================================= */
async function atualizar(execucao) {
    const ano = estado.ano();
    const doAno = `ANO = ${Number(ano)}`;
    const encerrarIndicador = ui.atualizando(ID_PAGINA, "Consultando " + ano + "…", execucao);

    try {
        await sincronizarOpcoes(ID_PAGINA, TABELA_REDACAO, doAno);

        const where = montarWhere(estado.recorte(ID_PAGINA)) + " AND " + doAno;

        const [cards, distribuicoes] = await Promise.all([
            consultarPrimeira(`
                SELECT
                    CAST(COUNT(*) AS BIGINT)                                             AS total,
                    CAST(SUM(CASE WHEN IN_TREINEIRO = 1 THEN 1 ELSE 0 END) AS BIGINT)    AS treineiros,
                    CAST(SUM(CASE WHEN TP_ST_CONCLUSAO = 2 THEN 1 ELSE 0 END) AS BIGINT) AS ultimo_ano,
                    MODE(TP_FAIXA_ETARIA)                                                AS faixa_comum
                FROM ${TABELA_REDACAO} ${where}
            `),

            consultar(DIMENSOES.map(function (dimensao) {
                return `SELECT '${dimensao}' AS dimensao, CAST(${dimensao} AS VARCHAR) AS valor, `
                     + `CAST(COUNT(*) AS BIGINT) AS qtd FROM ${TABELA_REDACAO} ${where} `
                     + `GROUP BY ${dimensao}`;
            }).join(" UNION ALL "))
        ]);

        // Uma atualização mais nova já começou: esta não pode escrever na
        // tela, ou sobrescreveria o recorte atual com um recorte antigo.
        if (execucao && !execucao.ehAtual()) return;

        if (!cards || cards.total === 0) {
            definirValores({
                "redacao.total": 0, "redacao.concluintes": 0,
                "redacao.treineiros": 0, "redacao.faixaComum": null
            });
            ui.vazio(ID_PAGINA, "Nenhuma redação zerada neste recorte",
                "Os filtros selecionados não retornaram registros para " + ano + ".");
            return;
        }
        ui.pronto(ID_PAGINA);

        definirValores({
            "redacao.total": cards.total,
            "redacao.concluintes": cards.ultimo_ano,
            "redacao.treineiros": cards.treineiros,
            "redacao.faixaComum": traduzir(FAIXA_ETARIA, cards.faixa_comum)
        });

        const grupo = separarPorDimensao(distribuicoes);

        renderizarVisaoPerfil({
            sufixo: "Redacao",
            ano,
            raca: ordenarPorCodigo(grupo.TP_COR_RACA),
            sexo: grupo.TP_SEXO || [],
            idade: ordenarPorCodigo(grupo.TP_FAIXA_ETARIA),
            escola: grupo.tipo_escola || [],
            dep: grupo.dep_adm || [],
            conclusao: grupo.TP_ST_CONCLUSAO || []
        });
    } catch (erro) {
        ui.mostrarFalha(ID_PAGINA, "Redações Zeradas", erro);
    } finally {
        encerrarIndicador();
    }
}

function separarPorDimensao(linhas) {
    const grupos = {};
    linhas.forEach(function (linha) {
        (grupos[linha.dimensao] || (grupos[linha.dimensao] = []))
            .push({ valor: linha.valor, qtd: linha.qtd });
    });
    return grupos;
}

function ordenarPorCodigo(lista) {
    return (lista || []).slice().sort(function (a, b) {
        return Number(a.valor) - Number(b.valor);
    });
}

export default { iniciar };
