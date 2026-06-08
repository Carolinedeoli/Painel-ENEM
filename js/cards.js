/* =========================================
   ATUALIZAR CARDS
========================================= */
function atualizarCards(base, baseParaMedia){
    let inscritos = 0;
    let participantes = 0;
    let redacoesValidas = 0;
    let presentesDia1 = 0;

    let limparNumero = (val) => {
        if (!val) return 0;
        let apenasDigitos = val.toString().replace(/[^\d]/g, "").trim();
        return Number(apenasDigitos) || 0;
    };

    base.forEach(linha => {

    inscritos +=
        limparNumero(linha.total_inscritos);

    participantes +=
        limparNumero(linha.qtd_participantes);

    redacoesValidas +=
        limparNumero(linha.qtd_redacoes_validas);

    presentesDia1 +=
        limparNumero(linha.qtd_presenca_dia_1);
});

    let percentParticipacao = inscritos > 0 ? (participantes / inscritos) * 100 : 0;
    let percentRedacoes =
    presentesDia1 > 0
    ? (redacoesValidas / presentesDia1) * 100
    : 0;

    // Cálculo da média histórica de participantes por ano
    let participantesTotalMedia = 0;
    baseParaMedia.forEach(linha => {
        participantesTotalMedia += limparNumero(linha.qtd_participantes);
    });
    let anosUnicos = [...new Set(baseParaMedia.map(l => l.ANO))].filter(a => a);
    let qtdAnos = anosUnicos.length || 1;
    let mediaAnos = participantesTotalMedia / qtdAnos;

    document.getElementById("totalInscritos").innerText = inscritos.toLocaleString('pt-BR');
    document.getElementById("totalParticipantes").innerText = participantes.toLocaleString('pt-BR');
    document.getElementById("percentParticipacao").innerText = percentParticipacao.toFixed(2) + "%";
    document.getElementById("percentRedacoesValidas").innerText = percentRedacoes.toFixed(2) + "%";
    document.getElementById("mediaParticipantesAno").innerText = Math.round(mediaAnos).toLocaleString('pt-BR');
}
