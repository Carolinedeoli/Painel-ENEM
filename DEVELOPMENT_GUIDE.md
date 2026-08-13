# Guia de desenvolvimento — Painel ENEM

Este arquivo descreve como o painel é construído e **como pedir alterações a
ele**, inclusive com auxílio de IA. A última seção traz um modelo de prompt
pronto para copiar.

Se você só quer rodar o projeto, veja o [README](README.md). Se vai mexer no
código, leia daqui até o fim: são 15 minutos que evitam reescrever algo que
já existe.

---

## 1. Visão geral

**O que é.** Um painel estático dos microdados públicos do ENEM (2019–2023).
Não há backend: os arquivos Parquet são consultados **dentro do navegador**
com DuckDB-WASM, e o site inteiro é publicado como HTML, CSS e JavaScript.

**Para que serve.** É um MVP de apresentação. A prioridade é uma leitura
visual rápida — números grandes, gráficos padronizados, filtros óbvios — e
não completude analítica.

**As cinco páginas.**

| Página | Fonte dos dados | Peso |
|---|---|---|
| Estatísticas Gerais | `GERAL.csv`, `REDACAO.csv` (agregados) | leve, filtrada em JavaScript |
| Redações Zeradas | `redacao_zerada_total.csv` → tabela DuckDB | 39 MB uma vez por sessão |
| Perfil dos Participantes | `ENEM_<ano>.parquet` | leitura parcial por HTTP Range |
| Desempenho | `ENEM_<ano>.parquet` (os cinco, num gráfico) | idem |
| Sobre os Dados | estática | — |

**Funcionalidades que atravessam todas as páginas:** filtro de ano em tags,
gaveta de filtros por recorte, tags do recorte ativo, indicadores com
descrição, escolha do tipo de cada gráfico (persistida em SQLite), tema
claro/escuro e tabela equivalente para todo gráfico.

---

## 2. Arquitetura

### 2.1 Pastas

```
index.html              Marcação das cinco páginas — só estrutura, sem dados
style.css               Tokens de tema e layout
servidor-local.mjs      Servidor de desenvolvimento com suporte a Range

src/
  app.js                Casca: navegação, tema, orquestração das páginas

  nucleo/               Não conhece DOM nem gráficos
    config.js           Ambiente e URLs dos dados
    estado.js           ESTADO CENTRAL dos filtros + notificação
    cache.js            Memoização de resultados assíncronos (LRU)

  infra/                Fala com o mundo externo
    duckdb.js           Instância única do DuckDB, cache de consultas, WHERE
    cache-consultas.js  Cache de resultados em IndexedDB, entre sessões
    preaquecimento.js   Enche o cache em segundo plano, cedendo ao usuário
    preferencias.js     SQLite (sql.js) + IndexedDB, com queda para localStorage

  dominio/              Regras e vocabulário do ENEM — sem DOM
    rotulos.js          Dicionários de código → texto
    dimensoes.js        Catálogo das colunas filtráveis
    areas.js            Áreas da prova, proficiência, títulos por área
    indicadores.js      Catálogo dos indicadores, com descrição e formato
    filtros-servico.js  Carga e reconciliação das opções de filtro

  ui/                   Componentes sem conhecimento de negócio
    estados.js          Camadas de carregando / erro / vazio
    indicador.js        Componente de indicador (KPI)
    painel-filtros.js   Gaveta de filtros
    seletor-ano.js      Tags de ano + selo no título
    tags-filtros.js     Tags do recorte ativo

  graficos/
    tema.js             Paleta, layout base, métrica comum, desenhar()
    tipos.js            CATÁLOGO DE TIPOS de gráfico
    painel-grafico.js   Componente de caixa de gráfico

  paginas/
    geral.js  redacao.js  perfil.js  desempenho.js
    perfil-comum.js     Visão compartilhada por Perfil e Redações Zeradas

dados/                  Parquet e CSV publicados junto com o site
docs/                   Análise técnica e melhorias da camada de dados
```

### 2.2 Direção das dependências

```
paginas  →  dominio  →  nucleo
    ↓          ↓
   ui      infra
    ↓
 graficos
```

