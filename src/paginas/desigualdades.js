/**
 * DESIGUALDADES EDUCACIONAIS — cruzamentos descritivos de duas variáveis.
 * Uma única consulta agregada ao DuckDB por combinação (ano, área, filtro,
 * variável A, variável B). Os microdados individuais não são enviados ao JS.
 * Não calcula causalidade ou teste de interação: este módulo é descritivo.
 */
import * as estado from '../nucleo/estado.js';
import * as ui from '../ui/estados.js';
import {config} from '../nucleo/config.js';
import {consultar, montarWhere, tabelaDoAno} from '../infra/duckdb.js';
import {sincronizarOpcoes} from '../dominio/filtros-servico.js';
import {DIMENSOES} from '../dominio/dimensoes.js';
import {traduzir, normalizarCodigo} from '../dominio/rotulos.js';
import {OPCOES_AREA, AREA_GERAL, expressaoDaArea, nomeDaArea, TEM_TODAS_AS_NOTAS} from '../dominio/areas.js';
import {layout, opcoes, serie} from '../graficos/tema.js';

const PAGINA = 'desigualdades';
// Linhas comunicam continuidade; só devem ser usadas para estratos ordenáveis.
const VARIAVEIS_ORDENADAS=new Set(['renda_familiar','escolaridade_mae','TP_FAIXA_ETARIA']);
function sincronizarOpcoesDeGrafico(){
    const ordenada=VARIAVEIS_ORDENADAS.has(selecionado.variavelB);
    if(!ordenada&&selecionado.apresentacao==='linhas')selecionado.apresentacao='dumbbell';
    document.querySelectorAll('#pagina-desigualdades .de-tipo').forEach(botao=>{
        const tipo=botao.dataset.deTipo;
        botao.disabled=tipo==='linhas'&&!ordenada;
        botao.setAttribute('aria-pressed',String(tipo===selecionado.apresentacao));
        botao.classList.toggle('de-ativo',tipo===selecionado.apresentacao);
        if(tipo==='linhas')botao.title=ordenada?'Exibe médias ao longo dos estratos ordenados':'Disponível apenas para renda, escolaridade da mãe e faixa etária';
    });
    if(el('deDicaVisual'))el('deDicaVisual').textContent=ordenada
        ?'Linhas disponíveis: os estratos possuem uma ordem natural.'
        :'Para categorias sem ordem natural, compare pontos ou barras; linhas ficam desabilitadas.';
}

const VARIAVEIS = ['tipo_escola','renda_familiar','escolaridade_mae',
    'dep_adm','TP_COR_RACA','TP_SEXO','internet','TP_FAIXA_ETARIA','TP_ST_CONCLUSAO'];
const selecionado = {
    variavelA:'tipo_escola', variavelB:'renda_familiar', area:AREA_GERAL,
    metrica:'media', apresentacao:'dumbbell', minimo:30,
    grupo1:null, grupo2:null
};
const el = id => document.getElementById(id);
const numero = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
const inteiro = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const seguro = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = v => Number.isFinite(v) ? numero.format(v) : '—';
const fmtN = v => Number.isFinite(v) ? inteiro.format(v) : '—';
const ehAtual = exe => !exe || exe.ehAtual();
let iniciado = false;
let resultados = [];
let consultaAtiva = null;
let versaoRender = 0;
let versaoHistorico = 0;

function invalidarHistorico(){
    versaoHistorico++;
    const botao=el('deCarregarHistorico');
    if(botao){botao.disabled=false;botao.textContent='Calcular evolução';}
    const status=el('deHistoricoStatus');
    if(status)status.textContent='Para este recorte, clique em Calcular evolução (2019–2023).';
    const grafico=el('deHistorico');
    if(grafico&&typeof Plotly!=='undefined')void Plotly.purge?.(grafico);
}
function mediasBrutas(){
    const calcular=grupo=>{
        const linhas=resultados.filter(d=>d.a===grupo&&d.n>0&&Number.isFinite(d.media));
        const n=linhas.reduce((s,d)=>s+d.n,0);
        return {n,media:n?linhas.reduce((s,d)=>s+d.n*d.media,0)/n:NaN};
    };
    const d1=calcular(selecionado.grupo1), d2=calcular(selecionado.grupo2);
    return {d1,d2,dif:d1.media-d2.media,valido:d1.n>=selecionado.minimo&&d2.n>=selecionado.minimo&&
        Number.isFinite(d1.media)&&Number.isFinite(d2.media)};
} 

