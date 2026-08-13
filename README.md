# Painel ENEM (2019 – 2023)

Painel interativo dos microdados do ENEM, escrito em JavaScript puro e
publicado como site estático. Não há backend: os arquivos Parquet são
consultados no próprio navegador com [DuckDB-WASM][duckdb].

**Seções:** Estatísticas Gerais · Redações Zeradas · Perfil dos Participantes ·
Desempenho · Sobre os Dados.

---

## Como rodar localmente

O painel **precisa de um servidor HTTP**. Abrir o `index.html` direto do disco
(`file://`) não funciona: o navegador bloqueia a leitura da pasta `dados/`
nesse modo. O painel detecta essa situação e mostra a instrução na tela.

```bash
# Recomendado — não precisa instalar nada e aceita requisições parciais
# (Range), que o DuckDB usa para ler só os pedaços necessários de cada Parquet
node servidor-local.mjs          # http://localhost:8123

# Alternativa equivalente
npx serve .

# Funciona, mas NÃO aceita Range: o DuckDB acaba baixando cada arquivo
# Parquet inteiro, o que deixa as abas pesadas bem mais lentas
python -m http.server 8000
```

Depois é só abrir o endereço que o comando imprimir.

## Como publicar

O repositório é servido como está pelo **GitHub Pages** (Settings → Pages →
branch `main`, pasta raiz). Não há passo de build.

O painel descobre sozinho onde está rodando — `file://`, servidor local,
GitHub Pages ou outro domínio — e monta as URLs da pasta `dados/` a partir do
endereço do próprio `js/config.js`. Isso funciona igualmente em
`usuario.github.io/Painel-ENEM/` e em um domínio próprio, sem configuração.

### Servir os dados de outro lugar

Os cinco Parquet somam cerca de 290 MB dentro do repositório. Para movê-los
para um Release do GitHub, um bucket ou um CDN, basta preencher a meta tag no
`index.html` — nenhum outro arquivo muda:

```html
<meta name="painel-dados-base" content="https://meu-cdn.exemplo/enem/">
```

Também dá para apontar para outra base sem editar nada, útil para teste:

```
https://usuario.github.io/Painel-ENEM/?dados=https://meu-cdn.exemplo/enem/
```

---

## Estrutura

```
index.html                Marcação das cinco páginas
style.css                 Tokens de tema (claro/escuro) e layout
servidor-local.mjs        Servidor de desenvolvimento com suporte a Range

src/
  app.js                  Navegação, tema e orquestração das páginas

  nucleo/
    config.js             Detecção de ambiente e URLs dos dados
    estado.js             Estado central dos filtros (ano, área, recortes)
    cache.js              Memoização de resultados de consulta

  infra/
    duckdb.js             Instância única do DuckDB-WASM e cache de consultas
    cache-consultas.js    Cache de resultados em IndexedDB, entre sessões
    agregados.js          Resultados pré-calculados publicados com o site
    preaquecimento.js     Enche o cache em segundo plano (plano B)
    preferencias.js       Preferências do usuário em SQLite (sql.js)

  dominio/
    rotulos.js            Dicionários de códigos do ENEM
    dimensoes.js          Catálogo das colunas filtráveis
    areas.js              Áreas da prova, proficiência e títulos por área
    indicadores.js        Catálogo dos indicadores, com descrição
    filtros-servico.js    Carga e reconciliação das opções de filtro

  ui/
    estados.js            Estados de carregando, erro e vazio
    indicador.js          Componente de indicador
    painel-filtros.js     Gaveta de filtros
    seletor-ano.js        Filtro rápido de ano, em tags
    tags-filtros.js       Tags do recorte ativo

  graficos/
    tema.js               Paleta, layout e métrica comuns
    tipos.js              Catálogo de tipos de gráfico
    painel-grafico.js     Caixa de gráfico com título dinâmico e tipo

  paginas/
    geral.js  redacao.js  perfil.js  desempenho.js
    perfil-comum.js       Visão comum a Perfil e Redações Zeradas

dados/
  ENEM_2019..2023.parquet   Microdados tratados, um arquivo por edição
  GERAL.csv                 Agregado de inscrição e presença
  REDACAO.csv               Agregado por motivo de status da redação
  redacao_zerada_total.csv  Participantes com redação zerada
  agregados/                Resultados pré-calculados (gerados — veja abaixo)
    comum.json              O que não pertence a um ano só
    2019.json … 2023.json   Um arquivo por edição
```

### Antes de publicar: gere os agregados

Sem os arquivos em `dados/agregados/`, cada visitante novo recalcula os mesmos
91 agregados no próprio navegador — o que transfere cerca de **3 GB por
visita**. Com eles, a primeira tela custa **6,6 KB**.

A carga acontece em duas ondas: `comum.json` mais o ano que está na tela são
esperados; os demais anos chegam em segundo plano, enquanto o usuário lê.

```
1. rode o painel localmente e limpe o cache:
   await PainelENEM.limparCache()   e recarregue a página
2. espere PainelENEM.preaquecimento() chegar a 100%
3. await PainelENEM.gerarAgregados()
   (o navegador pede permissão para baixar vários arquivos — aceite)
4. salve todos em dados/agregados/
```

Refaça sempre que alterar as consultas das páginas ou republicar os Parquet.
Confira com `PainelENEM.agregados()`: a origem deve ser `publicado`.

Cada página só é inicializada quando o usuário abre a aba correspondente —
nenhum dado pesado é baixado antes disso.

Para mexer no código, comece pelo
[`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md): ele descreve as camadas, o
contrato de dados dos gráficos, o estado dos filtros, a estratégia de cache e
traz um modelo de prompt para alterações com auxílio de IA.

## Fonte dos dados

[Microdados do ENEM — INEP, Dados Abertos][inep]. As transformações aplicadas
e a definição de cada indicador estão descritas na aba **Sobre os Dados** do
próprio painel.

O documento [`docs/analise-e-melhorias.md`](docs/analise-e-melhorias.md) reúne
a análise técnica do projeto e a lista priorizada de melhorias na camada de
dados.

## Licença

MIT — veja [LICENSE](LICENSE).

[duckdb]: https://duckdb.org/docs/api/wasm/overview.html
[inep]: https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/enem