Regra prática: **as setas nunca apontam para trás.** `nucleo/` não importa
nada de `ui/`; `ui/` não importa de `paginas/`. Se você precisar quebrar
isso, quase sempre a peça está na camada errada.

### 2.3 Onde colocar uma funcionalidade nova

| O que é | Onde vai |
|---|---|
| Uma página nova | `src/paginas/<nome>.js` + seção em `index.html` + entrada em `PAGINAS` no `app.js` |
| Um novo gráfico numa página existente | caixa em `index.html` + `registrarGrafico` na página |
| Um novo indicador | entrada em `dominio/indicadores.js` + id na lista da página |
| Um novo filtro | entrada em `dominio/dimensoes.js` + coluna em `COLUNAS_POR_PAGINA` |
| Um novo tipo de gráfico | entrada em `graficos/tipos.js` |
| Uma nova preferência | `preferencias.definir/obter` com uma chave nova |

Note o padrão: quase toda extensão é **uma entrada em um catálogo**, não um
arquivo novo.

---

## 3. Componentes

### 3.1 Antes de criar, procure

Três componentes cobrem quase tudo que o painel mostra:

- **`ui/indicador.js`** — todo número grande com rótulo e descrição.
- **`graficos/painel-grafico.js`** — todo gráfico.
- **`paginas/perfil-comum.js`** — a visão de perfil inteira (3 gráficos +
  3 tabelas), usada por duas páginas.

Se a sua tela é "um número com um rótulo" ou "um gráfico numa caixa", ela já
existe. Criar uma variante paralela é o erro mais caro que se pode cometer
neste projeto: foi exatamente assim que surgiram `perfilCards.js`,
`perfilGraficos.js` e `perfilTabelas.js`, que duplicavam `redacao.js` com
pequenas divergências de cor e de tratamento de nulo.

### 3.2 Como criar um componente novo

Se realmente não existe equivalente:

1. Coloque em `src/ui/` (se for genérico) ou `src/graficos/` (se desenha
   dados).
2. Exporte funções, não classes — o projeto não usa `class` fora dos tipos
   de erro.
3. Não leia estado global lá dentro: receba dados por parâmetro. Componentes
   que consultam `estado` diretamente ficam impossíveis de reaproveitar.
4. Escreva um comentário de cabeçalho dizendo **que problema ele resolve**,
   no padrão dos arquivos existentes.

### 3.3 Como evitar duplicação

Antes de escrever uma função nova, procure por nome:

```bash
grep -rn "formatarDecimal\|escapar\|barra(" src/
```

Utilitários já compartilhados: `escapar`, `formatarDecimal` e `barra` vivem
em `paginas/perfil-comum.js` e são importados por `desempenho.js`. Formatação
de indicador vive em `ui/indicador.js` (`formatar`).

---

## 4. Gráficos

### 4.1 Padrão visual

Todo gráfico do painel tem:

- **a mesma altura** — `--altura-grafico` no `style.css` (232px). Nunca
  defina altura em uma página específica.
- **a mesma margem interna** — `MARGEM` em `graficos/tema.js`.
- **a mesma paleta** — validada para daltonismo; use `serie(i)` ou, melhor,
  `corDe(chave)`, que prende a cor à entidade (`corDe("dep_adm:2")` é sempre
  a mesma cor, mesmo que um filtro remova as outras dependências).
- **legenda automática** — `desenhar()` liga a legenda quando há mais de uma
  série e desliga quando há só uma.
- **tabela equivalente** — nenhum valor pode existir só no tooltip.

### 4.2 A estrutura de dados dos gráficos

Este é o contrato mais importante do projeto. Todo gráfico fala esta língua:

```js
{
  categorias: ["Branca", "Parda", …],   // eixo de categorias, ou x numérico
  series: [                             // uma ou mais séries
    { nome: "Participantes", valores: [1, 2, 3], cor: "#2a78d6", cores: [...] }
  ],
  formato: "inteiro" | "percentual" | "decimal",
  eixoX: "Ano",                         // rótulos dos eixos
  eixoY: "Pessoas",
  numerico: true,                       // x contínuo (curvas de densidade)
  eixoAno: true,                        // x são anos: sem separador de milhar
  unidade: "participantes"              // usado no hover
}
```

