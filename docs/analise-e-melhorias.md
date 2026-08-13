# Painel ENEM — análise técnica e melhorias de dados

Documento de apoio ao trabalho de revisão do painel. A primeira parte descreve
o que foi encontrado e corrigido no código; a segunda é a lista priorizada de
melhorias na camada de dados, que é onde estão os maiores ganhos restantes.

Números medidos em 13/08/2026, sobre os arquivos versionados no repositório.

---

## Parte 1 — O que estava quebrado

### 1.1 O painel não sabia onde estava rodando

`perfil.js` e `desempenho.js` montavam a URL dos Parquet fazendo aritmética
sobre `window.location.pathname`:

```js
let pathname = window.location.pathname;
if (pathname.includes('index.html')) pathname = pathname.replace('index.html', '');
if (!pathname.endsWith('/')) pathname += '/';
const urlBaseDoSite = window.location.origin + pathname;
```

Isso falha em dois cenários reais:

- **`file://`** — `window.location.origin` é a string `"null"`, então a URL
  final vira `nulldados/ENEM_2019.parquet`. Nada carrega e o único sinal é um
  `console.error` que ninguém vê.
- **Qualquer rota que não termine em `/` ou `index.html`** — o último segmento
  do caminho é tratado como se fosse uma pasta.

**Correção.** `js/config.js` deriva a raiz do site do endereço do próprio
script (`<raiz>/js/config.js` → `new URL("../", script.src)`), classifica o
ambiente em `arquivo` / `local` / `github-pages` / `servidor`, e expõe
`config.arquivo(nome)` para montar as URLs. Os quatro casos resolvem certo:

| Onde | Raiz derivada |
|---|---|
| `file:///C:/Projetos/Painel-ENEM/` | `file:///C:/Projetos/Painel-ENEM/` |
| `http://localhost:8123/sub/pasta/` | `http://localhost:8123/sub/pasta/` |
| `https://usuario.github.io/Painel-ENEM/` | `https://usuario.github.io/Painel-ENEM/` |
| `https://dominio-proprio.com.br/` | `https://dominio-proprio.com.br/` |

Em `file://` nenhuma correção de URL resolveria — o navegador bloqueia a
leitura por CORS de qualquer jeito. O painel passa a **detectar e explicar**
esse caso, em vez de mostrar zeros.

A base de dados também ficou substituível sem tocar em código, por meta tag ou
query string, o que abre caminho para tirar os 290 MB de dentro do repositório
(ver melhoria D1).

### 1.2 Cerca de 580 MB baixados antes de qualquer clique

Três problemas somados:

1. **Duas instâncias de DuckDB.** `perfil.js` e `desempenho.js` criavam cada um
   o seu `AsyncDuckDB`, com worker próprio, e registravam os mesmos cinco
   arquivos separadamente.
2. **`directIO = false`** em todos os `registerFileURL`. Com esse parâmetro o
   DuckDB-WASM baixa o arquivo inteiro em vez de usar requisições parciais
   (HTTP Range) para ler só as colunas e blocos que a consulta precisa.
3. **Ambos inicializavam no carregamento da página**, não ao abrir a aba.
   `desempenho.js` tinha um `DOMContentLoaded → iniciarDesempenho()` no fim do
   arquivo, e `perfil.js` chamava `iniciarPerfil()` direto.

O portão de carregamento sob demanda que existia em `script.js` era **código
morto**: testava `typeof iniciarDesempenho === 'function'`, mas a função vivia
no escopo de um módulo ES e nunca esteve em `window`.

Resultado: abrir a home baixava 5 arquivos × 2 instâncias ≈ 580 MB. Isso
explica o commit *"Força re-deploy do painel após falha do servidor"*.

**Correção.** `js/duckdb-compartilhado.js` centraliza uma instância única,
criada na primeira consulta, com `directIO = true`. Cada página se registra em
`PainelENEM.paginas` e só inicializa quando a aba é aberta.

### 1.3 Todos os códigos apareciam errados nos rótulos

Todas as colunas categóricas dos Parquet foram gravadas como `DOUBLE`. Quando o
valor passa por `VARCHAR` — o que acontece em qualquer `UNION` que misture
colunas de tipos diferentes — o DuckDB devolve `"2.0"`, não `"2"`. Os
dicionários têm chave `"2"`, então a busca falhava.

