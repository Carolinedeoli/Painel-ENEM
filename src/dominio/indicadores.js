/* =========================================================================
   INDICADORES.JS — CATÁLOGO DOS INDICADORES DO PAINEL

   Um indicador tem três partes inseparáveis: o nome, o valor e o que ele
   significa. No painel anterior só as duas primeiras chegavam à tela — a
   explicação existia como aria-label de uma bolinha "i", invisível para quem
   enxerga e ausente na maioria dos cards.

   Aqui cada indicador é uma linha declarada, com a descrição junto. Para
   acrescentar um indicador novo basta acrescentar uma entrada aqui e citar o
   id na página; não há HTML para escrever nem CSS para ajustar.

   FORMATOS
     inteiro     1.234.567
     percentual  12,3%
     decimal     543,2
     texto       o valor sai como veio (ex.: "17 anos")
========================================================================= */

export const INDICADORES = {

    /* ---------------------------------------------------------- GERAL --- */
    "geral.inscritos": {
        rotulo: "Inscritos",
        descricao: "Pessoas com inscrição confirmada na edição, tenham comparecido ou não.",
        formato: "inteiro"
    },
    "geral.presentes": {
        rotulo: "Presentes",
        descricao: "Quem compareceu aos dois dias de prova.",
        formato: "inteiro"
    },
    "geral.participacao": {
        rotulo: "% Presentes",
        descricao: "Presentes nos dois dias sobre o total de inscritos do recorte.",
        formato: "percentual"
    },
    "geral.redacoesValidas": {
        rotulo: "% Redações Válidas",
        descricao: "Redações corrigidas e pontuadas entre os presentes no primeiro dia.",
        formato: "percentual"
    },
    "geral.mediaPorAno": {
        rotulo: "Média de Participantes por Ano",
        descricao: "Presentes por edição, na média das edições do recorte.",
        formato: "inteiro"
    },

    /* -------------------------------------------------------- REDAÇÃO --- */
    "redacao.total": {
        rotulo: "Redações Zeradas",
        descricao: "Redações entregues que não receberam pontuação — anuladas, em branco, "
                 + "fuga ao tema e demais motivos.",
        formato: "inteiro"
    },
    "redacao.concluintes": {
        rotulo: "Concluintes no Ano",
        descricao: "Participantes que concluiriam o Ensino Médio no ano da prova.",
        formato: "inteiro"
    },
    "redacao.treineiros": {
        rotulo: "Treineiros",
        descricao: "Quem fez a prova sem intenção de usar a nota no ano corrente.",
        formato: "inteiro"
    },
    "redacao.faixaComum": {
        rotulo: "Faixa Etária Mais Comum",
        descricao: "Faixa com mais participantes dentro do recorte selecionado.",
        formato: "texto"
    },

    /* --------------------------------------------------------- PERFIL --- */
    "perfil.participantes": {
        rotulo: "Participantes",
        descricao: "Presentes com notas registradas na edição selecionada.",
        formato: "inteiro"
    },
    "perfil.concluintes": {
        rotulo: "Concluintes no Ano",
        descricao: "Participantes que concluiriam o Ensino Médio no ano da prova.",
        formato: "inteiro"
    },
    "perfil.treineiros": {
        rotulo: "Treineiros",
        descricao: "Quem fez a prova sem intenção de usar a nota no ano corrente.",
        formato: "inteiro"
    },
    "perfil.faixaComum": {
        rotulo: "Faixa Etária Mais Comum",
        descricao: "Faixa com mais participantes dentro do recorte selecionado.",
        formato: "texto"
    },

    /* ----------------------------------------------------- DESEMPENHO --- */
    "desempenho.total": {
        rotulo: "Participantes com Nota",
        descricao: "Quem tem as cinco notas registradas. É a população de todas as médias "
                 + "desta página.",
        formato: "inteiro"
    },
    "desempenho.redacoes1000": {
        rotulo: "Redações Nota 1000",
        descricao: "Redações que atingiram a pontuação máxima no recorte.",
        formato: "inteiro"
    },
    "desempenho.proficiencia": {
        rotulo: "% Proficiência",
        descricao: "Nota ≥ 450 em cada uma das quatro áreas objetivas e ≥ 500 na redação, "
                 + "simultaneamente. Recorte deste painel, não uma classificação do INEP.",
        formato: "percentual"
    },
    "desempenho.mediaGeral": {
        rotulo: "Nota Média Geral",
        descricao: "Média das cinco notas, calculada participante a participante.",
        formato: "decimal"
    }
};

/** Ids exibidos em cada página, na ordem da faixa de indicadores. */
export const INDICADORES_POR_PAGINA = {
    geral: [
        "geral.inscritos", "geral.presentes", "geral.participacao",
        "geral.redacoesValidas", "geral.mediaPorAno"
    ],
    redacao: [
        "redacao.total", "redacao.concluintes", "redacao.treineiros", "redacao.faixaComum"
    ],
    perfil: [
        "perfil.participantes", "perfil.concluintes", "perfil.treineiros", "perfil.faixaComum"
    ],
    desempenho: [
        "desempenho.total", "desempenho.redacoes1000",
        "desempenho.proficiencia", "desempenho.mediaGeral"
    ]
};

export default { INDICADORES, INDICADORES_POR_PAGINA };