`formato: "percentual"` significa que os valores são **frações de 0 a 1** —
o eixo e o hover formatam para porcentagem. `cores` (plural) só é usado por
pizza e rosca, onde não há altura para codificar categoria.

### 4.3 Como acrescentar um gráfico a uma página

```html
<!-- index.html -->
<article class="painel-box col-4">
    <header class="painel-box-topo"><h2>Título de reserva</h2></header>
    <div id="graficoNovo" class="grafico"></div>
</article>
```

```js
// na página
const painel = registrarGrafico({
    id: "graficoNovo",
    titulo: (ctx) => "Meu gráfico — " + ctx.ano,   // dinâmico
    tipos: ["barra", "linha", "pizza"],
    tipoPadrao: "barra"
});

// a cada atualização
painel.atualizar(conjuntoDeDados, { ano, area });
```

O componente cuida do título, do menu de tipos, da preferência salva e da
tabela equivalente. Você só produz o conjunto de dados.

### 4.4 Como acrescentar um **tipo** de gráfico

Uma entrada em `graficos/tipos.js`:

```js
funil: {
    rotulo: "Funil",
    icone: '<svg …></svg>',
    aplicavel(dados) { return dados.series.length === 1; },
    montar(dados) {
        return { tracos: [...], layout: {...} };
    }
}
```

Nenhuma página precisa ser alterada: quem lista os tipos disponíveis é o
próprio catálogo, filtrado por `aplicavel()`. Depois é só citar `"funil"` na
lista `tipos` de um `registrarGrafico`.

### 4.5 Títulos dinâmicos

**Nunca escreva um título fixo no HTML para um conteúdo que muda.** O `<h2>`
da caixa é apenas um valor de reserva; quem manda é a função `titulo` do
`registrarGrafico`, que recebe o contexto passado em `atualizar()`.

O caso canônico está em `desempenho.js`: trocar a área de conhecimento troca
o título das duas curvas de densidade (`"Densidade de desempenho —
Matemática"`) e o rótulo do eixo, porque ambos vêm de
`dominio/areas.js → nomeDaArea()` e `rotuloDoEixo()`. Se você precisar do
nome de uma área em qualquer outro lugar, importe de lá — não escreva o texto
de novo.

### 4.6 Filtros nos gráficos

Um gráfico **nunca** filtra dados por conta própria. Ele recebe o que a
página consultou, e a página consulta com o `WHERE` montado a partir do
estado central. Se um gráfico precisa de um recorte diferente do resto da
página, isso é uma consulta a mais na página, não uma filtragem no
componente.

---

## 5. Filtros

### 5.1 Como o estado funciona

`src/nucleo/estado.js` é a **única** fonte de verdade:

```js
estado.ano()                    // "2023" — global, uma só para todo o painel
estado.area()                   // "GERAL" | "NU_NOTA_MT" — só Desempenho
estado.recorte("perfil")        // { TP_SEXO: ["F"], estado_prova: ["SP"] }
estado.contarFiltros("perfil")  // 2
```

O DOM é **entrada**, não estado. Marcar um checkbox dispara
`estado.alternarValor(...)`; quem redesenha é a assinatura do estado. Por
isso as tags, o contador do botão e os próprios checkboxes voltam a ficar
coerentes sozinhos quando um filtro sai por outro caminho.

**Política de notificação** (é o que segura o desempenho):

- só a página **visível** é recalculada na hora;
- as outras são marcadas como desatualizadas e se refazem quando abertas
  (`estado.sincronizar`, chamado pelo `app.js`);
- cliques em rajada são agrupados numa atualização só (120 ms);
- cada atualização recebe um `ehAtual()` — depois dos `await`, a página
  confere se ainda é a renderização mais recente antes de escrever na tela.
  **Sem essa conferência, uma consulta lenta de um recorte antigo sobrescreve
  a tela do recorte atual.**

### 5.4 Indicador de atualização

Trocar o ano pode levar segundos quando o Parquet daquela edição ainda não
foi lido. Toda página assíncrona abre a atualização com:

```js
const encerrarIndicador = ui.atualizando(ID_PAGINA, "Consultando " + ano + "…", execucao);
try   { … }
finally { encerrarIndicador(); }
```

`ui.atualizando` é diferente de `ui.carregando`: mostra uma pílula discreta
no alto, com os números anteriores legíveis por trás, em vez da caixa grande
da primeira carga. E só aparece **se a consulta passar de 160 ms** — a maior
parte das atualizações volta do cache em poucos milissegundos, e um indicador
imediato produziria um piscar a cada clique, mais incômodo do que a espera
que ele anuncia.

Ele também confere `execucao.ehAtual()` antes de pintar e não sobrepõe outro
estado já visível (carga inicial, erro, "nenhum resultado"). Se você criar
uma página nova, use o mesmo par `atualizando` / `finally`.

### 5.2 Como acrescentar um filtro

Três passos, nenhum deles em HTML:

1. Declare a coluna em `dominio/dimensoes.js`:
   ```js
   TP_LINGUA: { rotulo: "Língua Estrangeira", mapa: LINGUA }
   ```
2. Inclua a coluna em `COLUNAS_POR_PAGINA` das páginas que devem oferecê-la.
3. Autorize a coluna em `COLUNAS_PERMITIDAS`, em `infra/duckdb.js` — é a
   lista que impede um id errado de virar SQL malformado.

A gaveta, as opções, as tags, o contador e o `WHERE` passam a funcionar sem
mais nada.

### 5.3 Como garantir que tudo respeite o filtro

- Toda consulta a microdados usa `montarWhere(estado.recorte(ID_PAGINA))`.
  Se você escreveu um `WHERE` à mão, provavelmente criou um componente que
  ignora os filtros.
- Depois de carregar as opções de um ano, chame `sincronizarOpcoes`, que faz
  a **reconciliação**: descarta valores marcados que não existem na nova
  edição. Sem isso o filtro continua valendo de forma invisível — nenhum
  checkbox marcado na tela e um `IN (...)` no SQL zerando o resultado.
- Duas exceções conscientes, ambas comentadas no código:
  - os gráficos de evolução da página Geral ignoram o ano de propósito (são
    séries históricas);
  - o gráfico "Nota média por área e ano" varre as cinco edições, aplicando
    o recorte mas não o ano.

---

## 6. Performance

O painel move centenas de megabytes de dados dentro de um navegador. Quase
todo problema de lentidão aqui é **trabalho repetido**, não trabalho pesado.

### 6.1 Estratégias em uso, e por quê

**1. Três níveis de cache, com chave no texto do SQL.**

| Nível | Onde | Custo | Vive até |
|---|---|---|---|
| 1 | memória (`nucleo/cache.js`) | instantâneo | fechar a aba |
| 2 | IndexedDB (`infra/cache-consultas.js`) | milissegundos | 30 dias |
| 3 | DuckDB | segundos, lê o Parquet | — |

A base é imutável, então o mesmo SQL tem sempre o mesmo resultado — é o que
torna seguro guardar em disco. A escolha da chave não é preguiça: é o que faz
uma consulta que *não depende* da área de conhecimento acertar o cache quando
a área muda, sem declarar dependência nenhuma. Trocar a área em Desempenho
refaz 2 das 6 consultas; as outras 4 voltam prontas.

O nível 2 muda o patamar da segunda visita. Medido no painel, com o cache
completo: **toda consulta da tela vem do IndexedDB e nenhum byte de Parquet é
lido** (a única requisição que sobra é o HEAD de 300 B que testa suporte a
Range). Uma leitura do nível 2 custa **0,2 ms**, contra segundos de varredura.

Por isso `iniciar()` em Perfil e Desempenho **não espera** a conexão com o
DuckDB: dispara e segue. `consultar()` só aguarda o motor quando de fato
precisa executar. Se tudo estiver em cache, a página aparece sem o DuckDB ser
sequer instanciado.

Ao republicar os arquivos de dados, suba a constante `VERSAO` em
`infra/cache-consultas.js` — todo o cache antigo é descartado na próxima
visita. Para descartar na hora: `PainelENEM.limparCache()`.

