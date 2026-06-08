/* =========================================
   CONTROLE DO MENU FLUTUANTE
========================================= */
function toggleFiltros() {
    const menu = document.getElementById('menuFiltros');
    if (menu) {
        menu.classList.toggle('aberto');
    }
}

// Fecha o painel caso clique fora dele
window.addEventListener('click', function(e) {
    const container = document.querySelector('.filtro-container-wrapper');
    const menu = document.getElementById('menuFiltros');
    if (menu && container && !container.contains(e.target)) {
        menu.classList.remove('aberto');
    }
});

/* =========================================
   PREENCHER FILTROS DINAMICAMENTE
========================================= */
/* =========================================
   PREENCHER FILTROS DINAMICAMENTE
========================================= */
function preencherFiltros(){
    // 1. Preenche o select de Ano com TODOS os anos da base
    preencherSelectAnoReal();
    
    // 2. Alimenta as listas de checkboxes com os seus dados reais ordenados
    preencherCheckboxLista("filtroUF", "estado_prova");
    preencherCheckboxLista("filtroEscola", "tipo_escola");
    preencherCheckboxLista("filtroDepAdm", "dep_adm");
    preencherCheckboxLista("filtroRedacao", "motivo_status");
    // 3. Vincula os eventos de mudança para recarregar os gráficos automaticamente
    configurarEventosFiltros();
}

// Nova função dedicada para listar todos os anos e marcar o último
function preencherSelectAnoReal() {
    let selectAno = document.getElementById("filtroAno");
    if (!selectAno) return;

    selectAno.innerHTML = ''; // Limpa o select

    // Extrai todos os anos únicos da sua base de dados
    let anos = [...new Set(dados.map(linha => linha.ANO))]
                .filter(valor => valor !== undefined && valor !== null && valor.toString().trim() !== "");

    // Ordena do menor para o maior (ex: 2021, 2022, 2023)
    anos.sort();

    // Cria as opções no HTML para cada ano encontrado
    anos.forEach(ano => {
        let option = document.createElement("option");
        option.value = ano;
        option.text = ano;
        selectAno.appendChild(option);
    });

    // CRUCIAL: Identifica o último ano da lista e define como selecionado por padrão
    if (anos.length > 0) {
        let ultimoAno = anos[anos.length - 1];
        selectAno.value = ultimoAno;
    }
}

function preencherCheckboxLista(idContainer, coluna){
    let container = document.getElementById(idContainer);
    if (!container) return;
    
    container.innerHTML = ''; 

    // Mapeia valores únicos da sua planilha/dados
    let valores = [...new Set(dados.map(linha => linha[coluna]))]
                    .filter(valor => valor !== undefined && valor !== null && valor.toString().trim() !== "");

    valores.sort();

    // Injeta os elementos label + input delicados no HTML
    valores.forEach(valor => {
        let label = document.createElement("label");
        label.className = "filtro-checkbox-label";
        
        let checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = valor;
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(" " + valor));
        container.appendChild(label);
    });
}

/* =========================================
   ESCUTAR MUDANÇAS E ATUALIZAR DASHBOARD
========================================= */
function configurarEventosFiltros() {
    // Monitora o select de Ano
    const selectAno = document.getElementById('filtroAno');
    if (selectAno) selectAno.addEventListener('change', atualizarPainel);

    // Monitora qualquer checkbox que o usuário marque ou desmarque
    const checkboxes = document.querySelectorAll('.filtros-card input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', atualizarPainel);
    });
}

/* =========================================
   RETORNAR SELEÇÕES PARA O PROCESSO DE FILTRAGEM
========================================= */
function obterFiltrosSelecionados() {
    const ano = document.getElementById('filtroAno').value;

    // Varre a tela buscando os checkboxes marcados em cada grupo específico
    const ufs = Array.from(document.querySelectorAll('#filtroUF input:checked')).map(cb => cb.value);
    const escolas = Array.from(document.querySelectorAll('#filtroEscola input:checked')).map(cb => cb.value);
    const depAdms = Array.from(document.querySelectorAll('#filtroDepAdm input:checked')).map(cb => cb.value);
    const depReds = Array.from(document.querySelectorAll('#filtroRedacao input:checked')).map(cb => cb.value);
    // Se o array voltar vazio (nada marcado), assumimos "Todos" para rodar o script sem quebras
    return {
        ano: ano,
        ufs: ufs.length > 0 ? ufs : "Todos",
        escolas: escolas.length > 0 ? escolas : "Todos",
        depAdms: depAdms.length > 0 ? depAdms : "Todos",
        depReds: depReds.length > 0 ? depReds : "Todos"
    };
}

/* =========================================
   FUNÇÃO LIMPAR FILTROS ATIVOS
========================================= */
function limparFiltrosAtivos() {
    // 1. Busca todos os checkboxes marcados dentro do card de filtros e desmarca
    const checkboxesMarcados = document.querySelectorAll('.filtros-card input[type="checkbox"]:checked');
    checkboxesMarcados.forEach(cb => {
        cb.checked = false;
    });

    // 2. Reseta o select do Ano de volta para o último ano disponível na base de dados
    let selectAno = document.getElementById("filtroAno");
    if (selectAno) {
        let anos = [...new Set(dados.map(linha => linha.ANO))].filter(a => a).sort();
        if (anos.length > 0) {
            selectAno.value = anos[anos.length - 1];
        }
    }

    // 3. Dispara a atualização do painel para recalcular os gráficos com o estado limpo
    if (typeof atualizarPainel === "function") {
        atualizarPainel();
    }
}