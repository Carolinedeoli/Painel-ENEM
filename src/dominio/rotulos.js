/* =========================================================================
   ROTULOS.JS — DICIONÁRIOS DE CÓDIGOS DA BASE DO ENEM

   Fonte única dos mapas código → texto legível. Antes estavam copiados
   idênticos em perfil.js, redacao.js e desempenho.js, e qualquer correção
   precisava ser feita três vezes.

   Referência: dicionário dos microdados do ENEM (INEP).
========================================================================= */

export const SEXO = {
    "M": "Masculino",
    "F": "Feminino"
};

export const COR_RACA = {
    "0": "Não Informado",
    "1": "Branca",
    "2": "Preta",
    "3": "Parda",
    "4": "Amarela",
    "5": "Indígena",
    "6": "Não Informado"
};

export const ESCOLA = {
    "1": "Não Informado",
    "2": "Pública",
    "3": "Privada"
};

export const DEP_ADM = {
    "1": "Federal",
    "2": "Estadual",
    "3": "Municipal",
    "4": "Privada"
};

export const INTERNET = {
    "A": "Não possui Internet",
    "B": "Possui Internet"
};

export const TREINEIRO = {
    "0": "Não",
    "1": "Sim"
};

export const CONCLUSAO = {
    "1": "Já concluiu o Ensino Médio",
    "2": "Concluirá o Ensino Médio nesse ano",
    "3": "Concluirá após este ano",
    "4": "Não concluiu/não cursa"
};

export const ESCOLARIDADE_MAE = {
    "A": "Nunca estudou",
    "B": "Não completou EF (até 5º ano)",
    "C": "Não completou EF (até 9º ano)",
    "D": "EF completo",
    "E": "Médio completo",
    "F": "Superior completo",
    "G": "Pós-graduação",
    "H": "Não sabe"
};

export const RENDA = {
    "A": "Sem renda",       "B": "Até 1 SM",        "C": "De 1 a 1,5 SM",
    "D": "De 1,5 a 2 SM",   "E": "De 2 a 2,5 SM",   "F": "De 2,5 a 3 SM",
    "G": "De 3 a 4 SM",     "H": "De 4 a 5 SM",     "I": "De 5 a 6 SM",
    "J": "De 6 a 7 SM",     "K": "De 7 a 8 SM",     "L": "De 8 a 9 SM",
    "M": "De 9 a 10 SM",    "N": "De 10 a 12 SM",   "O": "De 12 a 15 SM",
    "P": "De 15 a 20 SM",   "Q": "Acima de 20 SM"
};

export const FAIXA_ETARIA = {
    "1": "Menor de 17", "2": "17 anos", "3": "18 anos", "4": "19 anos",
    "5": "20 anos", "6": "21 anos", "7": "22 anos", "8": "23 anos",
    "9": "24 anos", "10": "25 anos", "11": "26 a 30", "12": "31 a 35",
    "13": "36 a 40", "14": "41 a 45", "15": "46 a 50", "16": "51 a 55",
    "17": "56 a 60", "18": "61 a 65", "19": "66 a 70", "20": "Maior de 70"
};

export const ESTADO_CIVIL = {
    "0": "Não Informado",
    "1": "Solteiro(a)",
    "2": "Casado(a)",
    "3": "Divorciado(a)",
    "4": "Viúvo(a)"
};

export const STATUS_REDACAO = {
    "2": "Anulada",
    "3": "Cópia Texto Motivador",
    "4": "Em Branco",
    "6": "Fuga ao tema",
    "7": "Não atendimento ao tipo textual",
    "8": "Texto insuficiente",
    "9": "Parte desconectada"
};

/**
 * Normaliza um código vindo da base.
 *
 * Todas as colunas de código foram gravadas como DOUBLE, então o DuckDB
 * devolve 2 como "2.0" sempre que o valor passa por VARCHAR (o que acontece
 * em qualquer CAST ou UNION que misture tipos). Sem esta normalização, "2.0"
 * não encontra a chave "2" dos dicionários e a tela mostra "Código 2.0" no
 * lugar de "Estadual".
 */
export function normalizarCodigo(valor) {
    if (valor === null || valor === undefined) return "";
    if (typeof valor === "number") return String(valor);

    const texto = String(valor).trim();
    return /^-?\d+\.0+$/.test(texto) ? texto.replace(/\.0+$/, "") : texto;
}

/**
 * Traduz um código para o texto legível. Valores ausentes ou "NA" viram
 * "Não Informado" em vez de aparecerem crus na tela.
 */
export function traduzir(mapa, valor) {
    const codigo = normalizarCodigo(valor);

    if (codigo === "" || codigo === "NA" || codigo === "nan") return "Não Informado";
    if (!mapa || mapa[codigo]) return mapa ? mapa[codigo] || codigo : codigo;

    // Os agregados da página Geral guardam o rótulo já escrito por extenso
    // ("Pública"), enquanto os microdados guardam o código ("2"). Um valor
    // que não é código numérico já é o próprio rótulo e sai como está; só um
    // código numérico fora do dicionário merece o aviso "Código N".
    return /^-?\d+$/.test(codigo) ? "Código " + codigo : codigo;
}

export default {
    SEXO, COR_RACA, ESCOLA, DEP_ADM, INTERNET, TREINEIRO, CONCLUSAO,
    ESCOLARIDADE_MAE, RENDA, FAIXA_ETARIA, ESTADO_CIVIL, STATUS_REDACAO,
    normalizarCodigo, traduzir
};