**1b. Agregados pré-calculados** (`infra/agregados.js`) — a maior alavanca do
projeto.

Todo visitante recalculava, no próprio navegador, os mesmos ~91 agregados
(cada ano × cada área, sem filtro). Medido com um contador de bytes no
servidor, essa carga transferia **~3 GB — onze vezes os 276 MB dos arquivos
em disco**, porque cada consulta reabre o Parquet e relê as mesmas colunas
(1.530 requisições para um arquivo de 53 MB). Nesse ritmo, os 100 GB mensais
recomendados pelo GitHub Pages acabariam com **cerca de 33 visitantes**.

Esses agregados são iguais para todo mundo e cabem em arquivos pequenos.
Publicando `dados/agregados/`, a primeira visita vira **6,6 KB** em vez de
~3 GB.

A divisão é deliberada: entra nos arquivos só o que é **previsível** — ano e
área são finitos e poucos. Combinações de **filtro** são infinitas e
continuam indo ao DuckDB na hora, pagas apenas por quem de fato filtra.

**Duas ondas, um arquivo por ano.**

| Onda | O que carrega | Quem espera |
|---|---|---|
| 1ª | `comum.json` + o ano que está na tela | a primeira pintura |
| 2ª | os demais anos | ninguém — roda em segundo plano |

Ninguém precisa dos números de 2019 para ver a tela de 2023. E a divisão vale
cada vez mais conforme novas edições entram na base: com dez anos, a primeira
onda continua custando os mesmos ~6 KB.

`comum.json` guarda o que não pertence a um ano só — hoje, a evolução da nota
média por área, que consulta os cinco Parquet numa consulta só.

**Qual arquivo atende qual consulta.** A regra vale nas duas pontas — na
geração e na leitura — e por isso está escrita uma vez só, em
`anoDaConsulta()`: se o SQL cita exatamente um ano (pelo nome do Parquet ou
por `ANO = ...`), o resultado é daquele ano; se cita vários ou nenhum, é
comum. Se as duas pontas discordassem, o arquivo existiria e simplesmente
nunca daria acerto.

Trocar para um ano cuja 2ª onda ainda não chegou **não** cai no Parquet:
`garantirParaConsulta()` busca o arquivo daquele ano antes de deixar a
consulta seguir.

**Como gerar os arquivos.** Não há etapa de build; os arquivos são o próprio
cache do painel, separado por ano:

```
1. rode o painel localmente com o cache vazio
   (await PainelENEM.limparCache() e recarregue)
2. espere PainelENEM.preaquecimento() chegar a 100%
3. no console:  await PainelENEM.gerarAgregados()
   (o navegador pede permissão para baixar vários arquivos — aceite)
4. salve todos em  dados/agregados/  e publique
```

Gerar a partir do cache real garante que as chaves sejam exatamente os mesmos
textos de SQL que as páginas montam. Um gerador escrito à parte sairia de
sincronia no primeiro ajuste de consulta, e a falha seria **silenciosa**. Se
você mexer em qualquer SQL das páginas, gere os arquivos de novo.

O conjunto publicado é exatamente o que o pré-aquecimento produz — 91
entradas, 18 por ano mais uma comum. Consultas de **Redações Zeradas** ficam
de fora de propósito (ver `ehDoPreaquecimento`): elas podem estar no cache de
quem visitou a aba, e sem esse filtro o arquivo publicado dependeria de quais
telas quem gerou por acaso abriu.

Ao republicar os Parquet: gere os arquivos de novo **e** suba `VERSAO` em
`infra/cache-consultas.js`. Um arquivo com versão diferente da esperada é
ignorado com aviso no console, em vez de servir dado velho.

Confira com `PainelENEM.agregados()` — a origem deve ser `publicado` na
primeira visita e `cache-local` nas seguintes.

**1c. Carga completa na primeira visita** (`infra/preaquecimento.js`) — a
rede de segurança para quando `agregados.json` não existe.

Quando `agregados.json` **não** está publicado, o painel cai para o plano B:
na primeira visita, com o IndexedDB vazio, executa em segundo plano as
mesmas 35 tarefas (~91 consultas) e enche o cache localmente. Funciona, mas é
o caminho caro — os ~3 GB descritos acima. Serve para desenvolvimento e para
gerar o próprio arquivo.

