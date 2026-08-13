/* =========================================================================
   FILTROS-SERVICO.JS — CARGA DAS OPÇÕES DE FILTRO

   Ponte entre o banco (quais valores existem) e a gaveta (quais caixas
   aparecem). As três páginas que leem a base individual faziam isto com o
   mesmo bloco copiado, e nenhuma delas fazia a parte mais importante: a
   reconciliação.

   RECONCILIAÇÃO — por que importa. Ao trocar de ano, um valor marcado pode
   não existir na nova edição. Sem descartá-lo, o filtro continuaria valendo
   de forma invisível: nenhum checkbox marcado na tela e, mesmo assim, um
   "IN (...)" no SQL derrubando o resultado para zero. A tela mostrava
   "nenhum participante" sem nada explicando o porquê.

   Como as opções de um ano nunca mudam, a consulta passa pelo cache: voltar
   a um ano já visitado não toca no arquivo de novo.
========================================================================= */
import { opcoesDeFiltro } from "../infra/duckdb.js";
import { COLUNAS_POR_PAGINA } from "./dimensoes.js";
import * as painelFiltros from "../ui/painel-filtros.js";
import * as estado from "../nucleo/estado.js";

/**
 * Carrega as opções de filtro de uma página, reconcilia o recorte marcado e
 * atualiza a gaveta.
 *
 * @param {string} pagina        'perfil' | 'redacao' | 'desempenho'
 * @param {string} fonte         tabela ou arquivo ('ENEM_2023.parquet')
 * @param {string} [filtroExtra] condição adicional, ex.: "ANO = 2023"
 */
export async function sincronizarOpcoes(pagina, fonte, filtroExtra) {
    const colunas = COLUNAS_POR_PAGINA[pagina] || [];
    const porColuna = await opcoesDeFiltro(fonte, colunas, filtroExtra);

    estado.reconciliar(pagina, painelFiltros.opcoesNormalizadas(porColuna));
    painelFiltros.preencherOpcoes(pagina, porColuna);

    return porColuna;
}

export default { sincronizarOpcoes };
