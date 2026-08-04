/* =========================================
   BASES GLOBAIS
========================================= */
let dados = [];
let dadosRedacao = [];

/* =========================================
   INICIAR CARREGAMENTO
========================================= */
carregarGeral();

/* =========================================
   FUNÇÃO LIMPAR DADOS
========================================= */
function limparDados(base){
    return base.map(linha => {
        let linhaLimpa = {};
        for(let chave in linha){
            let chaveLimpa = chave.replace(/\"/g, "").trim();
            let valorLimpo = linha[chave] ? String(linha[chave]).replace(/\"/g, "").trim() : "";
            linhaLimpa[chaveLimpa] = valorLimpo;
        }
        return linhaLimpa;
    });
}

/* =========================================
   CARREGAR BASE GERAL
========================================= */
function carregarGeral(){
    Papa.parse("dados/GERAL.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(resultado){
            dados = limparDados(resultado.data);
            console.log("Base Geral Carregada!");
            carregarRedacao();
        },
        error: function(erro) {
            console.error("Erro ao carregar GERAL.csv:", erro);
        }
    });
}

/* =========================================
   CARREGAR BASE REDAÇÃO
========================================= */

function carregarRedacao(){
    Papa.parse("dados/REDAÇÃO.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(resultado){
            dadosRedacao = limparDados(resultado.data);
            console.log("Base Redação Carregada!");

            // 1. Cria as opções de todos os anos e checkboxes (já selecionando o último ano automaticamente)
            preencherFiltros();
            
            // 2. Renderiza os cards, tabelas e gráficos com base no ano que foi selecionado
            atualizarPainel();
        },
        error: function(erro) {
            console.error("Erro ao carregar REDAÇÃO.csv:", erro);
        }
    });
}
/* =========================================
   FIXAR O ÚLTIMO ANO DISPONÍVEL
========================================= */
function definirUltimoAnoComoPadrao() {
    let selectAno = document.getElementById("filtroAno");
    let anos = [...new Set(dados.map(linha => linha.ANO))].filter(a => a).sort();

    if (anos.length > 0) {
        let ultimoAno = anos[anos.length - 1];
        if(selectAno) selectAno.value = ultimoAno; 
    }
}

/* =========================================
   FILTRAR E ATUALIZAR PAINEL (CORRIGIDO)
========================================= */
function atualizarPainel(){
    // IMPORTANTE: Busca os filtros ativos gerados pelos inputs e checkboxes do js/filtros.js
    const filtros = obterFiltrosSelecionados();

    // Filtro Geral (cards normais dependem do Ano selecionado e dos Checkboxes)
    let dadosFiltradosGeral = dados.filter(linha => {
        let bateAno = filtros.ano === "Todos" || linha.ANO?.toString() === filtros.ano;

        let bateUF = filtros.ufs === "Todos" || filtros.ufs.includes(linha.estado_prova);

        let bateEscola = filtros.escolas === "Todos" || filtros.escolas.includes(linha.tipo_escola);

        let bateDep = filtros.depAdms === "Todos" || filtros.depAdms.includes(linha.dep_adm);

        let bateRed = filtros.depReds === "Todos" || filtros.depReds.includes(linha.motivo_status);

        return bateAno && bateUF && bateEscola && bateDep && bateRed;
    });

    // Filtro para Média (Ignora o select de Ano, mantendo o histórico de evolução)
    let dadosParaMedia = dados.filter(linha => {
        let bateUF = filtros.ufs === "Todos" || filtros.ufs.includes(linha.estado_prova);

        let bateEscola = filtros.escolas === "Todos" || filtros.escolas.includes(linha.tipo_escola);

        let bateDep = filtros.depAdms === "Todos" || filtros.depAdms.includes(linha.dep_adm);

        let bateRed = filtros.depReds === "Todos" || filtros.depReds.includes(linha.motivo_status);

        return bateUF && bateEscola && bateDep && bateRed;
    });

    // Filtro da Redação (A tabela obedece a todos os filtros, incluindo o Ano)
    let dadosFiltradosRedacao = dadosRedacao.filter(linha => {
        let bateAno = filtros.ano === "Todos" || linha.ANO?.toString() === filtros.ano;

        let bateUF = filtros.ufs === "Todos" || filtros.ufs.includes(linha.estado_prova);

        let bateEscola = filtros.escolas === "Todos" || filtros.escolas.includes(linha.tipo_escola);

        let bateDep = filtros.depAdms === "Todos" || filtros.depAdms.includes(linha.dep_adm);

        let bateRed = filtros.depReds === "Todos" || filtros.depReds.includes(linha.motivo_status);

        return bateAno && bateUF && bateEscola && bateDep  && bateRed;
    });

    atualizarCards(dadosFiltradosGeral, dadosParaMedia);
    atualizarTabelaRedacao(dadosFiltradosRedacao);
    atualizarGraficoInscritos(dadosParaMedia);
    atualizarGraficoPresenca(dadosParaMedia);

}
/* =========================================
   GERENCIAMENTO DE ALTERNÂNCIA DE PÁGINAS 
========================================================================= */

let desempenhoJaCarregado = false; // Garante que o DuckDB só inicializa 1 vez

function alterarPagina(idPagina) {
    // OCULTA TODAS AS PÁGINAS
    document.querySelectorAll('.pagina-view').forEach(pagina => {
        pagina.style.display = 'none';
    });

    // OCULTA TODOS OS FILTROS FLUTUANTES
    const filtroGeral = document.querySelector('.filtro-container-wrapper');
    const filtroPerfil = document.querySelector('.filtro-container-wrapper-perfil');
    const filtroRedacao = document.querySelector('.filtro-container-wrapper-redacao');
    const filtroDesempenho = document.querySelector('.filtro-container-wrapper-desempenho'); 

    if(filtroGeral) filtroGeral.style.display = 'none';
    if(filtroPerfil) filtroPerfil.style.display = 'none';
    if(filtroRedacao) filtroRedacao.style.display = 'none';
    if(filtroDesempenho) filtroDesempenho.style.display = 'none';

    document.querySelectorAll('.btn-nav').forEach(btn => {
        btn.classList.remove('ativo');
    });

    // MOSTRA APENAS A PÁGINA CLICADA
    const divPagina = document.getElementById('pagina-' + idPagina);
    if(divPagina) {
        divPagina.style.display = 'flex';
    }

    // MOSTRA O FILTRO CORRETO DAQUELA PÁGINA
    if(idPagina === 'geral' && filtroGeral) filtroGeral.style.display = 'inline-block';
    if(idPagina === 'perfil' && filtroPerfil) filtroPerfil.style.display = 'inline-block';
    if(idPagina === 'redacao' && filtroRedacao) filtroRedacao.style.display = 'inline-block';
    if(idPagina === 'desempenho' && filtroDesempenho) {
        filtroDesempenho.style.display = 'inline-block';
        
        // 🌟 GATILHO: Inicializa o DuckDB de Desempenho apenas quando o usuário entra na aba pela 1ª vez
        if (!desempenhoJaCarregado && typeof iniciarDesempenho === 'function') {
            desempenhoJaCarregado = true;
            iniciarDesempenho();
        }
    }

    const btnAtivo = document.querySelector(`.btn-nav[onclick="alterarPagina('${idPagina}')"]`);
    if (btnAtivo) {
        btnAtivo.classList.add('ativo');
    }

    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 100);
}