function codigo(v){ return v===null||v===undefined ? '__SEM_INFO__' : String(v); }
function rotulo(col,valor){
    if(valor==='__SEM_INFO__')return 'Não informado';
    return traduzir(DIMENSOES[col]?.mapa,normalizarCodigo(valor));
}
function compararCodigos(a,b){
    const x=normalizarCodigo(a), y=normalizarCodigo(b);
    if(x==='__SEM_INFO__')return 1;
    if(y==='__SEM_INFO__')return -1;
    if(/^\d+$/.test(x)&&/^\d+$/.test(y))return Number(x)-Number(y);
    return x.localeCompare(y,'pt-BR',{numeric:true});
}
function categorias(campo){
    return Array.from(new Set(resultados.map(d=>d[campo]))).sort(compararCodigos);
}
function linhaValida(d){return d.n>=selecionado.minimo && Number.isFinite(d.media);}
function combo(a,b){return JSON.stringify([a,b]);}
function atrasarPintura(){return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}

function preencherSeletores(){
    const opcs=VARIAVEIS.map(v=>`<option value="${v}">${seguro(DIMENSOES[v].rotulo)}</option>`).join('');
    el('deVariavelA').innerHTML=opcs;
    el('deVariavelB').innerHTML=opcs;
    el('deArea').innerHTML=OPCOES_AREA.map(v=>`<option value="${v.valor}">${seguro(v.rotulo)}</option>`).join('');
    el('deVariavelA').value=selecionado.variavelA;
    el('deVariavelB').value=selecionado.variavelB;
    el('deArea').value=selecionado.area;
    el('deMinimo').value=String(selecionado.minimo);
    el('deMetrica').value=selecionado.metrica;
    sincronizarOpcoesDeGrafico();
}
function trocarVariavel(campo,valor){
    selecionado[campo]=valor;
    if(selecionado.variavelA===selecionado.variavelB){
        const outro=campo==='variavelA'?'variavelB':'variavelA';
        selecionado[outro]=VARIAVEIS.find(v=>v!==valor);
        el(outro==='variavelA'?'deVariavelA':'deVariavelB').value=selecionado[outro];
    }
    selecionado.grupo1=null;
    selecionado.grupo2=null;
    sincronizarOpcoesDeGrafico();
    estado.revalidar(PAGINA);
}
export async function iniciar(){
    if(iniciado)return;
    if(!el('deVariavelA'))return;
    preencherSeletores();
    el('deVariavelA').addEventListener('change',e=>trocarVariavel('variavelA',e.target.value));
    el('deVariavelB').addEventListener('change',e=>trocarVariavel('variavelB',e.target.value));
    el('deArea').addEventListener('change',e=>{selecionado.area=e.target.value;estado.revalidar(PAGINA);});
    el('deMinimo').addEventListener('change',e=>{selecionado.minimo=Number(e.target.value);void renderizar().catch(console.error);});
    el('deMetrica').addEventListener('change',e=>{selecionado.metrica=e.target.value;void desenharCalor().catch(console.error);});
    document.querySelectorAll('#pagina-desigualdades .de-tipo').forEach(botao=>{
        botao.addEventListener('click',()=>{
            if(botao.disabled)return;
            selecionado.apresentacao=botao.dataset.deTipo;
            sincronizarOpcoesDeGrafico();
            void desenharEstratos().catch(console.error);
        });
    });
    el('deGrupo1').addEventListener('change',e=>{selecionado.grupo1=e.target.value;void renderizar().catch(console.error);});
    el('deGrupo2').addEventListener('change',e=>{selecionado.grupo2=e.target.value;void renderizar().catch(console.error);});
    el('deBaixar').addEventListener('click',baixarCSV);
    el('deCarregarHistorico').addEventListener('click',()=>{void carregarHistorico();});
    iniciado=true;
    if(!config.podeCarregarDados){ui.avisarSemServidor(PAGINA);return;}
    ui.carregando(PAGINA,'Preparando desigualdades…','Consultando os dados do ENEM.');
    estado.assinar(PAGINA,atualizar);
    estado.revalidar(PAGINA);
}
function sqlDoRecorte(ano,recorte){
    const {variavelA:a,variavelB:b,area}=selecionado;
    const nota=expressaoDaArea(area);
    const validacao=area===AREA_GERAL?TEM_TODAS_AS_NOTAS:`${nota} IS NOT NULL`;
    const where=montarWhere(recorte);
    return `WITH base AS (SELECT COALESCE(CAST(${a} AS VARCHAR),'__SEM_INFO__') AS grupo_a, `+
        `COALESCE(CAST(${b} AS VARCHAR),'__SEM_INFO__') AS grupo_b, `+
        `${nota} AS nota FROM '${tabelaDoAno(ano)}' ${where} AND ${validacao}) `+
        `SELECT grupo_a,grupo_b,CAST(COUNT(*) AS BIGINT) AS n, `+
        `AVG(nota) AS media, STDDEV_SAMP(nota) AS dp `+
        `FROM base GROUP BY grupo_a,grupo_b ORDER BY grupo_a,grupo_b`;
}
async function atualizar(exe){
    const ano=estado.ano();
    versaoRender++;
    invalidarHistorico();
    const encerrar=ui.atualizando(PAGINA,'Consultando '+ano+'…',exe);
    try{
        await sincronizarOpcoes(PAGINA,`'${tabelaDoAno(ano)}'`);
        if(!ehAtual(exe))return;
        const recorte=estado.recorte(PAGINA);
        const temFiltrosVariaveis=[selecionado.variavelA,selecionado.variavelB].filter(c=>recorte[c]?.length);
        el('deAviso').textContent=temFiltrosVariaveis.length
            ?`Atenção: ${temFiltrosVariaveis.map(c=>DIMENSOES[c].rotulo).join(' e ')} também está filtrada na gaveta. Algumas categorias podem ficar ocultas.`
            :'';
        const sql=sqlDoRecorte(ano,recorte);
        const linhas=await consultar(sql);
        if(!ehAtual(exe))return;
        if(!linhas.length){
            resultados=[];
            el('deInterpretacao').textContent='Nenhuma nota encontrada para este recorte.';
            ui.vazio(PAGINA,'Sem resultados','Experimente retirar alguns filtros.');
            return;
        }
        resultados=linhas.map(d=>({
            a:codigo(d.grupo_a), b:codigo(d.grupo_b),
            n:Number(d.n), media:d.media==null?NaN:Number(d.media), dp:d.dp==null?NaN:Number(d.dp)
        }));
        consultaAtiva={ano, recorte, area:selecionado.area,a:selecionado.variavelA,b:selecionado.variavelB};
        await renderizar(exe);
        if(!ehAtual(exe))return;
        ui.pronto(PAGINA);
    }catch(erro){
        if(ehAtual(exe))ui.mostrarFalha(PAGINA,'Desigualdades Educacionais',erro);
        console.error('[Desigualdades Educacionais]',erro);
    }finally{encerrar();}
}
function mediaPonderada(linhas){
    const n=linhas.reduce((s,d)=>s+d.n,0);
    return n ? linhas.reduce((s,d)=>s+d.media*d.n,0)/n : NaN;
}
function obterGrupos(){
    const as=categorias('a');
    const preferidos=['2','3'];
    const validos=as.filter(c=>resultados.some(d=>d.a===c&&linhaValida(d)));
    const grupos=validos.length?validos:as;
    if(!grupos.includes(selecionado.grupo1))selecionado.grupo1=preferidos.map(k=>grupos.find(c=>normalizarCodigo(c)===k)).find(Boolean)||grupos[0]||null;
    if(!grupos.includes(selecionado.grupo2)||selecionado.grupo2===selecionado.grupo1){
        selecionado.grupo2=preferidos.map(k=>grupos.find(c=>normalizarCodigo(c)===k && c!==selecionado.grupo1)).find(Boolean)
            ||grupos.find(c=>c!==selecionado.grupo1)||null;
    }
    const opc=grupos.map(c=>`<option value="${seguro(c)}">${seguro(rotulo(selecionado.variavelA,c))}</option>`).join('');
    el('deGrupo1').innerHTML=opc;
    el('deGrupo2').innerHTML=opc;
    el('deGrupo1').value=selecionado.grupo1||'';
    el('deGrupo2').value=selecionado.grupo2||'';
    el('deGrupo2').disabled=grupos.length<2;
}
function estatisticas(){
    const validas=resultados.filter(linhaValida);
    const total=resultados.reduce((s,d)=>s+d.n,0);
    const medias=validas.map(d=>d.media);
    const amp=medias.length>=2?Math.max(...medias)-Math.min(...medias):NaN;
    el('deParticipantes').textContent=fmtN(total);
    el('deCruzes').textContent=`${fmtN(validas.length)} de ${fmtN(resultados.length)}`;
    el('deAmplitude').textContent=Number.isFinite(amp)?`${fmt(amp)} pontos`:'—';
    const nFiltros=Object.keys(consultaAtiva?.recorte||{}).filter(x=>consultaAtiva.recorte[x]?.length).length;
    el('deBase').textContent=`${consultaAtiva?.ano||estado.ano()} · ${nFiltros} ${nFiltros===1?'filtro':'filtros'}`;
    el('deDescricao').textContent=`${DIMENSOES[selecionado.variavelA].rotulo} × ${DIMENSOES[selecionado.variavelB].rotulo} — ${nomeDaArea(selecionado.area)}.`;
    el('deNotaMinimo').textContent=`Células com menos de ${fmtN(selecionado.minimo)} participantes ficam ocultas da comparação de médias, mas continuam contabilizadas no total.`;
}
function montarTabela(){
    const validas=resultados.filter(linhaValida);
    const corpo=el('deCorpoTabela');
    corpo.innerHTML=validas.map(d=>`<tr><td>${seguro(rotulo(selecionado.variavelA,d.a))}</td>`+
        `<td>${seguro(rotulo(selecionado.variavelB,d.b))}</td>`+
        `<td class="de-num">${fmtN(d.n)}</td><td class="de-num">${fmt(d.media)}</td>`+
        `<td class="de-num">${fmt(d.dp)}</td></tr>`).join('');
    if(!validas.length)corpo.innerHTML='<tr><td colspan="5">Nenhum cruzamento alcançou o N mínimo.</td></tr>';
    el('deTabelaMeta').textContent=`${validas.length} cruzamentos exibidos (N mínimo: ${fmtN(selecionado.minimo)}).`;
}
function criarMatriz(){
    const as=categorias('a'),bs=categorias('b');
    const map=new Map(resultados.map(d=>[combo(d.a,d.b),d]));
    // Denominadores incluem todas as células, inclusive as ocultadas pelo N mínimo.
    const totaisA=new Map(as.map(a=>[a,resultados.filter(d=>d.a===a).reduce((s,d)=>s+d.n,0)]));
    const totaisB=new Map(bs.map(b=>[b,resultados.filter(d=>d.b===b).reduce((s,d)=>s+d.n,0)]));
    const modo=selecionado.metrica;
    const z=bs.map(b=>as.map(a=>{
        const d=map.get(combo(a,b));
        if(!d||!linhaValida(d))return null;
        if(modo==='n')return d.n;
        if(modo==='media')return d.media;
        const denominador=modo==='pct_linha'?totaisB.get(b):totaisA.get(a);
        return denominador>0?100*d.n/denominador:null;
    }));
    const textos=bs.map(b=>as.map(a=>{
        const d=map.get(combo(a,b));
        if(!d)return 'Sem observações';
        if(!linhaValida(d))return `N: ${fmtN(d.n)} (abaixo do mínimo)`;
        const valor=modo==='pct_linha'&&totaisB.get(b)>0?100*d.n/totaisB.get(b):
            modo==='pct_coluna'&&totaisA.get(a)>0?100*d.n/totaisA.get(a):null;
        return `N: ${fmtN(d.n)} · Média: ${fmt(d.media)}`+
            (valor===null?'':` · Percentual: ${fmt(valor)}%`);
    }));
    return {as,bs,z,textos};
}
async function desenharCalor(){
    if(!resultados.length||!el('deMapa')||typeof Plotly==='undefined')return;
    const {as,bs,z,textos}=criarMatriz();
    const altura=Math.max(375,Math.min(850,bs.length*32+150));
    el('deMapa').style.height=`${altura}px`;
    const modo=selecionado.metrica, percentual=modo==='pct_linha'||modo==='pct_coluna';
    const titulo=modo==='n'?'N':percentual?'%':'Pontos';
    const traco={
        type:'heatmap', x:as.map(a=>rotulo(selecionado.variavelA,a)),
        y:bs.map(b=>rotulo(selecionado.variavelB,b)), z,
        text:textos,hovertemplate:'%{y}<br>%{x}<br>%{text}<extra></extra>',
        colorscale:[[0,'#eef5fd'],[0.28,'#bcd8f2'],[0.62,'#478ec7'],[1,'#104d7c']],
        colorbar:{title:{text:titulo},thickness:12,len:.85},
        ...(percentual?{zmin:0,zmax:100}:{}),
        hoverongaps:false,xgap:2,ygap:2
    };
    const spec=layout({height:altura,margin:{l:128,r:38,t:14,b:Math.max(85,Math.min(160,as.length*7))},
        xaxis:{title:DIMENSOES[selecionado.variavelA].rotulo,tickangle:as.length>7?-45:0,automargin:true,side:'bottom'},
        yaxis:{title:'',automargin:true,autorange:'reversed'},showlegend:false});
    await Plotly.react(el('deMapa'),[traco],spec,opcoes({displayModeBar:false}));
    if(el('deMapaNota'))el('deMapaNota').textContent=percentual
        ?(modo==='pct_linha'?'Cada célula representa sua participação no total do estrato (linha). ':'Cada célula representa sua participação no total do grupo (coluna). ')+
         'O denominador inclui células ocultadas por N insuficiente: percentuais visíveis podem não somar 100%.'
        :modo==='n'?'Quantidade absoluta em cada cruzamento (sujeita ao N mínimo).'
         :'Média das notas em cada combinação (sujeita ao N mínimo).';
}
function comparacoesEstratificadas(){
    const a1=selecionado.grupo1,a2=selecionado.grupo2;
    const map=new Map(resultados.map(d=>[combo(d.a,d.b),d]));
    return categorias('b').map(b=>{
        const d1=map.get(combo(a1,b)),d2=map.get(combo(a2,b));
        return {b, d1,d2,
            valido:!!(d1&&d2&&linhaValida(d1)&&linhaValida(d2)),
            dif:d1&&d2?d1.media-d2.media:NaN};
    });
}
async function desenharEstratos(){
    if(!resultados.length||!el('deEstratos')||typeof Plotly==='undefined')return;
    sincronizarOpcoesDeGrafico();
    const pares=comparacoesEstratificadas(), validos=pares.filter(p=>p.valido);
    const nome1=rotulo(selecionado.variavelA,selecionado.grupo1);
    const nome2=rotulo(selecionado.variavelA,selecionado.grupo2);
    const bruta=mediasBrutas(), temBruta=bruta.valido;
    const ref=el('deDifBruta'), notaBruta=el('deDifBrutaNota');
    if(ref)ref.textContent=temBruta?`${bruta.dif>=0?'+':''}${fmt(bruta.dif)} pontos`:'—';
    if(notaBruta)notaBruta.textContent=temBruta
        ?`${nome1}: ${fmt(bruta.d1.media)} (N=${fmtN(bruta.d1.n)}) · ${nome2}: ${fmt(bruta.d2.media)} (N=${fmtN(bruta.d2.n)}). Referência sem separar por estratos.`
        :'Não há participantes suficientes nos dois grupos para calcular a diferença bruta.';
    const tipo=selecionado.apresentacao, ehLinha=tipo==='linhas';
    const plotar=tipo==='dumbbell'&&temBruta
        ?[{b:'__TOTAL__',d1:bruta.d1,d2:bruta.d2,dif:bruta.dif,valido:true},...validos]
        :validos;
    const rotB=p=>p.b==='__TOTAL__'?'Geral (sem estratificar)':rotulo(selecionado.variavelB,p.b);
    const categoriasB=plotar.map(rotB);
    const altura=Math.max(360,Math.min(850,plotar.length*35+125));
    el('deEstratos').style.height=`${altura}px`;
    const azul=serie(0),laranja=serie(1);
    const dadosTooltip=plotar.map(p=>[p.dif,p.d1.media,p.d2.media,p.d1.n,p.d2.n]);
    const tituloHover=`<br>${seguro(nome1)}: %{customdata[1]:.1f} (N=%{customdata[3]:,})`+
        `<br>${seguro(nome2)}: %{customdata[2]:.1f} (N=%{customdata[4]:,})`+
        '<br>Diferença (1 − 2): %{customdata[0]:+.1f} pontos<extra></extra>';
    let tracos=[];
    if(tipo==='dumbbell'){
        const x=[],y=[],dados=[];
        for(const p of plotar){
            const rot=rotB(p);
            for(let i=0;i<=24;i++){
                x.push(p.d1.media+(p.d2.media-p.d1.media)*(i/24));
                y.push(rot);dados.push([p.dif,p.d1.media,p.d2.media,p.d1.n,p.d2.n]);
            }
            x.push(null);y.push(null);dados.push(null);
        }
        tracos.push({type:'scatter',mode:'lines+markers',x,y,customdata:dados,
            line:{color:'rgba(120,133,151,.55)',width:2.5},
            marker:{color:'rgba(100,116,139,0.005)',size:16},
            name:'Diferença',showlegend:false,hovertemplate:'%{y}'+tituloHover});
        tracos.push({type:'scatter',mode:'markers',name:nome1,
            x:plotar.map(p=>p.d1.media),y:categoriasB,customdata:dadosTooltip,
            marker:{color:azul,size:plotar.map(p=>p.b==='__TOTAL__'?13:10),symbol:plotar.map(p=>p.b==='__TOTAL__'?'diamond':'circle')},hovertemplate:'%{y}'+tituloHover});
        tracos.push({type:'scatter',mode:'markers',name:nome2,
            x:plotar.map(p=>p.d2.media),y:categoriasB,customdata:dadosTooltip,
            marker:{color:laranja,size:plotar.map(p=>p.b==='__TOTAL__'?13:10),symbol:plotar.map(p=>p.b==='__TOTAL__'?'diamond':'circle')},hovertemplate:'%{y}'+tituloHover});
    }else if(tipo==='pontos'){
        tracos=[{type:'scatter',mode:'markers',name:`${nome1} − ${nome2}`,
            x:validos.map(p=>p.dif),y:validos.map(rotB),
            customdata:validos.map(p=>[p.dif,p.d1.media,p.d2.media,p.d1.n,p.d2.n]),
            marker:{size:11,color:validos.map(p=>p.dif>=0?azul:laranja)},
            hovertemplate:'%{y}'+tituloHover}];
    }else if(tipo==='barras'){
        tracos=[{type:'bar',orientation:'h',name:`${nome1} − ${nome2}`,
            x:validos.map(p=>p.dif),y:validos.map(rotB),
            customdata:validos.map(p=>[p.dif,p.d1.media,p.d2.media,p.d1.n,p.d2.n]),
            marker:{color:validos.map(p=>p.dif>=0?azul:laranja)},hovertemplate:'%{y}'+tituloHover}];
    }else if(ehLinha){
        const dados=validos.map(p=>[p.dif,p.d1.media,p.d2.media,p.d1.n,p.d2.n]);
        tracos=[
            {type:'scatter',mode:'lines+markers',name:nome1,x:validos.map(rotB),
                y:validos.map(p=>p.d1.media),customdata:dados,
                line:{color:azul,width:2.5},marker:{size:9},hovertemplate:'%{x}'+tituloHover},
            {type:'scatter',mode:'lines+markers',name:nome2,x:validos.map(rotB),
                y:validos.map(p=>p.d2.media),customdata:dados,
                line:{color:laranja,width:2.5},marker:{size:9},hovertemplate:'%{x}'+tituloHover}
        ];
    }
    const refVisual=temBruta&&!ehLinha&&tipo!=='dumbbell';
    const spec=layout({height:altura,
        margin:{l:ehLinha?70:155,r:30,t:refVisual?42:18,b:ehLinha?Math.max(90,Math.min(150,validos.length*9)):70},
        xaxis:ehLinha?{title:DIMENSOES[selecionado.variavelB].rotulo,type:'category',
            categoryorder:'array',categoryarray:validos.map(rotB),tickangle:validos.length>5?-35:0,automargin:true}
            :{title:tipo==='dumbbell'?'Média das notas':'Diferença das médias (pontos)',
                zeroline:tipo!=='dumbbell',zerolinewidth:2},
        yaxis:ehLinha?{title:'Média das notas',automargin:true}
            :{title:'',automargin:true,autorange:'reversed',categoryorder:'array',categoryarray:categoriasB},
        hovermode:'closest',showlegend:tipo==='dumbbell'||ehLinha,
        legend:{orientation:'h',y:-.25,x:0},
        ...(refVisual?{shapes:[{type:'line',xref:'x',yref:'paper',x0:bruta.dif,x1:bruta.dif,
            y0:0,y1:1,line:{color:'#8052bb',width:2,dash:'dash'}}],
            annotations:[{xref:'x',yref:'paper',x:bruta.dif,y:1.08,text:'Diferença bruta',showarrow:false,
                font:{color:'#8052bb',size:10}}]}:{})
    });
    await Plotly.react(el('deEstratos'),tracos,spec,opcoes({displayModeBar:false}));
    const frase=tipo==='dumbbell'&&temBruta
        ?'A primeira linha (losangos) é a diferença bruta, sem estratificação. Passe o mouse nas ligações para ver os valores. '
        :refVisual?'A linha pontilhada roxa indica a diferença bruta, sem estratificação. '
        :ehLinha?'A diferença bruta está indicada acima do gráfico. ':'';
    el('deEstratosNota').textContent=validos.length
        ?`${frase}${validos.length} estratos com ambos os grupos presentes (N ≥ ${fmtN(selecionado.minimo)} em cada grupo). Diferença = ${nome1} − ${nome2}.`
        :`Nenhum estrato tem pelo menos ${fmtN(selecionado.minimo)} participantes em ambos os grupos.`;
}


