/* Página Comparação entre Grupos — consultas locais em DuckDB-WASM.
 * O navegador recebe apenas agregados; nunca transfere milhões de notas.
 * Estatística de Games–Howell baseada em jStat.tukey (carregada sob demanda).
 */
import * as estado from '../nucleo/estado.js';
import * as ui from '../ui/estados.js';
import {config} from '../nucleo/config.js';
import {consultar, montarWhere, tabelaDoAno} from '../infra/duckdb.js';
import {sincronizarOpcoes} from '../dominio/filtros-servico.js';
import {DIMENSOES} from '../dominio/dimensoes.js';
import {traduzir, normalizarCodigo} from '../dominio/rotulos.js';
import {OPCOES_AREA, AREA_GERAL, expressaoDaArea, nomeDaArea, TEM_TODAS_AS_NOTAS} from '../dominio/areas.js';
import {layout, opcoes, serie, comAlfa} from '../graficos/tema.js';
import {calcularWelch, calcularLevene, calcularEtaQuadrado, calcularOmegaClassico, calcularPar, magnitudeEta, significativo} from '../dominio/testes-comparacao.js';

const PAGINA='comparacao';
const COLUNAS=['escolaridade_mae','renda_familiar','dep_adm','tipo_escola','TP_FAIXA_ETARIA','TP_COR_RACA','internet','TP_SEXO'];
const selecionado={coluna:'escolaridade_mae', area:AREA_GERAL, grafico:'densidade'};
const CORES_20=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#7a58c4',
    '#159ead','#ae6b31','#be526b','#68862c','#3e9be0','#b55e21',
    '#218878','#cc9b19','#b55baa','#6154ad','#d26f4b','#389751','#9c8e3a','#c35c91'];
function corDaCategoria(codigo){
    const chave=normalizarCodigo(codigo);
    let indice;
    if(/^[A-Q]$/.test(chave))indice=chave.charCodeAt(0)-65;
    else if(/^\d+$/.test(chave))indice=(Number(chave)+19)%20;
    else indice=Array.from(chave).reduce((h,c)=>(h*31+c.charCodeAt(0))%20,0);
    return indice<5 ? serie(indice) : CORES_20[indice%20];
}
function ordenarCategorias(a,b){
    const ca=normalizarCodigo(a.grupo),cb=normalizarCodigo(b.grupo);
    if(ca==='__SEM_INFO__')return 1;
    if(cb==='__SEM_INFO__')return -1;
    if(/^\d+$/.test(ca)&&/^\d+$/.test(cb))return Number(ca)-Number(cb);
    return ca.localeCompare(cb,'pt-BR');
}
const pt0 = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:0});
const pt1 = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:1});
const pt3 = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:3});
let iniciado=false, estatisticas=[], histograma=[], pares=[];
let carregamentoEstatistica=null;

const el=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,casas=1)=>Number.isFinite(Number(n)) ? (casas===0?pt0:casas===3?pt3:pt1).format(Number(n)) : '—';
const fmtP=p=>!Number.isFinite(p)?'—':p<.0001?'< 0,0001':fmt(p,3);
const proximaPintura=()=>new Promise(resolve=>setTimeout(resolve,0));
const atual=exe=>!exe||exe.ehAtual();
const info=msg=>{const elemento=el('cgAndamento'); if(elemento)elemento.textContent=msg;};

function carregarJstat(){
    if(window.jStat?.tukey?.cdf && window.jStat?.tukey?.inv)return Promise.resolve(window.jStat);
    if(carregamentoEstatistica)return carregamentoEstatistica;
    carregamentoEstatistica=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='https://cdn.jsdelivr.net/npm/jstat@1.9.6/dist/jstat.min.js';
        script.async=true;
        script.onload=()=>window.jStat?.tukey?.cdf&&window.jStat?.tukey?.inv
            ?resolve(window.jStat):reject(new Error('Biblioteca estatística indisponível ou incompatível.'));
        script.onerror=()=>reject(new Error('Não foi possível carregar jStat (CDN). Verifique a conexão.'));
        document.head.appendChild(script);
    }).catch(err=>{carregamentoEstatistica=null; throw err;});
    return carregamentoEstatistica;
}

