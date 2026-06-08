function atualizarTabelaRedacao(baseFiltrada){

    console.log("Tabela iniciada");

    let tabela = document.getElementById("tabelaRedacao");

    if(!tabela){
        console.error("Tabela não encontrada");
        return;
    }

    let tbody = tabela.querySelector("tbody");

    if(!tbody){
        console.error("tbody não encontrado");
        return;
    }

    tbody.innerHTML = "";

    let resumo = {};
    let total = 0;

    baseFiltrada.forEach(linha => {

        let status = linha.motivo_status || "Não Informado";

        let qtd = Number(
            String(linha.numero_pessoas || "0")
            .replace(/[^\d]/g, "")
        );

        if(!resumo[status]){
            resumo[status] = 0;
        }

        resumo[status] += qtd;
        total += qtd;
    });

    Object.keys(resumo).forEach(status => {

        let qtd = resumo[status];

        let porcentagem =
            total > 0
            ? (qtd / total) * 100
            : 0;

        let tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${status}</td>
            <td>${qtd.toLocaleString('pt-BR')}</td>
            <td>${porcentagem.toFixed(2)}%</td>
        `;

        tbody.appendChild(tr);
    });

    console.log("Tabela finalizada");
}