// Complementos calculados sob demanda: áreas do ano atual e série histórica.
function sqlAreas(ano,recorte,variavelA){
    const agregados=OPCOES_AREA.flatMap((area,i)=>{
        const expr=expressaoDaArea(area.valor);
        const cond=area.valor===AREA_GERAL?TEM_TODAS_AS_NOTAS:`${expr} IS NOT NULL`;
        return [`COUNT(*) FILTER (WHERE ${cond}) AS n_${i}`,
            `AVG(CASE WHEN ${cond} THEN ${expr} ELSE NULL END) AS media_${i}`];
    });
    return `SELECT COALESCE(CAST(${variavelA} AS VARCHAR),'__SEM_INFO__') AS grupo_a, `+
        agregados.join(', ')+` FROM '${tabelaDoAno(ano)}' ${montarWhere(recorte)} GROUP BY grupo_a`;
}
async function desenharAreas(exe,versao){
    if(!consultaAtiva||!el('deAreas'))return;
    const contexto=consultaAtiva, a1=selecionado.grupo1,a2=selecionado.grupo2;
    const aviso=el('deAreasNota');
    aviso.textContent='Consultando as cinco áreas para os grupos selecionados…';
    try{
        const linhas=await consultar(sqlAreas(contexto.ano,contexto.recorte,contexto.a));
        if(versao!==versaoRender||!ehAtual(exe))return;
        const map=new Map(linhas.map(d=>[codigo(d.grupo_a),d]));
        const g1=map.get(a1),g2=map.get(a2);
        const nome1=rotulo(contexto.a,a1),nome2=rotulo(contexto.a,a2);
        const areas=OPCOES_AREA.filter(x=>x.valor!==AREA_GERAL);
        const pontos=areas.map(area=>{
            const i=OPCOES_AREA.findIndex(x=>x.valor===area.valor);
            const n1=Number(g1?.[`n_${i}`]||0),n2=Number(g2?.[`n_${i}`]||0);
            const media1=g1?.[`media_${i}`]==null?NaN:Number(g1[`media_${i}`]);
            const media2=g2?.[`media_${i}`]==null?NaN:Number(g2[`media_${i}`]);
            return {area:area.rotulo,n1,n2,media1,media2,
                dif:media1-media2,valido:n1>=selecionado.minimo&&n2>=selecionado.minimo&&
                    Number.isFinite(media1)&&Number.isFinite(media2)};
        });
        const trace={type:'bar',orientation:'h',name:`${nome1} − ${nome2}`,
            y:pontos.map(p=>p.area),x:pontos.map(p=>p.valido?p.dif:null),
            customdata:pontos.map(p=>[p.media1,p.media2,p.n1,p.n2]),
            marker:{color:pontos.map(p=>p.valido&&p.dif>=0?serie(0):serie(1))},
            hovertemplate:'%{y}<br>Diferença (1 − 2): %{x:+.1f} pontos'+
                `<br>${seguro(nome1)}: %{customdata[0]:.1f} (N=%{customdata[2]:,})`+
                `<br>${seguro(nome2)}: %{customdata[1]:.1f} (N=%{customdata[3]:,})<extra></extra>`};
        const altura=350;el('deAreas').style.height=`${altura}px`;
        await Plotly.react(el('deAreas'),[trace],layout({height:altura,
            margin:{l:152,r:18,t:20,b:55},
            xaxis:{title:'Diferença de médias (pontos)',zeroline:true,zerolinewidth:2},
            yaxis:{autorange:'reversed',automargin:true}}),opcoes({displayModeBar:false}));
        if(versao!==versaoRender||!ehAtual(exe))return;
        const faltantes=pontos.filter(p=>!p.valido).map(p=>p.area);
        aviso.textContent=`Diferença = ${nome1} − ${nome2}. `+
            (faltantes.length?`Sem N suficiente em: ${faltantes.join(', ')}.`:
             'Todos os cinco pares de médias atingiram o N mínimo.')+
            ' A população válida pode variar entre as áreas.';
    }catch(erro){
        if(versao===versaoRender&&ehAtual(exe))aviso.textContent=`Não foi possível calcular as áreas: ${erro.message}`;
        console.error('[Desigualdades: áreas]',erro);
    }
}
function sqlHistorico(ano,recorte,area,a){
    const nota=expressaoDaArea(area),validacao=area===AREA_GERAL?TEM_TODAS_AS_NOTAS:`${nota} IS NOT NULL`;
    return `SELECT COALESCE(CAST(${a} AS VARCHAR),'__SEM_INFO__') AS grupo_a, `+
        `COUNT(*) AS n, AVG(${nota}) AS media `+
        `FROM '${tabelaDoAno(ano)}' ${montarWhere(recorte)} AND ${validacao} GROUP BY grupo_a`;
}
async function carregarHistorico(){
    if(!consultaAtiva||!selecionado.grupo1||!selecionado.grupo2)return;
    const seq=++versaoHistorico;
    const ctx=consultaAtiva, area=selecionado.area, g1=selecionado.grupo1,g2=selecionado.grupo2;
    const minimo=selecionado.minimo, botao=el('deCarregarHistorico'), status=el('deHistoricoStatus');
    botao.disabled=true;botao.textContent='Consultando…';
    const pontos=[];
    try{
        for(const ano of [2019,2020,2021,2022,2023]){
            status.textContent=`Consultando ${ano}… (${pontos.length+1} de 5 edições).`;
            const dados=await consultar(sqlHistorico(ano,ctx.recorte,area,ctx.a));
            if(seq!==versaoHistorico)return;
            const map=new Map(dados.map(d=>[codigo(d.grupo_a),d]));
            const d1=map.get(g1),d2=map.get(g2);
            const n1=Number(d1?.n||0), n2=Number(d2?.n||0);
            const media1=d1?.media==null?NaN:Number(d1.media);
            const media2=d2?.media==null?NaN:Number(d2.media);
            const valido=n1>=minimo&&n2>=minimo&&Number.isFinite(media1)&&Number.isFinite(media2);
            pontos.push({ano:String(ano),n1,n2,media1,media2,dif:valido?media1-media2:null,valido});
        }
        const nome1=rotulo(ctx.a,g1),nome2=rotulo(ctx.a,g2);
        const trace={type:'scatter',mode:'lines+markers',connectgaps:false,
            x:pontos.map(d=>d.ano),y:pontos.map(d=>d.dif),
            customdata:pontos.map(d=>[d.media1,d.media2,d.n1,d.n2]),
            line:{color:serie(0),width:3},marker:{size:10},
            hovertemplate:'%{x}<br>Diferença (1 − 2): %{y:+.1f} pontos'+
                `<br>${seguro(nome1)}: %{customdata[0]:.1f} (N=%{customdata[2]:,})`+
                `<br>${seguro(nome2)}: %{customdata[1]:.1f} (N=%{customdata[3]:,})<extra></extra>`};
        const graf=el('deHistorico');graf.style.height='350px';
        await Plotly.react(graf,[trace],layout({height:350,margin:{l:60,r:18,t:20,b:55},
            xaxis:{title:'Ano',type:'category'},yaxis:{title:'Diferença (pontos)',zeroline:true,zerolinewidth:2}}),
            opcoes({displayModeBar:false}));
        if(seq!==versaoHistorico)return;
        const faltantes=pontos.filter(d=>!d.valido).map(d=>d.ano);
        status.textContent=`Diferença bruta = ${nome1} − ${nome2}, ${nomeDaArea(area)}. `+
            (faltantes.length?`Sem observações suficientes em ${faltantes.join(', ')}.`:'Todos os anos com N suficiente.')+
            ' Comparações descritivas: grupos de participantes podem mudar ao longo dos anos.';
    }catch(erro){
        if(seq===versaoHistorico)status.textContent=`Não foi possível consultar a evolução: ${erro.message}`;
        console.error('[Desigualdades: evolução]',erro);
    }finally{
        if(seq===versaoHistorico){botao.disabled=false;botao.textContent='Recalcular evolução';}
    }
}