export async function iniciar(){
    if(iniciado)return;
    const variavel=el('cgVariavel'), area=el('cgArea');
    variavel.innerHTML=COLUNAS.map(c=>`<option value="${c}">${esc(DIMENSOES[c].rotulo)}</option>`).join('');
    area.innerHTML=OPCOES_AREA.map(a=>`<option value="${a.valor}">${esc(a.rotulo)}</option>`).join('');
    variavel.value=selecionado.coluna; area.value=selecionado.area;
    variavel.addEventListener('change',()=>{selecionado.coluna=variavel.value; estado.revalidar(PAGINA);});
    area.addEventListener('change',()=>{selecionado.area=area.value; estado.revalidar(PAGINA);});
    document.querySelectorAll('#pagina-comparacao [data-cg-grafico]').forEach(b=>{
        b.addEventListener('click',()=>{
            selecionado.grafico=b.dataset.cgGrafico;
            document.querySelectorAll('#pagina-comparacao [data-cg-grafico]')
                .forEach(c=>c.classList.toggle('ativo',c===b));
            void plotar().catch(err=>console.error('[Comparação] Gráfico:',err));
        });
    });
    el('cgBusca').addEventListener('input',tabelaPares);
    el('cgDownload').addEventListener('click',baixarPares);
    iniciado=true;
    if(!config.podeCarregarDados){ui.avisarSemServidor(PAGINA);return;}
    estado.assinar(PAGINA,atualizar);
    estado.revalidar(PAGINA);
}

function construirFonte(ano,recorte,coluna,area){
    const tabela=`'${tabelaDoAno(ano)}'`;
    const expressao=expressaoDaArea(area);
    // As áreas individuais exigem apenas sua nota. Média geral exige todas as cinco notas.
    const valido=area===AREA_GERAL ? TEM_TODAS_AS_NOTAS : `${expressao} IS NOT NULL`;
    const where=montarWhere(recorte)+` AND ${valido}`;
    const base=`SELECT COALESCE(CAST(${coluna} AS VARCHAR),'__SEM_INFO__') AS grupo, `+
        `${expressao} AS nota FROM ${tabela} ${where}`;
    return base;
}

async function resumo(base){
    return consultar(`WITH base AS (${base}) SELECT grupo, CAST(COUNT(*) AS BIGINT) AS n, `+
        `AVG(nota) AS media, STDDEV_SAMP(nota) AS dp, VAR_SAMP(nota) AS var, `+
        `MIN(nota) AS minimo, MAX(nota) AS maximo, `+
        `QUANTILE_CONT(nota,0.25) AS q1, QUANTILE_CONT(nota,0.5) AS mediana, `+
        `QUANTILE_CONT(nota,0.75) AS q3, SKEWNESS(nota) AS assimetria, `+
        `KURTOSIS(nota) + 3 AS curtose FROM base GROUP BY grupo ORDER BY grupo`);
}
async function bins(base){
    // 10 pontos por faixa; retorna <= 101 * quantidade de grupos em vez de linhas individuais.
    return consultar(`WITH base AS (${base}) SELECT grupo, `+
        `CAST(FLOOR(nota/10.0) AS INTEGER) AS faixa, CAST(COUNT(*) AS BIGINT) AS n `+
        `FROM base GROUP BY grupo,faixa ORDER BY grupo,faixa`);
}
async function desviosLevene(base,medianas){
    const partes=medianas.filter(g=>g.n>0).map(g=>`WHEN grupo = '${String(g.grupo).replace(/'/g,"''")}' THEN ${Number(g.mediana)}`);
    const expr=`ABS(nota - (CASE ${partes.join(' ')} END))`;
    return consultar(`WITH base AS (${base}), medidas AS (SELECT grupo, ${expr} AS z FROM base) `+
        `SELECT grupo, CAST(COUNT(*) AS BIGINT) AS n, AVG(z) AS media_z, VAR_SAMP(z) AS var_z `+
        `FROM medidas GROUP BY grupo ORDER BY grupo`);
}