**Por que um marcador e não "contar se o cache está vazio".** Uma carga
interrompida no meio (o usuário fechou a aba) deixaria o cache parcialmente
cheio; contando entradas, o painel concluiria que já terminou e nunca
completaria o resto. O marcador `carga-completa` só é gravado ao final, então
a visita seguinte retoma o que faltou — e o que já estava em cache volta
instantaneamente, sem custo de rede.

Três regras que ele respeita, e que valem para qualquer trabalho de fundo que
alguém acrescente aqui:

- **o usuário tem prioridade** — qualquer mudança de estado adia a carga em
  2,5 s, porque o DuckDB atende uma consulta por vez e insistir em segundo
  plano deixaria o painel mais lento. Medido: abrir Perfil no meio da carga
  levou 361 ms;
- **uma tarefa por vez**, começando pelo ano que está na tela, então o painel
  fica utilizável muito antes de a fila terminar;
- **nada que o usuário não pediu** — as redações zeradas (39 MB) ficam de
  fora da fila, porque baixá-las para quem talvez nunca abra essa aba é
  desperdício de banda.

Quem declara as tarefas é cada página, em `tarefasPreaquecimento(ano)`. É a
página que sabe o que varia nela — foi assim que a área de conhecimento
entrou na fila sem o agendador precisar saber que ela existe.

Acompanhe com `PainelENEM.preaquecimento()`.

**Não publique o site dependendo do plano B.** Com `dados/agregados/` no
lugar, a primeira visita custa 6,6 KB; sem ele, custa ~3 GB por visitante. A
diferença é de cinco ordens de grandeza, e nada na tela denuncia qual das
duas está valendo — por isso `PainelENEM.agregados()` existe: confira antes de
publicar, e espere ver `origem: "publicado"`.

**2. Redações zeradas dentro do DuckDB** (`infra/duckdb.js`).
Antes: 413.467 objetos JavaScript em memória e um `Array.filter` completo a
cada clique. Agora: uma tabela colunar carregada uma vez, com as 14 colunas
usadas de 30. O heap da página caiu de centenas de MB para ~22 MB.

**3. Opções de filtro em cache por ano.** Não mudam nunca; voltar a um ano já
visitado não toca no arquivo.

**4. Carga sob demanda.** Nenhuma página consulta nada antes de ser aberta.

**5. Redimensionamento por página.** `ajustarPagina(id)` mexe só nos gráficos
da aba aberta. A versão anterior disparava um `resize` global e mandava os
gráficos das cinco páginas recalcularem a cada troca de aba.

**6. Leitura parcial dos Parquet.** `registerFileURL(..., directIO = true)`
faz o DuckDB usar HTTP Range. Sem isso ele baixa o arquivo inteiro — é a
diferença entre alguns MB e ~290 MB por sessão. **O servidor precisa aceitar
Range**: `servidor-local.mjs` e o GitHub Pages aceitam;
`python -m http.server` não.

### 6.2 Regras para não reintroduzir lentidão

- **Não recalcule ao trocar de tipo de gráfico.** O último conjunto de dados
  fica guardado no `painel-grafico.js`; a troca redesenha, não reconsulta.
- **Não itere sobre linhas individuais em JavaScript.** Se a base tem mais
  que alguns milhares de linhas, a agregação é do DuckDB.
- **Prefira uma consulta com `UNION ALL` a N consultas em sequência.** As
  seis distribuições de Perfil são uma consulta só; as opções de doze filtros
  também.
- **Mantenha o texto do SQL estável para o mesmo recorte.** `montarWhere`
  ordena colunas e valores justamente por isso: sem ordenar, clicar em SP
  depois RJ geraria uma chave de cache diferente de RJ depois SP, para o
  mesmo resultado.
- **Não adicione cache sem medir.** Confira o aproveitamento no console:
  ```js
  await PainelENEM.cache()
  // { memoria: {acertos, faltas, aproveitamento}, indexedDb: {guardadas, acertos} }
  ```
  E confirme o efeito onde ele importa, no tráfego:
  ```js
  performance.getEntriesByType('resource').filter(r => r.name.includes('.parquet')).length
  ```

