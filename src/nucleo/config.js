/* =========================================================================
   CONFIG.JS — DETECÇÃO DE AMBIENTE E RESOLUÇÃO DAS URLS DE DADOS

   Descobre sozinho onde o painel está rodando (arquivo local, servidor
   local, GitHub Pages ou outro servidor) e monta as URLs corretas da pasta
   "dados/" para todos os outros módulos.

   A raiz do site vem do endereço deste próprio módulo (import.meta.url), e
   não de aritmética sobre window.location.pathname — que quebrava em
   subpastas, em URLs sem barra final e em file://.
========================================================================= */

/* -------------------------------------------------------------------------
   1. RAIZ DO SITE

   Este arquivo mora em <raiz>/src/nucleo/config.js, então a raiz está três
   níveis acima. Vale igualmente para:

     file:///C:/Projetos/Painel-ENEM/index.html
     http://localhost:8123/qualquer/subpasta/
     https://usuario.github.io/Painel-ENEM/
     https://dominio-proprio.com.br/
------------------------------------------------------------------------- */
const urlBase = new URL("../../", import.meta.url).href;

/* -------------------------------------------------------------------------
   2. AMBIENTE
------------------------------------------------------------------------- */
function detectarAmbiente() {
    const protocolo = window.location.protocol;
    const host = window.location.hostname;

    if (protocolo === "file:") return "arquivo";

    const HOSTS_LOCAIS = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"];
    if (HOSTS_LOCAIS.includes(host) || host.endsWith(".local")) return "local";

    if (host.endsWith(".github.io")) return "github-pages";

    return "servidor";
}

/* -------------------------------------------------------------------------
   3. BASE DOS DADOS (com pontos de override)

   A ordem de precedência permite mover os arquivos pesados para fora do
   repositório (Release do GitHub, bucket, CDN) sem tocar em código:

     1º  ?dados=https://.../   ......... teste rápido pela barra do navegador
     2º  window.PAINEL_DADOS_BASE ...... definido antes deste módulo
     3º  <meta name="painel-dados-base" content="https://.../">
     4º  <raiz>/dados/  ................ padrão (dados dentro do repositório)
------------------------------------------------------------------------- */
function garantirBarraFinal(url) {
    const absoluta = new URL(url, document.baseURI).href;
    return absoluta.endsWith("/") ? absoluta : absoluta + "/";
}

function descobrirBaseDados() {
    const parametro = new URLSearchParams(window.location.search).get("dados");
    if (parametro) return garantirBarraFinal(parametro);

    if (window.PAINEL_DADOS_BASE) return garantirBarraFinal(window.PAINEL_DADOS_BASE);

    const meta = document.querySelector('meta[name="painel-dados-base"]');
    if (meta && meta.content) return garantirBarraFinal(meta.content);

    return urlBase + "dados/";
}

const ambiente = detectarAmbiente();
const baseDados = descobrirBaseDados();

// Em file:// o navegador bloqueia toda requisição para outros arquivos
// locais (CORS de origem "null"), então nem o PapaParse nem o DuckDB
// conseguem ler a pasta dados/. É o único ambiente sem dados.
const rodandoDeArquivo = ambiente === "arquivo";

/* -------------------------------------------------------------------------
   4. CONFIGURAÇÃO
------------------------------------------------------------------------- */
export const config = {
    ambiente,
    urlBase,
    baseDados,

    ehArquivoLocal: rodandoDeArquivo,
    ehLocal: ambiente === "local",
    ehGitHubPages: ambiente === "github-pages",
    publicado: ambiente === "github-pages" || ambiente === "servidor",

    // Só há como carregar dados quando existe um servidor HTTP na frente.
    podeCarregarDados: !rodandoDeArquivo,

    /**
     * Monta a URL de um arquivo dentro da pasta de dados.
     *
     * Cada segmento é codificado, para o caso de algum arquivo voltar a ter
     * espaço ou acento no nome. Ainda assim, prefira nomes só com ASCII: o
     * relay dos dev tunnels do VS Code responde 502 a caminhos acentuados,
     * mesmo percent-encoded.
     */
    arquivo(nome) {
        const caminho = String(nome).split("/").map(encodeURIComponent).join("/");
        return baseDados + caminho;
    },

    /**
     * Baixa e interpreta um CSV da pasta de dados.
     *
     * O download é feito por fetch, e não pelo "download: true" do PapaParse,
     * só para poder conferir o status da resposta: o callback de erro do
     * PapaParse entrega um objeto sem mensagem, o que produzia diagnósticos
     * inúteis do tipo "Detalhe: Error." quando o servidor tinha respondido
     * 404 ou 502.
     */
    async baixarCsv(nome) {
        const url = config.arquivo(nome);
        let resposta;

        try {
            resposta = await fetch(url);
        } catch (erro) {
            throw new Error(
                "não foi possível alcançar " + url
                + " (" + (erro && erro.message ? erro.message : "falha de rede") + ")"
            );
        }

        if (!resposta.ok) {
            throw new Error(
                "o servidor respondeu " + resposta.status + " " + resposta.statusText
                + " para " + url
            );
        }

        const texto = await resposta.text();
        return Papa.parse(texto, { header: true, skipEmptyLines: true }).data;
    },

    /**
     * Verifica se o servidor aceita requisições parciais (Range).
     * O DuckDB só consegue ler pedaços de um Parquet quando isso existe;
     * sem Range ele baixa o arquivo inteiro. O GitHub Pages aceita;
     * o "python -m http.server" NÃO aceita.
     */
    async suportaRange(nome) {
        if (rodandoDeArquivo) return false;
        try {
            const resposta = await fetch(config.arquivo(nome), { method: "HEAD" });
            return resposta.headers.get("accept-ranges") === "bytes";
        } catch (erro) {
            return false;
        }
    }
};

/* -------------------------------------------------------------------------
   5. DIAGNÓSTICO NO CONSOLE
------------------------------------------------------------------------- */
const ROTULOS_AMBIENTE = {
    "arquivo": "arquivo local (file://) — sem servidor",
    "local": "servidor local",
    "github-pages": "GitHub Pages",
    "servidor": "servidor web"
};

console.log(
    "%c[Painel ENEM]%c ambiente: " + ROTULOS_AMBIENTE[ambiente]
    + "\n  raiz do site : " + urlBase
    + "\n  base de dados: " + baseDados,
    "font-weight:bold;color:#2a78d6", "color:inherit"
);

if (rodandoDeArquivo) {
    console.warn(
        "[Painel ENEM] O painel foi aberto direto do disco (file://).\n"
        + "O navegador bloqueia a leitura da pasta dados/ nesse modo.\n"
        + "Na pasta do projeto, rode:  node servidor-local.mjs"
    );
}

export default config;
