export function renderizarTabelasInterface(escola, dep, conclusao, labels) {
    // Garante que o objeto existirá para não dar erro de undefined
    const lb = labels || {};
    const lbEscola = lb.ESCOLA || window.LABELS_ESCOLA || {};
    const lbDep = lb.DEP_ADM || window.LABELS_DEP_ADM || {};
    const lbConclusao = lb.CONCLUSAO || window.LABELS_CONCLUSAO || {};

    const criarHtmlTabela = (dados, col, titulo, labelMap) => {
        let total = dados.reduce((s, l) => s + Number(l.qtd), 0);
        let html = `<table class="tabela-estilo-painel"><thead><tr><th>${titulo}</th><th>% Participantes</th></tr></thead><tbody>`;
        
        dados.forEach(l => {
            let nome = labelMap ? (labelMap[String(l[col])] || l[col]) : l[col];
            let qtdNumerica = Number(l.qtd);
            let perc = total > 0 ? ((qtdNumerica / total) * 100).toFixed(1) : 0;
            html += `<tr><td>${nome || "Não Informado"}</td><td>${perc}%</td></tr>`;
        });
        return html + "</tbody></table>";
    };

    if (document.getElementById("tabelaEscola")) {
        document.getElementById("tabelaEscola").innerHTML = criarHtmlTabela(escola, "tipo_escola", "Escola", lbEscola);
    }
    if (document.getElementById("tabelaDepAdm")) {
        document.getElementById("tabelaDepAdm").innerHTML = criarHtmlTabela(dep, "dep_adm", "Dependência", lbDep);
    }

    const containerConclusao = document.getElementById("tabelaConclusao");
    if (containerConclusao) {
        let totalC = conclusao.reduce((s, l) => s + Number(l.qtd), 0);
        let htmlC = `<table class="tabela-estilo-painel"><thead><tr><th>Situação</th><th>Nº Participantes</th><th>% Participantes</th></tr></thead><tbody>`;
        conclusao.forEach(l => {
            let nomeConclusao = lbConclusao[String(l.TP_ST_CONCLUSAO)] || l.TP_ST_CONCLUSAO;
            let qtdNumerica = Number(l.qtd);
            let perc = totalC > 0 ? ((qtdNumerica / totalC) * 100).toFixed(1) : 0;
            htmlC += `<tr><td>${nomeConclusao || "Não Informado"}</td><td>${qtdNumerica.toLocaleString('pt-BR')}</td><td>${perc}%</td></tr>`;
        });
        containerConclusao.innerHTML = htmlC + "</tbody></table>";
    }
}