### 6.3 Cuidados com a base

Os Parquet somam ~290 MB e estão versionados no Git. Antes de reprocessá-los,
leia [`docs/analise-e-melhorias.md`](docs/analise-e-melhorias.md): há dez
melhorias medidas na camada de dados (remover `NU_INSCRICAO`, trocar SNAPPY
por ZSTD, ordenar por UF…) que juntas levariam o volume a 110–130 MB. É onde
está o maior ganho de desempenho restante — e ele não é de código.

---

## 7. SQLite (preferências)

**Para que serve.** Guardar as escolhas do usuário entre visitas. Hoje, uma
só: o tipo de cada gráfico.

**Como funciona.** `infra/preferencias.js` roda o SQLite compilado para
WebAssembly (sql.js) dentro do navegador e guarda o arquivo do banco no
IndexedDB. Três cuidados evitam que isso custe desempenho: o wasm é baixado
sob demanda e em paralelo com os dados; a leitura é síncrona a partir de um
`Map` em memória; a gravação é adiada e agrupada. Se o wasm não carregar, o
módulo cai para `localStorage` sozinho.

**Esquema.**

```sql
CREATE TABLE preferencias (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);
```

Chaves em uso: `grafico:<idDoGrafico>` → id do tipo de gráfico.

**Como acrescentar uma preferência.**

```js
import * as preferencias from "../infra/preferencias.js";

preferencias.definir("densidade:passo", "25");
const passo = preferencias.obter("densidade:passo", "25");   // com padrão
```

Não crie tabela nova para isso. Escolha um prefixo de chave (`grafico:`,
`densidade:`) e siga. Se um dia as preferências virarem muitas e
estruturadas, aí sim vale uma tabela — e o módulo já isola essa decisão.

**Diagnóstico.** `PainelENEM.preferencias.modoAtual()` devolve `"sqlite"`,
`"local"` ou `"nenhum"`.

---

## 8. Convenções de código

- **Português** em nomes, comentários e mensagens. `atualizar`, não `update`.
- **Sem passo de build.** Módulos ES nativos, importados por caminho
  relativo com extensão `.js`. Nada de bundler, nada de `node_modules`.
- **`function` comum** em callbacks; arrow apenas em expressões curtas.
- **Comentário explica o porquê, não o quê.** O padrão do projeto é dizer
  qual problema aquele trecho resolve — é isso que evita que uma correção
  seja desfeita por engano seis meses depois.
- **Toda saída de texto para HTML passa por `escapar()`.**
- **Nenhuma cor literal fora de `graficos/tema.js` e dos tokens do
  `style.css`.**

---

## 9. Como validar uma alteração

Não há suíte de testes automatizados. A validação é manual e leva 5 minutos:

```bash
node servidor-local.mjs        # http://localhost:8123
```

Percorra a lista:

1. **Console limpo** nas cinco abas — nenhum erro, nenhum aviso de coluna de
   filtro desconhecida.
2. **Ano** — trocar a tag muda os números, o selo ao lado do título e os
   títulos dos gráficos, nas quatro páginas com filtro. Em um ano ainda não
   visitado aparece a pílula "Consultando &lt;ano&gt;…"; em um ano já em cache
   ela **não** deve piscar.
3. **Filtros** — marcar um filtro muda os números; a tag aparece; remover
   pela tag desmarca o checkbox e restaura os números.
4. **Troca de aba** — o ano escolhido continua valendo na aba seguinte.
5. **Tipos de gráfico** — trocar o tipo redesenha na hora; recarregar a
   página mantém a escolha.
6. **Tema** — alternar claro/escuro repinta séries, grade e hover.
7. **Rolagem** — cada página cabe, ou quase cabe, em uma tela de 1440×900.
8. **Tooltips** — em gráfico de série única não aparece caixa lateral com o
   nome da série; em gráfico de várias séries o valor de x aparece só no
   cabeçalho da caixa, não repetido em cada linha.
