/* =========================================================================
   CACHE.JS — MEMOIZAÇÃO DE RESULTADOS ASSÍNCRONOS

   POR QUE ISTO EXISTE

   A base do painel é imutável: são cinco arquivos Parquet publicados junto
   com o site. O resultado de uma consulta, para um mesmo recorte, é sempre
   o mesmo — e mesmo assim o painel refazia a consulta inteira toda vez que
   o usuário mexia em qualquer coisa.

   Os três casos medidos que mais doíam:

     · trocar a ÁREA DE CONHECIMENTO em Desempenho refazia a consulta de
       "nota média por área e ano", que varre os CINCO arquivos e não depende
       da área escolhida;
     · voltar para um ano já visitado refazia as doze consultas de opções de
       filtro daquele ano, que não mudam nunca;
     · desmarcar um filtro para voltar ao recorte anterior recalculava tudo,
       mesmo o painel já tendo mostrado exatamente aquele resultado.

   COMO RESOLVE

   A chave do cache é o próprio texto do SQL. Isso é deliberado: duas
   consultas com o mesmo SQL têm, por definição, o mesmo resultado sobre uma
   base imutável — e uma consulta que *não* depende da área simplesmente não
   muda de texto quando a área muda, então acerta o cache sem nenhuma regra
   extra. Não é preciso declarar dependências à mão em lugar nenhum.

   LIMITE

   É um LRU com teto de entradas. Sem teto, uma sessão longa acumularia
   resultado de toda combinação de filtros já visitada — e alguns resultados
   (a lista de UFs, as faixas de densidade) não são pequenos.
========================================================================= */

const TETO_PADRAO = 80;

/**
 * Cria um cache LRU de promessas.
 *
 * Guardar a *promessa* (e não o valor) faz duas chamadas simultâneas com a
 * mesma chave compartilharem uma execução só — o que acontece de fato
 * quando uma página dispara várias consultas em Promise.all.
 *
 * @param {object} [opcoes]
 * @param {number} [opcoes.teto]  máximo de entradas mantidas
 * @param {string} [opcoes.nome]  identificação nas estatísticas
 */
export function criarCache(opcoes) {
    const teto = (opcoes && opcoes.teto) || TETO_PADRAO;
    const nome = (opcoes && opcoes.nome) || "cache";

    const entradas = new Map();
    let acertos = 0;
    let faltas = 0;

    function memo(chave, produzir) {
        if (entradas.has(chave)) {
            acertos++;
            // Releitura reposiciona a entrada como a mais recente.
            const valor = entradas.get(chave);
            entradas.delete(chave);
            entradas.set(chave, valor);
            return valor;
        }

        faltas++;
        const promessa = Promise.resolve()
            .then(produzir)
            .catch(function (erro) {
                // Falha não fica em cache: senão uma queda de rede momentânea
                // condenaria a página a nunca mais carregar aquele recorte.
                entradas.delete(chave);
                throw erro;
            });

        entradas.set(chave, promessa);

        if (entradas.size > teto) {
            // A primeira chave do Map é a menos recentemente usada.
            entradas.delete(entradas.keys().next().value);
        }

        return promessa;
    }

    return {
        memo,
        limpar() { entradas.clear(); },
        tamanho() { return entradas.size; },
        estatisticas() {
            const total = acertos + faltas;
            return {
                nome,
                acertos,
                faltas,
                entradas: entradas.size,
                aproveitamento: total > 0 ? Math.round((acertos / total) * 100) + "%" : "—"
            };
        }
    };
}

export default criarCache;
