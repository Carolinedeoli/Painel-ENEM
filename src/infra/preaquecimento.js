/* =========================================================================
   PREAQUECIMENTO.JS — CARGA COMPLETA DO CACHE NA PRIMEIRA VISITA

   O painel é usado principalmente para apresentar: alguém abre, mostra 2023,
   troca para 2021, vai para Desempenho, percorre as áreas de conhecimento,
   volta. Cada uma dessas trocas custava uma varredura de Parquet de alguns
   segundos — e o silêncio acontecia na frente da plateia.

   A ESTRATÉGIA. Na PRIMEIRA visita, quando o cache em IndexedDB ainda está
   vazio, este módulo executa em segundo plano TODAS as combinações
   previsíveis do painel — cada ano, cada área de conhecimento, sem filtro —
   e grava tudo. A partir daí, e em todas as visitas seguintes, essas telas
   respondem do cache, sem tocar em nenhum arquivo Parquet.

   O que é "previsível" tem limite claro: são as combinações de ano e de área,
   que são finitas e poucas. Combinações de FILTRO são infinitas e ficam de
   fora — essas continuam sendo consultadas na hora e guardadas conforme
   aparecem.

   POR QUE UM MARCADOR, E NÃO "CONTAR SE O CACHE ESTÁ VAZIO". Uma carga
   interrompida no meio (o usuário fechou a aba) deixaria o cache
   parcialmente cheio. Contando entradas, o painel concluiria que já terminou
   e nunca completaria o resto. O marcador só é gravado ao final, então uma
   visita seguinte retoma o que faltou — e o que já estava em cache volta
   instantaneamente, sem custo de rede.

   TRÊS REGRAS PARA NÃO ATRAPALHAR

   1. O USUÁRIO TEM PRIORIDADE. Qualquer mudança de estado (ano, filtro,
      página) adia a carga por ADIAMENTO_MS. O DuckDB atende uma consulta por
      vez: insistir em segundo plano enquanto alguém clica deixaria o painel
      MAIS lento, que é o oposto do objetivo.
   2. UMA DE CADA VEZ, do mais provável para o menos. A ordem começa pelo ano
      que está na tela, então o painel fica utilizável muito antes de a fila
      terminar.
   3. NADA QUE O USUÁRIO NÃO PEDIU. As redações zeradas ficam de fora: são
      39 MB, e baixá-los em segundo plano para quem talvez nunca abra essa
      aba é desperdício de banda.

   A carga é desligada quando o navegador sinaliza conexão limitada
   (Save-Data), porque aí o custo em dados importa mais que a latência.
========================================================================= */
import * as estado from "../nucleo/estado.js";
import { config } from "../nucleo/config.js";
import { marcar } from "./cache-consultas.js";
import * as agregados from "./agregados.js";

const MARCADOR = "carga-completa";

const ADIAMENTO_MS = 2500;      // pausa após qualquer interação
const INTERVALO_MS = 250;       // respiro entre duas tarefas
const INICIO_MS = 3000;         // espera antes da primeira tarefa

let rodando = false;
let proximaJanela = 0;
let concluidas = 0;
let totalTarefas = 0;
let completo = false;

/**
 * @param {object} modulos  { perfil, desempenho } — módulos de página com uma
 *                          função tarefasPreaquecimento(ano)
 */
export async function iniciar(modulos) {
    if (rodando || !config.podeCarregarDados) return;

    if (navigator.connection && navigator.connection.saveData) {
        console.log("[Painel ENEM] Carga do cache desligada: o navegador pediu economia de dados.");
        return;
    }

    // Se o site publica os agregados pré-calculados, a carga chega pronta em
    // uma requisição e não há nada a percorrer. Só quando o arquivo não
    // existe é que vale recalcular tudo no navegador de cada visitante —
    // caro, mas melhor do que um painel lento.
    //
    // A decisão sai do RETORNO de semear(), e não de uma releitura do
    // marcador no IndexedDB: reler dependeria de a escrita já ter sido
    // descarregada, e nessa corrida o painel baixava os agregados publicados
    // e recalculava os 3 GB assim mesmo.
    const semente = await agregados.semearBase();

    if (semente.origem === "publicado" || semente.origem === "cache-local") {
        completo = true;
        console.log(
            "%c[Painel ENEM]%c cache completo (" + semente.origem + ") — "
            + "trocar de ano ou de área responde do IndexedDB, sem ler Parquet.",
            "font-weight:bold;color:#1baf7a", "color:inherit"
        );
        return;
    }

    rodando = true;

    // Qualquer interação empurra a janela para frente.
    estado.observar(adiar);
    adiar();

    setTimeout(function () { percorrer(modulos); }, INICIO_MS);
}

function adiar() {
    proximaJanela = Date.now() + ADIAMENTO_MS;
}

/**
 * Fila de tarefas: ano a ano, começando pelo que está na tela. Cada página
 * declara as suas — é a página que sabe o que varia nela.
 */
function montarFila(modulos) {
    const atual = estado.ano();
    const anos = [atual].concat(
        estado.anosDisponiveis().filter(function (ano) { return ano !== atual; }).reverse()
    );

    const tarefas = [];
    anos.forEach(function (ano) {
        Object.keys(modulos).forEach(function (nome) {
            const modulo = modulos[nome];
            if (modulo && typeof modulo.tarefasPreaquecimento === "function") {
                tarefas.push.apply(tarefas, modulo.tarefasPreaquecimento(ano));
            }
        });
    });

    return tarefas;
}

async function percorrer(modulos) {
    const fila = montarFila(modulos);
    totalTarefas = fila.length;
    const comecou = Date.now();

    console.log(
        "%c[Painel ENEM]%c primeira visita: carregando " + totalTarefas
        + " combinações de ano e área em segundo plano. "
        + "O painel continua utilizável — a carga cede a vez a cada clique.",
        "font-weight:bold;color:#2a78d6", "color:inherit"
    );

    for (const tarefa of fila) {
        await esperarJanelaLivre();

        try {
            await tarefa.executar();
        } catch (erro) {
            // Uma tarefa que falhou não impede as outras. Como isto é trabalho
            // invisível, o erro fica no console e não vira estado de tela.
            console.warn("[Painel ENEM] Carga do cache falhou em " + tarefa.rotulo, erro);
        }

        concluidas++;
        await pausa(INTERVALO_MS);
    }

    rodando = false;
    completo = true;
    await marcar(MARCADOR);

    console.log(
        "%c[Painel ENEM]%c cache completo: " + concluidas + " combinações em "
        + Math.round((Date.now() - comecou) / 1000) + "s. "
        + "As próximas visitas abrem sem ler nenhum Parquet.",
        "font-weight:bold;color:#1baf7a", "color:inherit"
    );
}

/** Espera até ter passado tempo suficiente desde a última interação. */
async function esperarJanelaLivre() {
    let restante = proximaJanela - Date.now();
    while (restante > 0) {
        await pausa(restante);
        restante = proximaJanela - Date.now();
    }
}

function pausa(ms) {
    return new Promise(function (resolver) { setTimeout(resolver, ms); });
}

/** Diagnóstico no console. */
export function situacao() {
    return {
        rodando,
        completo,
        concluidas,
        total: totalTarefas,
        progresso: totalTarefas > 0
            ? Math.round((concluidas / totalTarefas) * 100) + "%"
            : (completo ? "100%" : "—")
    };
}

export default { iniciar, situacao };
