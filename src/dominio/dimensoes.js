/* =========================================================================
   DIMENSOES.JS — CATÁLOGO DAS COLUNAS FILTRÁVEIS

   Uma coluna filtrável precisa de três coisas: o nome no banco, o rótulo na
   tela e o dicionário que traduz os códigos. Essas três coisas estavam
   repetidas em quatro lugares — a declaração dos painéis em
   filtros-painel.js e um array FILTROS quase idêntico no topo de perfil.js,
   redacao.js e desempenho.js. Acrescentar um filtro exigia editar os quatro,
   e esquecer um deles não dava erro nenhum: o filtro simplesmente não
   funcionava naquela aba.

   Aqui existe uma declaração só. Quem monta o painel, quem carrega as
   opções e quem monta o WHERE leem todos daqui.
========================================================================= */
import {
    SEXO, COR_RACA, ESCOLA, DEP_ADM, INTERNET, TREINEIRO,
    CONCLUSAO, ESCOLARIDADE_MAE, RENDA, FAIXA_ETARIA, ESTADO_CIVIL, STATUS_REDACAO
} from "./rotulos.js";

/** coluna → { rotulo, mapa } */
export const DIMENSOES = {
    estado_prova:    { rotulo: "UF",                    mapa: null },
    redacao:         { rotulo: "Status da Redação",     mapa: STATUS_REDACAO },
    motivo_status:   { rotulo: "Status da Redação",     mapa: null },
    TP_SEXO:         { rotulo: "Sexo",                  mapa: SEXO },
    TP_COR_RACA:     { rotulo: "Cor/Raça",              mapa: COR_RACA },
    TP_ESTADO_CIVIL: { rotulo: "Estado Civil",          mapa: ESTADO_CIVIL },
    TP_FAIXA_ETARIA: { rotulo: "Faixa Etária",          mapa: FAIXA_ETARIA },
    TP_ST_CONCLUSAO: { rotulo: "Situação de Conclusão", mapa: CONCLUSAO },
    tipo_escola:     { rotulo: "Tipo de Escola",        mapa: ESCOLA },
    dep_adm:         { rotulo: "Dependência Adm.",      mapa: DEP_ADM },
    IN_TREINEIRO:    { rotulo: "Treineiro",             mapa: TREINEIRO },
    escolaridade_mae:{ rotulo: "Escolaridade da Mãe",   mapa: ESCOLARIDADE_MAE },
    renda_familiar:  { rotulo: "Renda Familiar",        mapa: RENDA },
    internet:        { rotulo: "Acesso à Internet",     mapa: INTERNET }
};

/** Recorte socioeconômico comum às páginas que leem a base individual. */
export const RECORTE_PARTICIPANTE = [
    "estado_prova", "TP_SEXO", "TP_COR_RACA", "TP_ESTADO_CIVIL", "TP_FAIXA_ETARIA",
    "TP_ST_CONCLUSAO", "tipo_escola", "dep_adm", "IN_TREINEIRO",
    "escolaridade_mae", "renda_familiar", "internet"
];

/** Colunas filtráveis de cada página, na ordem em que aparecem no painel. */
export const COLUNAS_POR_PAGINA = {
    geral:      ["estado_prova", "tipo_escola", "dep_adm", "motivo_status"],
    redacao:    ["redacao"].concat(RECORTE_PARTICIPANTE),
    perfil:     RECORTE_PARTICIPANTE,
    desempenho: RECORTE_PARTICIPANTE
};

export function rotuloDaColuna(coluna) {
    const dimensao = DIMENSOES[coluna];
    return dimensao ? dimensao.rotulo : coluna;
}

export function mapaDaColuna(coluna) {
    const dimensao = DIMENSOES[coluna];
    return dimensao ? dimensao.mapa : null;
}

export default { DIMENSOES, RECORTE_PARTICIPANTE, COLUNAS_POR_PAGINA, rotuloDaColuna, mapaDaColuna };