9. **Cache** — na primeira visita, `PainelENEM.preaquecimento()` sai de 0% a
   100% em segundo plano sem travar a interface. Recarregue: ele deve relatar
   `completo: true, total: 0` (não roda de novo) e nenhuma requisição de dados
   deve aparecer:
   ```js
   performance.getEntriesByType('resource').filter(r => r.name.includes('.parquet'))
   // 1 entrada de 300 B — o HEAD que testa suporte a Range. Só.
   ```
   Para repetir o teste do zero: `await PainelENEM.limparCache()` e recarregue.

Verificação rápida de coerência, no console:

```js
PainelENEM.estado.ano()                  // bate com a tag ativa e o selo?
PainelENEM.estado.recorte("perfil")      // bate com as tags exibidas?
```

---

## 10. Como solicitar alterações ao projeto com IA

Copie o bloco abaixo, troque a última linha pelo seu pedido e envie junto do
repositório.

```text
Este é o Painel ENEM: um painel estático de microdados do ENEM, em
JavaScript puro com módulos ES, sem build, que consulta arquivos Parquet no
navegador com DuckDB-WASM. Leia DEVELOPMENT_GUIDE.md antes de qualquer coisa.

Antes de implementar:

 1. Identifique os arquivos envolvidos e diga quais são.
 2. Explique em duas ou três frases como a funcionalidade atual funciona.
 3. Aponte o que a alteração afeta: filtros, cache, títulos dinâmicos,
    layout das outras páginas.
 4. Verifique se já existe abstração equivalente antes de criar qualquer
    coisa. Neste projeto, quase toda extensão é UMA ENTRADA EM UM CATÁLOGO:
      · indicador novo   → dominio/indicadores.js
      · filtro novo      → dominio/dimensoes.js + COLUNAS_PERMITIDAS
      · tipo de gráfico  → graficos/tipos.js
      · gráfico novo     → registrarGrafico() na página
    Se você está escrevendo um arquivo novo, justifique por quê.

Ao implementar, respeite estas invariantes:

 5. O estado dos filtros vive em src/nucleo/estado.js. Não leia o DOM para
    saber o que está filtrado, e não guarde filtro em variável de módulo.
 6. Toda consulta a microdados usa montarWhere(estado.recorte(ID_PAGINA)) e
    passa por consultar(), que é cacheada pelo texto do SQL. Mantenha o SQL
    estável para o mesmo recorte.
 7. Nenhuma agregação linha a linha em JavaScript sobre base grande — isso é
    trabalho do DuckDB.
 8. Gráfico não filtra dados; recebe o conjunto de dados canônico descrito na
    seção 4.2 do guia.
 9. Título de conteúdo variável é função, nunca texto fixo no HTML.
10. Altura, margem e paleta de gráfico vêm de graficos/tema.js e do token
    --altura-grafico. Não defina altura por página.
11. Depois dos await, confira execucao.ehAtual() antes de escrever na tela.
12. Comentários e nomes em português; comentário explica o porquê.

Ao terminar:

13. Rode "node servidor-local.mjs" e percorra a lista de validação da seção 9
    do guia, dizendo o que conferiu de fato e o que não conseguiu conferir.
14. Liste exatamente quais arquivos foram alterados e o que mudou em cada um.
15. Se encontrou um problema relacionado que não foi pedido, relate-o em vez
    de corrigir junto — a não ser que a correção seja segura e pequena, e
    nesse caso diga o que fez.

Pedido: <descreva aqui o que você quer>
```

### Pedidos que costumam dar errado, e como formulá-los

| Em vez de… | Peça… |
|---|---|
| "deixa o gráfico maior" | "aumente `--altura-grafico`; confirme que as cinco páginas continuam consistentes" |
| "adiciona um filtro de língua" | "acrescente TP_LINGUA seguindo a seção 5.2 do guia (dimensoes.js, COLUNAS_POR_PAGINA, COLUNAS_PERMITIDAS)" |
| "o painel está lento" | "meça com PainelENEM.cache() e o painel Network; diga qual consulta está repetindo antes de mudar código" |
| "põe um gráfico de pizza aqui" | "acrescente 'pizza' à lista `tipos` do registrarGrafico deste gráfico" |
| "arruma o layout" | "qual página, qual comportamento indesejado, em qual largura de tela" |
