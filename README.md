# VÉRTICE ENEM

**Visão Estatística de Resultados, TRI, Interpretação e Comparações Educacionais**

Plataforma interativa para explorar os microdados públicos do **Exame Nacional do Ensino Médio (ENEM), de 2019 a 2023**, visualizar indicadores educacionais, comparar grupos de participantes e aprender conceitos da **Teoria de Resposta ao Item (TRI)** com questões reais das provas.

O projeto foi desenvolvido no contexto de estudos em Estatística e Ciência de Dados da Universidade Federal do Espírito Santo (UFES). É uma iniciativa acadêmica, **não oficial do INEP**.

**[Acessar o painel — endereço público atualmente disponível](https://carolinedeoli.github.io/Vertice-ENEM)** · **[Nota técnica do projeto](docs/Nota%20T%C3%A9cnica%20V%C3%89RTICE%20ENEM.pdf)** · **[Repositório da monografia](https://github.com/Carolinedeoli/Monografia)**

> **Observação sobre o endereço:** o repositório passou a se chamar `Vertice-ENEM`. O endereço do GitHub Pages deve ser conferido em **Settings → Pages** após a alteração do nome. Até essa confirmação, o link acima aponta para o endereço anterior que estava acessível.

## Funcionalidades

O VÉRTICE ENEM está organizado em oito seções:

| Seção | O que oferece |
| --- | --- |
| **Estatísticas Gerais** | Inscrições, presença nas provas e situação das redações. |
| **Redações Zeradas** | Perfil de participantes com redação zerada. |
| **Perfil dos Participantes** | Distribuições de características sociodemográficas e escolares. |
| **Desempenho** | Notas, distribuições e evolução dos resultados por área. |
| **Comparação entre Grupos** | Estatísticas descritivas, comparações de médias e tamanhos de efeito. |
| **Desigualdades Educacionais** | Cruzamentos entre características dos participantes e diferenças de desempenho. |
| **Entendendo a TRI** | Modelo 3PL, parâmetros dos itens, CCI, FII, FIT, estimação EAP, padrões de respostas e simulador didático de nota. |
| **Sobre os Dados** | Origem, tratamento, arquivos utilizados, limitações e documentação. |

As análises são exploratórias. Diferenças entre grupos não devem ser interpretadas automaticamente como efeitos causais.

## Teoria de Resposta ao Item

A página **Entendendo a TRI** permite selecionar ano, área, aplicação, caderno e questões, além de explorar os parâmetros oficiais dos itens. A estimação didática da proficiência utiliza o **modelo logístico de três parâmetros (3PL)** e o estimador **EAP (esperança a posteriori)**, com distribuição a priori normal padrão.

A nota experimental é obtida pela transformação linear da proficiência estimada, usando coeficientes calculados no projeto com base nas notas oficiais disponíveis nos microdados. Os resultados e as faixas orientativas não são notas nem margens oficiais do INEP. Alguns cadernos podem não estar habilitados para exibir nota calibrada, conforme os critérios de auditoria.

A metodologia, os filtros, os processos de validação e as limitações estão detalhados na **[Nota Técnica VÉRTICE ENEM](docs/Nota%20T%C3%A9cnica%20V%C3%89RTICE%20ENEM.pdf)**.

## Fontes e arquivos de dados

A fonte principal são os [microdados públicos do ENEM disponibilizados pelo INEP](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/enem), complementados pelos arquivos oficiais de itens e pelos cadernos e gabaritos das provas.

O site utiliza bases transformadas para consulta no navegador:

| Arquivo ou conjunto | Utilização |
| --- | --- |
| `dados/ENEM_2019.parquet` a `dados/ENEM_2023.parquet` | Microdados tratados por edição para perfil e desempenho. |
| `dados/GERAL.csv` | Agregações relativas às inscrições e à participação. |
| `dados/REDACAO.csv` | Agregações por situação da redação. |
| `dados/redacao_zerada_total.csv` | Dados tratados de participantes com redação zerada. |
| `dados/agregados/` | Resultados pré-calculados para acelerar consultas, quando disponíveis. |
| `dados/tri/catalogo_itens.json` | Itens e parâmetros psicométricos para as visualizações e a estimação EAP. |
| `dados/tri/mapa_cadernos.json` | Correspondência entre provas, posições, cadernos e gabaritos. |
| `Calibracao_TRI_ENEM/coeficientes_tri_painel_publico_v9.json` | Coeficientes e resultados agregados de calibração/auditoria do simulador. |

Os CSV originais completos utilizados na preparação e calibração são processados **fora do navegador**. Os arquivos publicados destinam-se às funcionalidades do painel e não substituem as fontes e os dicionários oficiais.

## Tecnologia e arquitetura

A interface é construída com **HTML, CSS e JavaScript** e publicada como site estático, sem backend próprio de estimação. O painel usa **DuckDB-WASM** para consultar arquivos Parquet diretamente no navegador e conta com estratégias de cache e agregações pré-calculadas.

Estrutura principal do repositório:

```text
Vertice-ENEM/
├── index.html                        # Interface e seções do painel
├── style.css                         # Estilos gerais
├── css/                              # Estilos adicionais, incluindo TRI
├── assets/                           # Identidade visual
├── src/
│   ├── app.js                        # Navegação e inicialização das páginas
│   ├── paginas/                      # Módulos das páginas, incluindo tri.js
│   ├── nucleo/                       # Estado e configuração
│   ├── infra/                        # Infraestrutura e consultas
│   ├── dominio/                      # Regras e definições dos indicadores
│   └── ui/                           # Componentes de interface
├── dados/
│   ├── agregados/
│   └── tri/
├── Calibracao_TRI_ENEM/              # JSON público de calibração da TRI
├── docs/                             # Nota técnica e documentação
├── servidor-local.mjs               # Servidor de desenvolvimento
├── DEVELOPMENT_GUIDE.md
├── README.md
└── LICENSE
```

## Como executar localmente

O painel precisa ser aberto por **HTTP**, pois a abertura direta do `index.html` por `file://` pode bloquear a leitura dos dados e dos módulos.

Na pasta raiz do projeto, com o Node.js instalado:

```bash
node servidor-local.mjs
```

Em seguida, abra `http://localhost:8123` no navegador. O servidor local incluído no projeto oferece suporte a requisições parciais (*Range*), úteis para a leitura de Parquet com DuckDB.

Outras opções de servidor HTTP podem funcionar, mas algumas não oferecem suporte a *Range* e podem exigir o download integral dos arquivos Parquet.

## Publicação

O projeto é publicado pelo **GitHub Pages**, a partir da branch `main` e da pasta raiz do repositório, sem etapa de compilação (*build*).

Depois de atualizar o conteúdo local, revise os arquivos selecionados e publique com Git:

```bash
git status --short
git add README.md
git commit -m "Atualiza README do VERTICE ENEM"
git push origin main
```

O comando `git add README.md` adiciona **somente o README** para este commit; os dados e os scripts já publicados permanecem no repositório.

> Ao alterar o nome do repositório no GitHub, confira em **Settings → Pages** o endereço ativo do site e atualize os links externos que usam o caminho antigo.

## Documentação e referências

- [Nota Técnica VÉRTICE ENEM — documentação da plataforma e metodologia de estimação das notas pela TRI](docs/Nota%20T%C3%A9cnica%20V%C3%89RTICE%20ENEM.pdf).
- [Repositório da monografia](https://github.com/Carolinedeoli/Monografia).
- [Guia de desenvolvimento](DEVELOPMENT_GUIDE.md).
- [Microdados do ENEM — INEP](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/enem).
- [Provas e gabaritos — INEP](https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos).

## Licença

Este repositório utiliza a licença **MIT**; consulte [`LICENSE`](LICENSE). A utilização dos microdados deve respeitar as condições e a documentação publicadas pelo INEP.