function traduzirGrupo(coluna,codigo){
    if(codigo==='__SEM_INFO__')return 'Não informado';
    return traduzir(DIMENSOES[coluna]?.mapa,normalizarCodigo(codigo));
}
function preparar(rows,coluna){
    return rows.map((r,i)=>({
        grupo:String(r.grupo), rotulo:traduzirGrupo(coluna,r.grupo),
        n:Number(r.n), media:Number(r.media), dp:Number(r.dp), var:Number(r.var),
        minimo:Number(r.minimo), maximo:Number(r.maximo), q1:Number(r.q1),
        mediana:Number(r.mediana),q3:Number(r.q3),
        assimetria:r.assimetria==null?null:Number(r.assimetria),
        curtose:r.curtose==null?null:Number(r.curtose),
        cor:corDaCategoria(r.grupo)
    })).sort(ordenarCategorias);
}

async function atualizar(exe){
    const ano=estado.ano(), coluna=selecionado.coluna, area=selecionado.area;
    const encerrar=ui.atualizando(PAGINA,'Consultando '+ano+'…',exe);
    info('Consultando os microdados…');
    try {
        await sincronizarOpcoes(PAGINA,`'${tabelaDoAno(ano)}'`);
        if(!atual(exe))return;
        const recorte=estado.recorte(PAGINA);
        const filtrosAtivos=Object.values(recorte).filter(v=>Array.isArray(v)&&v.length>0).length;
        el('cgRecorteLabel').textContent=`${ano} · ${filtrosAtivos} ${filtrosAtivos===1?'filtro ativo':'filtros ativos'}`;
        el('cgAvisoFiltro').textContent=(recorte[coluna]?.length)
            ?'A variável comparada também está filtrada. Retire esse filtro para ver todas as categorias.'
            :'';
        const base=construirFonte(ano,recorte,coluna,area);
        const linhas=await resumo(base);
        if(!atual(exe))return;
        const preparados=preparar(linhas,coluna);
        if(!preparados.length){ui.vazio(PAGINA,'Sem observações','Nenhuma nota encontrada para esse recorte.');return;}
        info('Preparando as distribuições e os quartis…');
        const [h,z]=await Promise.all([bins(base),desviosLevene(base,preparados)]);
        if(!atual(exe))return;
        estatisticas=preparados; histograma=h;
        pares=[];
        el('cgGamesValor').textContent='Calculando…';
        el('cgGamesMeta').textContent='Aguarde a análise par a par.';
        el('cgGamesDecisao').textContent='Aguardando comparações.';
        const zMap=new Map(z.map(x=>[String(x.grupo),x]));
        const gn=preparados.map(g=>{
            const d=zMap.get(g.grupo);
            return {...g,mediaZ:d?Number(d.media_z):NaN,varZ:d?Number(d.var_z):NaN};
        });
        pintarResumo(preparados);
        tabelaDescritiva(preparados);
        await plotar();
        if(!atual(exe))return;
        info('Calculando Levene, Welch e Games-Howell…');
        await proximaPintura();
        const jStat=await carregarJstat();
        if(!atual(exe))return;
        const elegiveis=gn.filter(g=>g.n>=2 && g.var>0);
        const levene=calcularLevene(gn,jStat);
        const welch=calcularWelch(gn,jStat);
        const eta=calcularEtaQuadrado(gn);
        const omega=calcularOmegaClassico(gn);
        preencherTestes(levene,welch,eta,omega,elegiveis.length);
        for(let i=0;i<elegiveis.length;i++){
            for(let j=i+1;j<elegiveis.length;j++){
                const par=calcularPar(elegiveis[i],elegiveis[j],elegiveis.length,jStat);
                if(par)pares.push(par);
            }
            if(i%2===0){
                info(`Calculando comparações (${i+1}/${elegiveis.length} grupos)…`);
                await proximaPintura();
                if(!atual(exe))return;
            }
        }
        if(!atual(exe))return;
        tabelaPares();
        preencherGames();
        interpretar(levene,welch,eta,omega,preparados,pares,elegiveis.length);
        info('');
        // Somente fecha o carregamento depois dos gráficos, tabelas e testes concluídos.
        ui.pronto(PAGINA);
    }catch(err){
        if(atual(exe))ui.mostrarFalha(PAGINA,'Comparação entre Grupos',err);
        console.error('[Comparação entre Grupos]',err);
    }finally{encerrar();}
}