function interpretar(){
    const validos=resultados.filter(linhaValida);
    const pares=comparacoesEstratificadas().filter(p=>p.valido);
    const nome1=rotulo(selecionado.variavelA,selecionado.grupo1);
    const nome2=rotulo(selecionado.variavelA,selecionado.grupo2);
    let texto=`Foram encontrados ${fmtN(validos.length)} cruzamentos com pelo menos ${fmtN(selecionado.minimo)} participantes, `+
        `entre ${DIMENSOES[selecionado.variavelA].rotulo} e ${DIMENSOES[selecionado.variavelB].rotulo}. `;
    if(pares.length){
        const maior=pares.reduce((m,p)=>Math.abs(p.dif)>Math.abs(m.dif)?p:m,pares[0]);
        const media1=mediaPonderada(resultados.filter(d=>d.a===selecionado.grupo1));
        const media2=mediaPonderada(resultados.filter(d=>d.a===selecionado.grupo2));
        const semestratos=Number.isFinite(media1)&&Number.isFinite(media2)?media1-media2:NaN;
        texto+=`Considerando todo o recorte, a diferença bruta entre ${nome1} e ${nome2} é de ${fmt(semestratos)} pontos. `+
            `Ao separar por ${DIMENSOES[selecionado.variavelB].rotulo}, a maior diferença absoluta observada é `+
            `${fmt(Math.abs(maior.dif))} pontos em ${rotulo(selecionado.variavelB,maior.b)} `+
            `(${maior.dif>=0?nome1:nome2} apresenta média maior nessa categoria). `;
        const sinais=new Set(pares.map(p=>Math.sign(p.dif)).filter(x=>x));
        if(sinais.size>1)texto+='A direção da diferença não é uniforme entre todos os estratos analisados. ';
    }else texto+='Não há estratos com N suficiente em ambos os grupos escolhidos. ';
    texto+='As diferenças são descritivas: estratificar por uma variável não elimina outros fatores de confusão, não demonstra causalidade e não representa um teste estatístico de interação.';
    el('deInterpretacao').textContent=texto;
}
async function renderizar(exe){
    if(!resultados.length)return;
    const versao=++versaoRender;
    invalidarHistorico();
    obterGrupos();
    estatisticas();
    montarTabela();
    interpretar();
    await Promise.all([desenharCalor(),desenharEstratos(),desenharAreas(exe,versao)]);
    if(!ehAtual(exe))return;
    await atrasarPintura();
}
function baixarCSV(){
    const linhas=resultados.map(d=>[
        rotulo(selecionado.variavelA,d.a),rotulo(selecionado.variavelB,d.b),d.n,d.media,d.dp,
        d.n>=selecionado.minimo?'sim':'nao'
    ]);
    const header=['Grupo A','Grupo B','N','Média','Desvio-padrão','N mínimo atingido'];
    const body=[header,...linhas].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const blob=new Blob(['\ufeff'+body],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download=`desigualdades-${estado.ano()}-${selecionado.variavelA}-${selecionado.variavelB}.csv`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
