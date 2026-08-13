/* =========================================================================
   PERFIL.JS — PÁGINA "PERFIL DOS PARTICIPANTES"

   Consulta os Parquet pelo DuckDB compartilhado, no primeiro acesso à aba.
   O recorte vem inteiro de nucleo/estado.js; esta página não lê o DOM em
   lugar nenhum para decidir o que consultar.
========================================================================= */
import { obterConexao, consultar, consultarPrimeira, montarWhere, tabelaDoAno, opcoesDeFiltro }
    from "../infra/duckdb.js";
import { sincronizarOpcoes } from "../dominio/filtros-servico.js";
import { COLUNAS_POR_PAGINA } from "../dominio/dimensoes.js";
import { renderizarVisaoPerfil } from "./perfil-comum.js";
import { montarIndicadores, definirValores } from "../ui/indicador.js";
import { INDICADORES_POR_PAGINA } from "../dominio/indicadores.js";
import { traduzir, FAIXA_ETARIA } from "../dominio/rotulos.js";
import { config } from "../nucleo/config.js";
import * as estado from "../nucleo/estado.js";
import * as ui from "../ui/estados.js";

const ID_PAGINA = "perfil";

/** Dimensões da visão de perfil, em uma consulta só. */
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

    montarIndicadores("indicadoresPerfil", INDICADORES_POR_PAGINA.perfil);

    if (!config.podeCarregarDados) {
        ui.avisarSemServidor(ID_PAGINA);
        return;
    }

    ui.carregando(ID_PAGINA, "Preparando a consulta aos microdados…",
        "Na primeira vez o navegador baixa o motor DuckDB. Depois disso a troca de "
        + "filtros é rápida — os resultados já vistos ficam em memória.");

    // A primeira pintura NÃO espera o motor subir. Se as consultas desta tela
    // já estiverem no cache do IndexedDB — o caso de toda visita depois da
    // primeira —, a página aparece sem o DuckDB ser sequer instanciado.
    // consultar() só espera pela conexão quando precisa mesmo executar.
    obterConexao(function (mensagem) { ui.progresso(ID_PAGINA, mensagem); })
        .catch(function () {
            // A falha aparece na tela pelo caminho da consulta, em atualizar().
        });

    iniciado = true;
    estado.assinar(ID_PAGINA, atualizar);
    estado.revalidar(ID_PAGINA);
}

/* =========================================================================
   2. ATUALIZAÇÃO

   Um caminho só: seja troca de ano, de filtro ou primeira carga, tudo passa
   por aqui. As duas consultas abaixo são as únicas da página.
========================================================================= */
async function atualizar(execucao) {
    const ano = estado.ano();
    const tabela = `'${tabelaDoAno(ano)}'`;
    const encerrarIndicador = ui.atualizando(ID_PAGINA, "Consultando " + ano + "…", execucao);

    try {
        await sincronizarOpcoes(ID_PAGINA, tabela);

        const [cards, distribuicoes] = await consultarDados(ano, estado.recorte(ID_PAGINA));

        // Uma atualização mais nova já começou: esta não pode escrever na
        // tela, ou sobrescreveria o recorte atual com um recorte antigo.
        if (execucao && !execucao.ehAtual()) return;

        if (!cards || cards.total === 0) {
            ui.vazio(ID_PAGINA, "Nenhum participante neste recorte",
                "Os filtros selecionados não retornaram registros para " + ano + ".");
            return;
        }
        ui.pronto(ID_PAGINA);

        definirValores({
            "perfil.participantes": cards.total,
            "perfil.concluintes": cards.ultimo_ano,
            "perfil.treineiros": cards.treineiros,
            "perfil.faixaComum": traduzir(FAIXA_ETARIA, cards.faixa_comum)
        });

        const grupo = separarPorDimensao(distribuicoes);

        renderizarVisaoPerfil({
            sufixo: "",
            ano,
            raca: ordenarPorCodigo(grupo.TP_COR_RACA),
            sexo: grupo.TP_SEXO || [],
            idade: ordenarPorCodigo(grupo.TP_FAIXA_ETARIA),
            escola: grupo.tipo_escola || [],
            dep: grupo.dep_adm || [],
            conclusao: grupo.TP_ST_CONCLUSAO || []
        });
    } catch (erro) {
        ui.mostrarFalha(ID_PAGINA, "Perfil", erro);
    } finally {
        encerrarIndicador();
    }
}

/* =========================================================================
   3. CONSULTAS

   Separadas da renderização por dois motivos: deixa explícito que a página
   inteira custa duas consultas, e permite que o pré-aquecimento
   (infra/preaquecimento.js) rode exatamente as mesmas, para outros anos, sem
   tocar na tela.
========================================================================= */
function consultarDados(ano, recorte) {
    const tabela = `'${tabelaDoAno(ano)}'`;
    const where = montarWhere(recorte);

    return Promise.all([
        consultarPrimeira(`
            SELECT
                CAST(COUNT(*) AS BIGINT)                                             AS total,
                CAST(SUM(CASE WHEN IN_TREINEIRO = 1 THEN 1 ELSE 0 END) AS BIGINT)    AS treineiros,
                CAST(SUM(CASE WHEN TP_ST_CONCLUSAO = 2 THEN 1 ELSE 0 END) AS BIGINT) AS ultimo_ano,
                MODE(TP_FAIXA_ETARIA)                                                AS faixa_comum
            FROM ${tabela} ${where}
        `),

        // As seis distribuições em uma consulta só, em vez de seis varreduras
        // separadas do mesmo arquivo.
        consultar(DIMENSOES.map(function (dimensao) {
            return `SELECT '${dimensao}' AS dimensao, CAST(${dimensao} AS VARCHAR) AS valor, `
                 + `CAST(COUNT(*) AS BIGINT) AS qtd FROM ${tabela} ${where} GROUP BY ${dimensao}`;
        }).join(" UNION ALL "))
    ]);
}

/**
 * Tarefas de pré-aquecimento deste ano: as mesmas consultas que a página
 * faria, sem filtro e sem renderizar, só para encher o cache.
 *
 * Quem decide o que varia é a página, não o agendador — assim uma dimensão
 * nova (como a área de conhecimento em Desempenho) entra aqui e o
 * infra/preaquecimento.js não precisa saber que ela existe.
 */
export function tarefasPreaquecimento(ano) {
    return [{
        rotulo: "perfil " + ano,
        executar: function () {
            return Promise.all([
                opcoesDeFiltro(`'${tabelaDoAno(ano)}'`, COLUNAS_POR_PAGINA.perfil),
                consultarDados(ano, {})
            ]);
        }
    }];
}

/* =========================================================================
   4. UTILITÁRIOS
========================================================================= */
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

export default { iniciar, tarefasPreaquecimento };