O sintoma mais visível: o gráfico *Densidade por Dependência Administrativa*
ficava **completamente vazio**, porque o agrupamento procurava as chaves
`"1".."4"` e recebia `"1.0".."4.0"`. Nas tabelas, o efeito era mais discreto —
`Código 2.0` no lugar de `Estadual`.

**Correção.** `rotulos.normalizarCodigo()` normaliza o valor uma vez, usado por
`traduzir()`, pela montagem dos checkboxes e pelo agrupamento dos gráficos.

### 1.4 HTML estruturalmente inválido

Havia **dois `</main>`**: o primeiro fechava logo depois da página Perfil, e
`#pagina-desempenho` ficava fora de `.conteudo-principal`. O navegador
corrigia à sua maneira, e o layout da aba Desempenho passou a precisar de uma
folha inteira de `!important` para compensar.

O `style.css` anterior tinha **mais de 60 declarações `!important`**, várias
comentadas como "TRAVA 1", "TRAVA 2", "TRAVA 3" — sintoma de regras brigando
entre si, não de decisão de design.

**Correção.** Estrutura refeita com um `<main>` só. O layout deixou de forçar
tudo em `height: 100vh; overflow: hidden` e passou a rolar normalmente, o que
dispensou toda a disputa de alturas. Restou **um** `!important`, no seletor
`[hidden]`, com o motivo comentado.

### 1.5 Outros pontos corrigidos

| Item | Antes | Agora |
|---|---|---|
| Dicionários de códigos | Copiados em 3 arquivos | `js/rotulos.js`, um lugar só |
| Painéis de filtro | ~700 linhas de HTML quase idêntico | Gerados de uma declaração |
| Opções dos filtros | 12 consultas em série por aba | 1 consulta com `UNION ALL` |
| Média por área e ano | 5 consultas em série | 1 consulta com `UNION ALL` |
| Falha de carregamento | `console.error` | Estado visível com o que fazer |
| Trocar o ano | Perdia os filtros marcados | Mantém a seleção |
| Cores dos gráficos | Definidas por arquivo | Paleta única validada para daltonismo |
| Valores dos gráficos | Só no tooltip | Botão "Ver tabela" em cada gráfico |
| Arquivos mortos | `perfilCards.js`, `perfilFiltros.js` | Removidos |

Sobre os arquivos mortos: `perfilFiltros.js` nunca foi referenciado pelo
`index.html` e continha um erro que só apareceria em execução — chamava
`obterCheckboxesMarcados` mas definia `obtenerCheckboxesMarcados`.

### 1.6 Um erro de método que valia corrigir

Na aba Desempenho, a tabela *Nota Média por Área* mudava de significado
conforme o filtro **Área de Conhecimento**:

- Com "Média Geral", exigia as cinco notas não nulas.
- Com uma área específica, exigia só aquela área.

Como a tabela mostra as cinco áreas em todos os casos, as médias exibidas
passavam a ser calculadas sobre populações diferentes e deixavam de ser
comparáveis entre si. Agora as médias e a proficiência usam sempre a mesma
população (quem tem as cinco notas); o seletor de área muda apenas a variável
das curvas de densidade, que é o seu papel.

---

## Parte 2 — Melhorias de dados, por prioridade

Cada item traz o ganho estimado e o esforço. As medições são do
`ENEM_2023.parquet` (55,9 MB, 2.569.190 linhas, 3 row groups, compressão
SNAPPY), e valem proporcionalmente para os outros anos.

### Tamanho atual

| Arquivo | Tamanho | Linhas |
|---|---:|---:|
| `ENEM_2019.parquet` | 76,0 MB | 3.593.488 |
| `ENEM_2020.parquet` | 57,7 MB | 2.527.394 |
| `ENEM_2021.parquet` | 49,2 MB | 2.173.532 |
| `ENEM_2022.parquet` | 51,1 MB | 2.243.402 |
| `ENEM_2023.parquet` | 55,9 MB | 2.569.190 |
| `redacao_zerada_total.csv` | 39,7 MB | — |
| `GERAL.csv` + `REDACAO.csv` | 1,0 MB | — |
| **Total** | **≈ 331 MB** | |

O repositório empacotado ocupa 248 MiB. O GitHub Pages publica sites de até
1 GB e tem um limite recomendado de 100 GB de banda por mês — a 290 MB por
visitante que abrisse todas as abas, o orçamento acabaria em algumas centenas
de visitas. Reduzir o volume não é otimização prematura aqui, é o que mantém o
painel no ar.

