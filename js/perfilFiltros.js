// perfilFiltros.js

function aplicarFiltrosPerfil() {
    // 1. Captura o ano selecionado no painel (ex: "2022" ou "2023")
    const anoSelecionado = document.getElementById('seletorAno').value;

    // 2. Captura os valores dos outros filtros (Checkboxes/Selects)
    const estadosSelecionados = obterCheckboxesMarcados('filtro_estado');
    const sexosSelecionados = obterCheckboxesMarcados('filtro_sexo');
    const escolasSelecionadas = obterCheckboxesMarcados('filtro_escola');
    // ... adicione os outros filtros do seu painel aqui

    // 3. Filtra a base DIM_PERFIL_UNICO na memória
    const dadosFiltrados = dadosPerfilGeral.filter(linha => {
        // Filtro obrigatório de ANO (Crucial para separar 2022 de 2023)
        if (linha.ANO != anoSelecionado) return false;

        // Filtros dinâmicos (se houver algo marcado, filtra; se não, passa tudo)
        if (estadosSelecionados.length > 0 && !estadosSelecionados.includes(linha.estado_prova)) return false;
        if (sexosSelecionados.length > 0 && !sexosSelecionados.includes(linha.TP_SEXO)) return false;
        if (escolasSelecionadas.length > 0 && !escolasSelecionadas.includes(linha.tipo_escola)) return false;
        
        return true;
    });

    // 4. Envia os dados filtrados para atualizar os gráficos e os cards da tela
    atualizarCardsPerfil(dadosFiltrados);
    atualizarGraficosPerfil(dadosFiltrados);
}

// Função auxiliar para capturar os checkboxes ativos
function obtenerCheckboxesMarcados(nameClasse) {
    return Array.from(document.querySelectorAll(`.${nameClasse}:checked`)).map(el => el.value);
}