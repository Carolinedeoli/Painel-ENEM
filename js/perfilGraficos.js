export function renderizarGraficosInterface(raca, sexo, idade, labels) {
    const lb = labels || {};
    const lbRaca = lb.COR_RACA || window.LABELS_COR_RACA || {};
    const lbIdade = lb.FAIXA_ETARIA || window.LABELS_FAIXA_ETARIA || {};

    // 1. Gráfico Raça
    
    const containerRaca = document.getElementById('graficoRaca');
    if (containerRaca) {
        const traceRaca = [{
            // 🌟 A MAGIA AQUI: O .replace(" ", "<br>") faz o "Não Informado" virar "Não<br>Informado" apenas para o Plotly
            x: raca.map(r => {
                const nomeCompleto = lbRaca[String(r.TP_COR_RACA)] || r.TP_COR_RACA;
                return nomeCompleto === "Não Informado" ? "Não<br>Informado" : nomeCompleto;
            }),
            y: raca.map(r => Number(r.qtd)),
            type: 'bar', marker: { color: '#3498db' }
        }];
        Plotly.newPlot('graficoRaca', traceRaca, { 
            margin: { t: 5, b: 25, l: 35, r: 10 },  
            xaxis: {automargin: true},
            yaxis: {automargin: true} 
        }, { responsive: true });
    }



    // 2. Gráfico Sexo
    const containerSexo = document.getElementById('graficoSexo');
    if (containerSexo) {
        const dSexo = {};
        sexo.forEach(s => dSexo[s.TP_SEXO] = Number(s.qtd));
        const totalS = (dSexo['M'] || 0) + (dSexo['F'] || 0);
        const pF = totalS > 0 ? ((dSexo['F'] || 0) / totalS * 100).toFixed(1) : 0;
        const pM = totalS > 0 ? ((dSexo['M'] || 0) / totalS * 100).toFixed(1) : 0;

        const traceSexo = [
            { x: [dSexo['F'] || 0], y: ['Sexo'], orientation: 'h', type: 'bar', name: 'Feminino', text: [`${pF}%`], textposition: 'inside', marker: { color: '#f39c12' } },
            { x: [dSexo['M'] || 0], y: ['Sexo'], orientation: 'h', type: 'bar', name: 'Masculino', text: [`${pM}%`], textposition: 'inside', marker: { color: '#2ecc71' } }
        ];
        Plotly.newPlot('graficoSexo', traceSexo, { 
            barmode: 'stack', bargap: 0.5, margin: { t: 10, b: 30, l: 40, r: 20 }, 
            xaxis: { visible: false }, yaxis: { visible: false }, showlegend: true
        }, { responsive: true });
    }

// 3. Gráfico Faixa Etária

const containerIdade = document.getElementById('graficoIdade');
if (containerIdade) {
    const traceIdade = [{
        x: idade.map(i => Number(i.qtd)),
        y: idade.map(i => lbIdade[String(i.TP_FAIXA_ETARIA)] || i.TP_FAIXA_ETARIA),
        type: 'bar', 
        orientation: 'h', 
        marker: { color: '#002d62' }
    }];

    Plotly.newPlot('graficoIdade', traceIdade, { 
        height: 340, 
        bargap: 0.4, 
        
        // 🌟 REMOVIDO: O objeto title foi totalmente retirado já que você usa o h3 do HTML.
        
        // 🌟 AJUSTADO: Mudamos 't' de 30 para 0 para eliminar o vácuo de cima.
        // Aumentamos o 'b' para 40/50 caso precise de espaço para os números do eixo X (ex: 200k, 400k).
        margin: { t: 0, b: 40, l: 110, r: 20 }, 
        
        yaxis: { 
            autorange: 'reversed', 
            automargin: true 
        },
        xaxis: {
            automargin: true
        }
    }, { responsive: true });
}}