---

### D1 · Remover `NU_INSCRICAO` dos Parquet
**Ganho: −22% por arquivo · Esforço: baixo · Também é questão de privacidade**

É a **maior coluna de todas**: 12,26 MB comprimidos no arquivo de 2023, mais
que o dobro de qualquer coluna de nota. Sendo um identificador único, não
comprime — e o painel **nunca a usa**.

Além do peso, é um identificador individual de inscrição publicado em um
repositório aberto. Um painel agregado não precisa dele.

```sql
COPY (SELECT * EXCLUDE (NU_INSCRICAO) FROM 'ENEM_2023.parquet')
TO 'ENEM_2023.parquet' (FORMAT PARQUET);
```

### D2 · Trocar SNAPPY por ZSTD
**Ganho: −30% a −40% · Esforço: baixo**

Os arquivos usam SNAPPY, que otimiza velocidade de descompressão. Para dados
lidos pela rede, o gargalo é o download, não a CPU: ZSTD nível 9 costuma
entregar 30–40% a menos de bytes com diferença desprezível de tempo de leitura.

```sql
COPY (...) TO 'ENEM_2023.parquet' (FORMAT PARQUET, COMPRESSION ZSTD, COMPRESSION_LEVEL 9);
```

### D3 · Tipar as colunas corretamente
**Ganho: −10% a −15% · Esforço: baixo · Corrige a causa do bug 1.3**

Hoje **toda** coluna categórica é `DOUBLE` (8 bytes por valor). São códigos
pequenos:

| Coluna | Hoje | Deveria ser |
|---|---|---|
| `TP_SEXO` | VARCHAR | `ENUM('M','F')` |
| `TP_COR_RACA`, `TP_ST_CONCLUSAO`, `tipo_escola`, `dep_adm` | DOUBLE | `UTINYINT` |
| `TP_FAIXA_ETARIA`, `TP_ESTADO_CIVIL`, `TP_ANO_CONCLUIU`, `TP_LINGUA` | DOUBLE | `UTINYINT` |
| `IN_TREINEIRO` | DOUBLE | `BOOLEAN` |
| `escolaridade_mae`, `renda_familiar`, `internet` | VARCHAR | `ENUM` |
| `NU_NOTA_*` | DOUBLE | `FLOAT` (notas têm 1 casa decimal) |
| `ANO` | DOUBLE | `USMALLINT` |

Isso elimina de vez o `"2.0"` na origem, em vez de normalizar no JavaScript.

### D4 · Acrescentar a coluna `redacao` e aposentar o CSV de 39,7 MB
**Ganho: −39,7 MB e uma base a menos · Esforço: médio**

`redacao_zerada_total.csv` tem exatamente o mesmo esquema dos Parquet, com uma
coluna a mais: `redacao` (o motivo do status). É essa única coluna ausente que
justifica a existência de um CSV de 39,7 MB, baixado inteiro e processado com
laços em JavaScript.

Com `redacao` dentro dos Parquet anuais, a aba Redações Zeradas passa a ser uma
consulta como as outras (`WHERE redacao IS NOT NULL`), some o download de
39,7 MB, e a filtragem sai do JavaScript para o DuckDB.

**É a melhoria com melhor relação ganho/risco depois de D1 e D2.**

### D5 · Ordenar por `estado_prova` e reduzir os row groups
**Ganho: consultas filtradas muito mais rápidas · Esforço: baixo**

Os arquivos têm apenas **3 row groups**, um deles com 1.048.576 linhas, e não
estão ordenados. O DuckDB usa as estatísticas de min/max por row group para
pular blocos; sem ordenação, todo row group contém todas as UFs e nenhum pode
ser descartado.

Gravando com `ORDER BY estado_prova` e row groups de ~128 mil linhas, um filtro
por UF passa a ler uma fração do arquivo. É o que faz a diferença entre
"filtrar por SP" custar o arquivo inteiro ou alguns megabytes.

### D6 · Descartar colunas que o painel não usa
**Ganho: −8% a −12% · Esforço: baixo, mas decida antes**

Nunca lidas pela interface: `NU_NOTA_COMP1` a `NU_NOTA_COMP5` (as cinco
competências da redação), `celulares`, `computadores`, `TP_LINGUA`.

`desempenho` é derivada — a média das cinco notas — e ocupa 4,2 MB armazenando
o que uma expressão SQL calcula na hora.

