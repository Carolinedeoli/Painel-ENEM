// perfilCards.js

function atualizarCardsPerfil(dadosFiltrados) {
    
    const totalInscritosFiltrados = dadosFiltrados.reduce((soma, linha) => soma + (linha.TOTAL_PEOPLE || 0), 0);

    // Atualiza o card principal de total de alunos na tela
    document.getElementById('cardTotalInscritos').innerText = totalInscritosFiltrados.toLocaleString('pt-BR');

    // Exemplo: Calcular quantos desse filtro são Mulheres
    const totalMulheres = dadosFiltrados
        .filter(l => l.TP_SEXO === 'Feminino')
        .reduce((soma, linha) => soma + (linha.TOTAL_PEOPLE || 0), 0);

    const percentualMulheres = totalInscritosFiltrados > 0 ? (totalMulheres / totalInscritosFiltrados) * 100 : 0;
    
    document.getElementById('cardPercentualMulheres').innerText = `${percentualMulheres.toFixed(1)}%`;
}