function pintarResumo(grupos){
    const total=grupos.reduce((s,g)=>s+g.n,0);
    const validos=grupos.filter(g=>Number.isFinite(g.media));
    const maior=validos.length ? Math.max(...validos.map(g=>g.media))-Math.min(...validos.map(g=>g.media)) : NaN;
    el('cgTotal').textContent=fmt(total,0);
    el('cgCategorias').textContent=fmt(grupos.length,0);
    el('cgDiferenca').textContent=fmt(maior)+' pontos';
}
function tabelaDescritiva(grupos){
    const corpo=el('cgCorpoDescritiva');
    corpo.innerHTML=grupos.map(g=>`<tr><td><span style="color:${g.cor}">●</span> ${esc(g.rotulo)}</td>`+
        `<td class="num">${fmt(g.n,0)}</td><td class="num">${fmt(g.media)}</td>`+
        `<td class="num">${fmt(g.dp)}</td><td class="num">${fmt(g.minimo)}</td>`+
        `<td class="num">${fmt(g.q1)}</td><td class="num">${fmt(g.mediana)}</td>`+
        `<td class="num">${fmt(g.q3)}</td><td class="num">${fmt(g.maximo)}</td>`+
        `<td class="num">${Number.isFinite(g.assimetria)?fmt(g.assimetria,3):'—'}</td>`+
        `<td class="num">${Number.isFinite(g.curtose)?fmt(g.curtose,3):'—'}</td></tr>`).join('');
}

/** Curvas por suavização gaussiana dos histogramas de 10 pontos. Não usa densidade normal paramétrica. */
function tracosDensidade(){
    const agrupado=new Map();
    histograma.forEach(r=>{
        const key=String(r.grupo);
        if(!agrupado.has(key))agrupado.set(key,[]);
        agrupado.get(key).push([Number(r.faixa)*10+5,Number(r.n)]);
    });
    const eixos=Array.from({length:101},(_,i)=>i*10);
    return estatisticas.map(g=>{
        const n=g.n;
        const h=Math.max(13, Math.min(65, 0.9*1.06*Math.min(g.dp || 60,(g.q3-g.q1)/1.34 || 60)*Math.pow(n,-0.2)*5));
        const fontes=agrupado.get(g.grupo)||[];
        const yy=eixos.map(x=>{
            let acc=0;
            for(const [centro,contagem] of fontes){
                const u=(x-centro)/h;
                if(Math.abs(u)<5)acc += contagem*Math.exp(-u*u/2);
            }
            return acc/(n*h*Math.sqrt(2*Math.PI))*1000; // % estimado por faixa de 10 pontos
        });
        return {type:'scatter',mode:'lines',name:g.rotulo,x:eixos,y:yy,
            line:{color:g.cor,width:2,shape:'spline'},fill:'tozeroy',fillcolor:comAlfa(g.cor,.05),
            hovertemplate:'Nota %{x:.0f}<br>%{y:.2f}% (faixa de 10 pontos)<extra>'+g.rotulo+'</extra>'};
    });
}
function tracosHistograma(){
    const ag=new Map();
    histograma.forEach(r=>{
        const k=String(r.grupo);
        if(!ag.has(k))ag.set(k,[]);
        ag.get(k).push([Number(r.faixa)*10+5,Number(r.n)]);
    });
    return estatisticas.map(g=>({type:'bar',name:g.rotulo,
        x:(ag.get(g.grupo)||[]).map(r=>r[0]),
        y:(ag.get(g.grupo)||[]).map(r=>r[1]/g.n*100),
        marker:{color:g.cor},opacity:.48,
        hovertemplate:'Nota %{x}<br>%{y:.2f}% do grupo<extra>'+g.rotulo+'</extra>'}));
}
function tracosBoxplot(){
    return estatisticas.map(g=>({type:'box',name:g.rotulo,orientation:'h',
        y:[g.rotulo],q1:[g.q1],median:[g.mediana],q3:[g.q3],lowerfence:[g.minimo],upperfence:[g.maximo],
        marker:{color:g.cor},line:{color:g.cor},fillcolor:comAlfa(g.cor,.18),boxpoints:false,
        hovertemplate:g.rotulo+'<br>Q1: '+fmt(g.q1)+'<br>Mediana: '+fmt(g.mediana)+
            '<br>Q3: '+fmt(g.q3)+'<extra></extra>'}));
}
async function plotar(){
    if(!estatisticas.length||typeof Plotly==='undefined')return;
    const grafico=selecionado.grafico;
    const tracos=grafico==='boxplot'?tracosBoxplot():grafico==='histograma'?tracosHistograma():tracosDensidade();
    const horizontal=grafico==='boxplot';
    const altura=horizontal?Math.max(360,estatisticas.length*34+60):Math.max(360,360+(estatisticas.length-6)*14);
    el('cgGrafico').style.height=altura+'px';
    const spec=layout({
        height:altura, margin:horizontal?{l:120,r:25,t:10,b:48}:{l:55,r:10,t:10,b:60},
        showlegend:!horizontal, barmode:'overlay',
        xaxis:{title:horizontal?'Nota':'Nota — '+nomeDaArea(selecionado.area),rangemode:'tozero'},
        yaxis:horizontal?{title:'',automargin:true}:{title:'Proporção do grupo (%)',rangemode:'tozero'},
        legend:{orientation:'h',x:0,y:-.23,font:{size:10}}
    });
    await Plotly.react(el('cgGrafico'),tracos,spec,opcoes({displayModeBar:false}));
}