As competências da redação são material analítico interessante; se houver
intenção de usá-las, valem uma seção própria. Guardar sem usar é que não
compensa.

### D7 · Publicar um `dicionario.csv` versionado
**Ganho: confiabilidade · Esforço: baixo**

Os mapas de código → rótulo vivem hoje só em `js/rotulos.js`. Se o INEP mudar
uma codificação, ou se alguém quiser reproduzir o tratamento, não existe fonte
de verdade fora do JavaScript do painel.

Um `dados/dicionario.csv` com `coluna, codigo, rotulo, origem_inep` serviria de
referência e poderia alimentar `rotulos.js`.

### D8 · Versionar o script de preparação dos dados
**Ganho: reprodutibilidade · Esforço: médio**

O repositório tem os Parquet mas **não tem o código que os gerou**. A aba
"Sobre os Dados" agora descreve o tratamento em prosa, o que ajuda o leitor —
mas não permite reproduzir nem auditar.

Um `preparo/construir_parquet.py` (ou `.sql` de DuckDB) versionado tornaria
cada decisão de limpeza explícita e revisável, e todas as melhorias acima
virariam mudanças de uma linha nesse script.

### D9 · Reconciliar as duas fontes da página Geral
**Ganho: consistência · Esforço: médio**

`GERAL.csv` e `REDACAO.csv` são agregados calculados fora do painel, enquanto
Perfil e Desempenho leem os Parquet. Nada garante que os totais batam, e não há
verificação.

Note que os Parquet **já vêm restritos** a quem tem as cinco notas: no arquivo
de 2023 há 2.569.190 linhas e nenhuma com `NU_NOTA_MT` nula. Ou seja, os
Parquet não representam todos os inscritos, e sim os participantes com notas —
o que é coerente com o uso, mas precisa estar escrito para não induzir a
comparações indevidas com os números da página Geral.

O ideal é gerar os dois agregados a partir dos mesmos Parquet, no mesmo script
de D8, com um teste simples de reconciliação.

### D10 · Tirar os dados pesados do repositório Git
**Ganho: repositório utilizável · Esforço: médio**

Os Parquet estão versionados como blobs comuns — 248 MiB de pack. Cada
regeneração dos arquivos adiciona outra cópia inteira ao histórico, para
sempre. O histórico já mostra o padrão: houve commits adicionando
`.parquet.txt` e depois removendo.

Duas saídas:

1. **GitHub Releases** — sobem os Parquet como anexos de release e o painel
   aponta para lá pela meta tag `painel-dados-base`. Sem custo, sem Git LFS, e
   o repositório volta a pesar alguns megabytes.
2. **Git LFS** — mantém o fluxo atual, mas consome a cota de LFS da conta.

A infraestrutura para a opção 1 **já está pronta** no `js/config.js`: é só
preencher a meta tag.

---

## Ordem sugerida

Um único passe de reprocessamento resolve D1, D2, D3, D5 e D6 de uma vez:

```sql
COPY (
    SELECT * EXCLUDE (NU_INSCRICAO, desempenho, NU_NOTA_COMP1, NU_NOTA_COMP2,
                      NU_NOTA_COMP3, NU_NOTA_COMP4, NU_NOTA_COMP5,
                      celulares, computadores, TP_LINGUA),
           CAST(TP_COR_RACA     AS UTINYINT) AS TP_COR_RACA,
           CAST(dep_adm         AS UTINYINT) AS dep_adm,
           CAST(tipo_escola     AS UTINYINT) AS tipo_escola,
           CAST(NU_NOTA_MT      AS FLOAT)    AS NU_NOTA_MT
           -- e assim por diante, conforme a tabela de D3
    FROM 'ENEM_2023.parquet'
    ORDER BY estado_prova
) TO 'ENEM_2023_novo.parquet'
  (FORMAT PARQUET, COMPRESSION ZSTD, COMPRESSION_LEVEL 9, ROW_GROUP_SIZE 131072);
```

Estimativa combinada: **de ~290 MB para algo em torno de 110–130 MB**, sem
perder nada que o painel mostre hoje. Somando D4, some também o CSV de
39,7 MB.

Depois disso, D8 (script versionado) e D10 (dados fora do Git) mudam o
patamar de manutenção do projeto — mas dependem de uma decisão sua sobre onde
hospedar, então ficam para um segundo momento.