function preencherTestes(levene,welch,eta,omega,k){
    el('cgLeveneValor').textContent=levene?`F = ${fmt(levene.F)} | p ${fmtP(levene.p)}`:'Não estimável';
    el('cgWelchValor').textContent=welch?`F = ${fmt(welch.F)} | p ${fmtP(welch.p)}`:'Não estimável';
    el('cgEtaValor').textContent=omega===null?'Não estimável':`${fmt(omega,3)} (${fmt(omega*100)}%)`;
    el('cgLeveneMeta').textContent=levene?`gl = ${fmt(levene.dfn,0)} e ${fmt(levene.dfd,0)}`:'É necessário haver pelo menos dois grupos válidos.';
    el('cgWelchMeta').textContent=welch?`gl = ${fmt(welch.dfn,0)} e ${fmt(welch.dfd)}`:'É necessário haver pelo menos dois grupos válidos.';
    el('cgEtaMeta').textContent=omega===null?'—':`Magnitude: ${magnitudeEta(omega)}. η² = ${fmt(eta,3)}.`;
    el('cgLeveneDecisao').textContent=levene
        ?(significativo(levene.p)
            ?'Decisão: rejeitar H₀; evidência de variâncias diferentes.'
            :'Decisão: não rejeitar H₀; evidência insuficiente de diferença.')
        :'Decisão indisponível para este recorte.';
    el('cgWelchDecisao').textContent=welch
        ?(significativo(welch.p)
            ?'Decisão: rejeitar H₀; pelo menos duas médias diferem.'
            :'Decisão: não rejeitar H₀; evidência insuficiente de diferença.')
        :'Decisão indisponível para este recorte.';
    el('cgParesMeta').textContent=`${pares.length} comparações calculadas. ${k} grupos elegíveis (n ≥ 2 e variância positiva).`;
}
function preencherGames(){
    const validos=pares.filter(p=>Number.isFinite(p.p));
    const significativos=validos.filter(p=>significativo(p.p)).length;
    el('cgGamesValor').textContent=validos.length
        ?`${fmt(significativos,0)} de ${fmt(validos.length,0)} pares`
        :'Não estimável';
    el('cgGamesMeta').textContent=validos.length
        ?'Comparações com p ajustado < 0,05.'
        :'Não há pares válidos para comparar neste recorte.';
    el('cgGamesDecisao').textContent=validos.length
        ?(significativos
            ?`Rejeita-se H₀ em ${significativos} ${significativos===1?'par':'pares'}; consulte a tabela.`
            :'Nenhum par rejeita H₀ ao nível de 5%.')
        :'Decisão indisponível para este recorte.';
}
function tabelaPares(){
    const termo=(el('cgBusca').value||'').trim().toLocaleLowerCase('pt-BR');
    const filtrados=pares.filter(p=>(p.grupo1+' '+p.grupo2).toLocaleLowerCase('pt-BR').includes(termo));
    el('cgCorpoPares').innerHTML=filtrados.map(p=>`<tr><td>${esc(p.grupo1)}</td><td>${esc(p.grupo2)}</td>`+
        `<td class="num">${fmt(p.dif)}</td><td class="num">[${fmt(p.icInf)}; ${fmt(p.icSup)}]</td>`+
        `<td class="num">${fmtP(p.p)}</td><td class="num">${fmt(p.dav,3)}</td>`+
        `<td>${esc(p.magnitude)}</td></tr>`).join('');
    el('cgParesMeta').textContent=`${filtrados.length} de ${pares.length} comparações exibidas.`;
}
function interpretar(levene,welch,eta,omega,grupos,pares,k){
    const frases=[];
    if(levene){
        frases.push(significativo(levene.p)
            ?'O teste de Levene (centrado nas medianas) indica heterogeneidade de variâncias entre as categorias.'
            :'O teste de Levene não detectou evidência suficiente de heterogeneidade de variâncias.');
    }
    if(welch){
        frases.push(significativo(welch.p)
            ?'A ANOVA de Welch detectou diferença entre pelo menos duas médias; não identifica, isoladamente, quais categorias diferem.'
            :'A ANOVA de Welch não detectou diferença global estatisticamente significativa entre as médias.');
    }
    if(omega!==null){
        frases.push(`O ômega quadrado clássico da ANOVA foi ω² = ${fmt(omega,3)} `+
            `(magnitude ${magnitudeEta(omega).toLowerCase()}); η² descritivo = ${fmt(eta,3)}. `+
            `O ω² não representa um efeito causal e não é uma medida específica da ANOVA de Welch.`);
    }
    const significativos=pares.filter(p=>significativo(p.p));
    if(pares.length)frases.push(`${significativos.length} das ${pares.length} comparações Games–Howell foram significativas ao nível de 5%.`);
    if(pares.length){
        const maior=pares.reduce((m,p)=>Math.abs(p.dif)>Math.abs(m.dif)?p:m,pares[0]);
        frases.push(`A maior diferença absoluta entre as médias foi de ${fmt(Math.abs(maior.dif))} pontos, `+
            `entre ${maior.grupo1} e ${maior.grupo2} (d_av = ${fmt(maior.dav,3)}, `+
            `magnitude ${maior.magnitude.toLowerCase()}).`);
    }
    const comForma=grupos.filter(g=>Number.isFinite(g.assimetria) && Number.isFinite(g.curtose));
    if(comForma.length){
        const aMin=Math.min(...comForma.map(g=>g.assimetria));
        const aMax=Math.max(...comForma.map(g=>g.assimetria));
        const cMin=Math.min(...comForma.map(g=>g.curtose));
        const cMax=Math.max(...comForma.map(g=>g.curtose));
        frases.push(`As distribuições das categorias apresentaram assimetria entre ${fmt(aMin,3)} e ${fmt(aMax,3)}, `+
            `e curtose de Pearson entre ${fmt(cMin,3)} e ${fmt(cMax,3)}. `+
            `A referência para simetria é 0 e para a curtose da Normal é 3; essas medidas isoladas não comprovam normalidade.`);
    }
    frases.push('A significância estatística não demonstra causalidade. Com amostras muito grandes, diferenças pequenas podem gerar valores-p baixos; compare também os tamanhos de efeito.');
    el('cgInterpretacao').textContent=frases.join(' ');
}
function baixarPares(){
    if(!pares.length)return;
    const cab=['Grupo 1','Grupo 2','Diferença','IC inferior','IC superior','Valor-p ajustado','d_av','Magnitude'];
    const matriz=[cab,...pares.map(p=>[p.grupo1,p.grupo2,p.dif,p.icInf,p.icSup,p.p,p.dav,p.magnitude])];
    const csv='\ufeff'+matriz.map(l=>l.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a'); a.href=url;
    a.download=`games-howell-${estado.ano()}-${selecionado.coluna}-${selecionado.area}.csv`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
