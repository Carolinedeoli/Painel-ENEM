/** Página TRI — 3PL/CCI/FII, sem consultas aos microdados individuais.
 * Usa dados/tri/catalogo_itens.json e mapa_cadernos.json, gerados na Monografia.
 * Convenção D=1, b e theta na mesma escala. Não calcula notas oficiais/EAP.
 */
const $ = (id) => document.getElementById(id);
const AREAS = { MT: 'Matemática', LC: 'Linguagens', CN: 'Ciências da Natureza', CH: 'Ciências Humanas' };
const CORES = { AZUL: '#2a78d6', AMARELA: '#edb919', ROSA: '#e87ba4', VERDE: '#1baf7a', LARANJA: '#eb8834', BRANCA: '#f8fafc', BRANCO: '#f8fafc', CINZA: '#94a3b8', ROXA: '#9064c6', MARROM: '#9b6547' };
const DATA_CATALOGO = new URL('../../dados/tri/catalogo_itens.json', import.meta.url);
const DATA_MAPA = new URL('../../dados/tri/mapa_cadernos.json', import.meta.url);
const INICIO = { a: 1.5, b: 0, c: 0.2, theta: 0 };
const f = (x, n=2) => Number(x).toLocaleString('pt-BR', {minimumFractionDigits:n, maximumFractionDigits:n});
let catalogo = [], mapa = null;
let corAtual = '', cadernoAtual = '', itemAtual = null, parametrosOriginais = null;
let posicoes = [], inicializado = false, tokenCarga = 0;

export function probabilidade(theta, a, b, c) {
    // Operação estável na região de proficiências extremas (sem overflow de exp).
    const z = a * (theta - b);
    const sig = z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
    return c + (1 - c) * sig;
}

export function informacao(theta, a, b, c) {
    const p = probabilidade(theta, a, b, c);
    if (p <= 0 || p >= 1) return 0;
    return a*a * ((p-c)/(1-c))**2 * ((1-p)/p);
}

function aviso(mensagem, erro=false) {
    const el=$('triAviso'); if (!el) return;
    el.textContent=mensagem; el.classList.toggle('tri-erro',erro);
}
function preencher(id, pares, valorDesejado) {
    const el=$(id); if (!el) return '';
    el.replaceChildren();
    for (const [valor, label, desativado] of pares) {
        const opt=document.createElement('option'); opt.value=String(valor); opt.textContent=label;
        opt.disabled=Boolean(desativado); el.append(opt);
    }
    const valido=pares.some(([v,,des])=>String(v)===String(valorDesejado)&&!des);
    const primeiro=pares.find(([, , des])=>!des);
    el.value=valido?String(valorDesejado):primeiro?String(primeiro[0]):'';
    el.disabled=!primeiro;
    return el.value;
}
function catalogoDoItem(ano,area,codigo) {
    const matches=catalogo.filter(x=>x.ano===Number(ano)&&x.area===area&&String(x.item)===String(codigo));
    // Em caso de parâmetros conflitantes entre cadernos, o JSON do mapa não
    // carrega a, b, c por ocorrência. Nunca atribuir uma curva arbitrariamente.
    return matches.length===1 ? matches[0] : null;
}
function listaCadernos(ano,area,cor) {
    return (mapa.cadernos || []).filter(x=>x.ano===Number(ano)&&x.area===area&&(!cor||x.cor===cor));
}
function iniciarSeletores() {
    const anos=(catalogo.length ? [...new Set(catalogo.map(x=>x.ano))] : [])
        .filter(y=>y>=2019&&y<=2023).sort((a,b)=>a-b);
    preencher('triAno',anos.map(a=>[a,String(a)]),2023);
    trocarAno();
}
function trocarAno() {
    const ano=$('triAno').value;
    const lista=Object.entries(AREAS).filter(([area])=>listaCadernos(ano,area).length>0);
    preencher('triArea',lista.map(([v,t])=>[v,t]),$('triArea').value || 'MT');
    trocarArea();
}
function trocarArea() {
    const ano=$('triAno').value,area=$('triArea').value;
    const cores=[...new Set(listaCadernos(ano,area).map(x=>x.cor).filter(Boolean))]
        .sort((a,b)=>a.localeCompare(b,'pt-BR'));
    if(!cores.includes(corAtual)) corAtual=cores.includes('AZUL')?'AZUL':(cores[0]||'');
    renderCores(cores); trocarCor();
}
function renderCores(cores) {
    const el=$('triCores'); el.replaceChildren();
    for(const nome of cores) {
        const botao=document.createElement('button');botao.type='button';botao.className='tri-cor';
        botao.setAttribute('aria-pressed',String(nome===corAtual));
        botao.setAttribute('aria-label',`Caderno ${nome}`);
        const bolinha=document.createElement('span');bolinha.className='tri-bolinha';
        const token=Object.entries(CORES).find(([palavra])=>nome.includes(palavra));
        bolinha.style.backgroundColor=token?token[1]:'#d1d5db';
        const texto=document.createElement('span');texto.textContent=nome;
        botao.append(bolinha,texto);
        botao.addEventListener('click',()=>{corAtual=nome;renderCores(cores);trocarCor();});
        el.append(botao);
    }
    if(!cores.length) el.textContent='Nenhuma cor identificada';
}
function trocarCor() {
    const ano=$('triAno').value,area=$('triArea').value;
    const tipos=new Set(listaCadernos(ano,area,corAtual).map(c=>triModalidadeV5(ano,area,c.co_prova)));
    const disponiveis=TRI_V5_ORDEM.filter(tipo=>tipos.has(tipo)).map(tipo=>[tipo,TRI_V5_NOMES[tipo]]);
    const escolha=$('triAplicacao')?.value||'regular';
    preencher('triAplicacao',disponiveis,escolha);
    trocarAplicacao();
}
function trocarCaderno() {
    cadernoAtual=$('triCaderno').value;
    const [co,versao]=cadernoAtual.split('|');
    const ano=+$('triAno').value,area=$('triArea').value;
    const selecionados=mapa.registros.filter(r=>r[0]===ano&&r[1]===co&&r[2]===area&&r[5]===versao&&r[10]===corAtual);
    const codigos=area==='LC'?[...new Set(selecionados.map(r=>String(r[4])).filter(v=>v!==''))].sort():[];
    const grupo=$('triLinguaGrupo');grupo.hidden=codigos.length===0;
    if(codigos.length) {
        const rotulo=c=>c==='0'?'Inglês (0)':c==='1'?'Espanhol (1)':`Língua ${c}`;
        preencher('triLingua',codigos.map(c=>[c,rotulo(c)]),$('triLingua').value);
    }
    trocarLingua();
    triReverOrientacaoV5();
}
function trocarLingua() {
    const [co,versao]=String($('triCaderno').value).split('|');
    const ano=+$('triAno').value,area=$('triArea').value;
    const lingua=$('triLinguaGrupo').hidden?'':$('triLingua').value;
    posicoes=mapa.registros.filter(r=>r[0]===ano&&r[1]===co&&r[2]===area&&r[5]===versao&&r[10]===corAtual&&(r[4]===''||r[4]===lingua))
        .sort((a,b)=>Number(a[3])-Number(b[3]));
    const opcoes=posicoes.map((r,i)=>{
        const cat=catalogoDoItem(ano,area,r[6]);
        const valido=Number(r[8])===1&&cat!==null;
        return [i,`Questão ${r[3]}${valido?'':' · sem parâmetro válido'}`,!valido];
    });
    preencher('triQuestao',opcoes,$('triQuestao').value);
    trocarQuestao();
    marcarAtualizacaoAvancada();
}
function trocarQuestao() {
    const idx=Number($('triQuestao').value),r=posicoes[idx];
    if (!r) {
        itemAtual=null; parametrosOriginais=null;
        $('triItemInfo').replaceChildren();
        aviso('Nenhuma questão válida encontrada nesse caderno e língua. Escolha outra combinação.',true);
        desenhar();return;
    }
    const item=catalogoDoItem(r[0],r[2],r[6]);
    if(!item){aviso('Este item tem parâmetros conflitantes ou ausentes no catálogo; não será usado.',true);return;}
    itemAtual={...item,posicao:r[3],co_prova:r[1],cor:r[10],gabarito:r[7]};
    parametrosOriginais={a:Number(item.a),b:Number(item.b),c:Number(item.c)};
    restaurar();
    const info=[`Questão ${r[3]}`,`Item INEP ${item.item}`,`Prova ${r[1]}`,`Gabarito ${r[7]}`];
    if(item.habilidade) info.push(`Habilidade ${item.habilidade}`);
    if(item.status_misto) info.push('Status varia entre cadernos');
    const el=$('triItemInfo');el.replaceChildren();
    info.forEach(txt=>{const span=document.createElement('span');span.textContent=txt;el.append(span);});
    $('triModo').textContent='Parâmetros oficiais · D = 1';
    aviso(`Item válido selecionado: questão ${r[3]}, ${r[10]}, prova ${r[1]}. Os controles podem ser alterados livremente.`);
    $('triSelecaoNota').textContent=`${posicoes.length} posições disponíveis neste caderno (incluindo itens excluídos, que ficam desabilitados). Confira o tipo de aplicação e a língua escolhida.`;
}
function restaurar(){
    if(!parametrosOriginais) return;
    const o=parametrosOriginais;
    $('triA').min='0.01'; $('triA').max=String(Math.max(10,Math.ceil(o.a+1)));
    $('triB').min=String(Math.min(-5,Math.floor(o.b-2)));
    $('triB').max=String(Math.max(5,Math.ceil(o.b+2)));
    $('triTheta').min=String(Math.min(-4,Math.floor(o.b-3)));
    $('triTheta').max=String(Math.max(4,Math.ceil(o.b+3)));
    for(const k of ['a','b','c']) $('tri'+k.toUpperCase()).value=parametrosOriginais[k];
    desenhar();
}
function valores(){
    return {a:Number($('triA').value), b:Number($('triB').value), c:Number($('triC').value),theta:Number($('triTheta').value)};
}
function tema(){
    const sty=getComputedStyle(document.documentElement);
    const css=(n,d)=>sty.getPropertyValue(n).trim()||d;
    return {blue:css('--serie-1','#2a78d6'),orange:css('--serie-2','#eb6834'),green:css('--serie-3','#1baf7a'),ink:css('--tinta','#0f172a'),muted:css('--tinta-2','#475569'),bg:css('--superficie','#fff'),grid:css('--borda','#e4e9f0')};
}
function layoutBase(t, ytitle){
    return {paper_bgcolor:t.bg,plot_bgcolor:t.bg,font:{color:t.muted,family:'Segoe UI, system-ui, sans-serif',size:11},
        margin:{t:18,l:51,r:16,b:53},showlegend:true,legend:{orientation:'h',y:1.16,x:0,font:{size:10}},
        hovermode:'closest',xaxis:{title:'Proficiência (θ)',range:[-4,4],gridcolor:t.grid,zeroline:false,tick0:-4,dtick:1},
        yaxis:{title:ytitle,gridcolor:t.grid,zeroline:false},uirevision:'tri',autosize:true};
}
function desenhar(){
    if(!$('triGraficoCCI'))return;
    const {a,b,c,theta}=valores(),t=tema(),p=probabilidade(theta,a,b,c);
    $('triValorA').textContent=f(a);$('triValorB').textContent=f(b);$('triValorC').textContent=f(c);$('triValorTheta').textContent=f(theta);
    $('triProbabilidade').textContent=f(p*100,1)+'%';
    $('triProbNoB').textContent=f((1+c)*50,1)+'%';
    $('triThetaDestaque').textContent=f(theta);
    const mudanca=parametrosOriginais && ['a','b','c'].some(k=>Math.abs(valores()[k]-parametrosOriginais[k])>1e-9);
    $('triModo').textContent=mudanca?'Simulação · valores alterados':'Parâmetros oficiais · D = 1';
    $('triInterpretacao').textContent=`Neste item ${mudanca?'simulado':'selecionado'}, um participante com θ = ${f(theta)} tem probabilidade de acerto de ${f(p*100,1)}%. O parâmetro a = ${f(a)} controla a inclinação; b = ${f(b)} indica onde ocorre a transição; c = ${f(c)} fixa o limite inferior. Isso representa uma probabilidade, não a previsão de uma resposta individual.`;
    const xmin=Number($('triTheta').min), xmax=Number($('triTheta').max);
    const x=Array.from({length:321},(_,i)=>xmin+(xmax-xmin)*i/320);
    const y=x.map(v=>probabilidade(v,a,b,c));
    const info=x.map(v=>informacao(v,a,b,c));
    let pico=0;for(let i=1;i<info.length;i++)if(info[i]>info[pico])pico=i;
    $('triInfoAtual').textContent=f(informacao(theta,a,b,c),3);
    $('triInfoPico').textContent=`${f(info[pico],3)} em θ≈${f(x[pico])}`;
    $('triExplicacaoInfo').textContent=`Para a proficiência θ = ${f(theta)}, esta questão fornece informação de Fisher igual a ${f(informacao(theta,a,b,c),3)}. O maior valor no intervalo mostrado ocorre perto de θ = ${f(x[pico])}. Um item é mais preciso na região em que a informação é maior; o pico não precisa coincidir com b.`;
    if (!window.Plotly){
        $('triGraficoCCI').textContent='O Plotly não está disponível. Verifique o carregamento da biblioteca no index.html.';
        $('triGraficoFII').textContent='O gráfico de informação depende do Plotly.';return;
    }
    const curva={x,y,type:'scatter',mode:'lines',name:'Parâmetros atuais',line:{color:t.blue,width:3},hovertemplate:'θ = %{x:.2f}<br>Probabilidade = %{y:.1%}<extra></extra>'};
    const seriesCCI=[curva];
    if(parametrosOriginais&&$('triMostrarOriginal').checked&&mudanca){
        const o=parametrosOriginais;
        seriesCCI.push({x,y:x.map(v=>probabilidade(v,o.a,o.b,o.c)),type:'scatter',mode:'lines',name:'Curva oficial',line:{color:t.orange,width:2,dash:'dash'},hovertemplate:'θ = %{x:.2f}<br>Original = %{y:.1%}<extra></extra>'});
    }
    seriesCCI.push({x:[theta],y:[p],type:'scatter',mode:'markers',name:'Proficiência escolhida',marker:{color:t.blue,size:10,line:{width:2,color:t.bg}},hovertemplate:'θ = %{x:.2f}<br>Probabilidade = %{y:.1%}<extra></extra>'});
    const layCCI=layoutBase(t,'Probabilidade de acerto');
    layCCI.xaxis.range=[xmin,xmax];
    layCCI.yaxis={...layCCI.yaxis,range:[0,1.03],tickformat:'.0%'};
    layCCI.shapes=[{type:'line',x0:xmin,x1:xmax,y0:c,y1:c,line:{color:t.orange,dash:'dot',width:1}},
        {type:'line',x0:b,x1:b,y0:0,y1:1,line:{color:t.muted,dash:'dot',width:1}},
        {type:'line',x0:theta,x1:theta,y0:0,y1:p,line:{color:t.blue,dash:'dot',width:1}}];
    const fiSeries=[{x,y:info,type:'scatter',mode:'lines',line:{color:t.green,width:3},name:'Informação do item',hovertemplate:'θ = %{x:.2f}<br>Informação = %{y:.3f}<extra></extra>'},
        {x:[theta],y:[informacao(theta,a,b,c)],type:'scatter',mode:'markers',marker:{color:t.green,size:10},name:'θ escolhido',hovertemplate:'θ = %{x:.2f}<br>Informação = %{y:.3f}<extra></extra>'}];
    const layFI=layoutBase(t,'Informação de Fisher');
    layFI.xaxis.range=[xmin,xmax];
    layFI.yaxis={...layFI.yaxis,rangemode:'tozero'};
    const opcoes={responsive:true,displayModeBar:false,scrollZoom:false};
    Promise.all([window.Plotly.react($('triGraficoCCI'),seriesCCI,layCCI,opcoes),window.Plotly.react($('triGraficoFII'),fiSeries,layFI,opcoes)])
        .catch(e=>console.error('[TRI] Erro ao renderizar gráficos',e));
}
async function carregar(){
    const token=++tokenCarga;
    aviso('Carregando catálogo e mapeamento de cadernos…');
    const respostas=await Promise.all([fetch(DATA_CATALOGO),fetch(DATA_MAPA)]);
    for(const r of respostas) if(!r.ok) throw new Error(`Arquivo não encontrado (${r.status}): ${r.url}`);
    const [cat,mp]=await Promise.all(respostas.map(r=>r.json()));
    if(token!==tokenCarga)return;
    if(!Array.isArray(cat.itens)||!Array.isArray(mp.registros)||!Array.isArray(mp.cadernos)){
        throw new Error('Formato inesperado dos JSON. Reexecute o script atualizado de tratamento das bases TRI.');
    }
    if(!mp.metadados?.campos?.includes('cor')||mp.registros.some(r=>r.length<11)){
        throw new Error('O mapa_cadernos.json ainda não tem TX_COR. Execute a versão do script que inclui as cores.');
    }
    catalogo=cat.itens;mapa=mp;
    iniciarSeletores();
}
export async function iniciar(){
    if(inicializado) return;
    inicializado=true;
    instalarNavegacaoTRI();
    triInstalarEscalaV4();
    for(const [id,evento,fn] of [
        ['triAno','change',trocarAno],['triArea','change',trocarArea],['triAplicacao','change',trocarAplicacao],['triCaderno','change',trocarCaderno],
        ['triLingua','change',trocarLingua],['triQuestao','change',trocarQuestao],
        ['triA','input',desenhar],['triB','input',desenhar],['triC','input',desenhar],['triTheta','input',desenhar],
        ['triMostrarOriginal','change',desenhar],['triRestaurar','click',restaurar]
    ]) $(id)?.addEventListener(evento,fn);
    new MutationObserver(()=>{if(!$('pagina-tri').hidden)desenhar();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-tema']});
    try{await carregar();}catch(e){console.error('[TRI] Falha ao abrir dados',e);aviso(`${e.message} Confirme que os arquivos existem em Painel-ENEM/dados/tri/ e abra o site por http://localhost:8123.`,true);$('triModo').textContent='Dados não disponíveis';}
}

/* TRI V2 — navegação interna, FIT e simulação EAP em um mesmo caderno. */
const EAP_MIN = -6, EAP_MAX = 6, EAP_PONTOS = 121;
let triItensAtivos = [], triFitCache = null;

function itensValidosDoCaderno() {
    // posicoes já respeita ano, área, cor, código, versão digital e TP_LINGUA.
    // A ordem física no caderno não é CO_ITEM. Não utilizar itens abandonados.
    const resultado = [], vistos = new Set();
    for (const r of posicoes) {
        if (Number(r[8]) !== 1) continue;
        const item = catalogoDoItem(r[0],r[2],r[6]);
        if (!item) continue;
        const chave = String(r[6]);
        if (vistos.has(chave)) continue;
        const a=Number(item.a), b=Number(item.b), c=Number(item.c);
        if (!Number.isFinite(a) || a<=0 || !Number.isFinite(b) || !Number.isFinite(c) || c<0 || c>=1) continue;
        resultado.push({a,b,c,item:chave,posicao:Number(r[3])});
        vistos.add(chave);
    }
    return resultado.sort((x,y)=>x.posicao-y.posicao);
}
function identificarCadernoAvancado(){
    const area=$('triArea')?.value || '', ano=$('triAno')?.value || '';
    const ficha=triSelecaoFichaV5();
    return `${ano} · ${AREAS[area]||area} · ${ficha?.nome||corAtual} · ${TRI_V5_NOMES[ficha?.tipo]||'aplicação a conferir'}`;
}
function marcarAtualizacaoAvancada(){
    triItensAtivos=itensValidosDoCaderno();
    triFitCache=null;
    const n=triItensAtivos.length, label=`${identificarCadernoAvancado()} · ${n} itens válidos`;
    if ($('triFitCabecalho')) $('triFitCabecalho').textContent=label;
    if ($('triEapCabecalho')) $('triEapCabecalho').textContent=label;
    const controle=$('triAcertos');
    if (controle){controle.max=String(n);controle.value=String(Math.floor(n/2));}
    if ($('tri-fit')?.open) desenharFIT();
    if ($('tri-respostas')?.open) desenharEAP();
    atualizarPersonalizacao();
    atualizarFaixaB();
    if ($('triBDetalhes')?.open) atualizarTabelaB();
}
function obterCurvaFIT(){
    if (triFitCache) return triFitCache;
    const theta=Array.from({length:241},(_,i)=>-6+i*0.05);
    const total=theta.map(th=>triItensAtivos.reduce((acc,it)=>acc+informacao(th,it.a,it.b,it.c),0));
    const ep=total.map(i=>i>1e-12?1/Math.sqrt(i):null);
    triFitCache={theta,total,ep};
    return triFitCache;
}
function destacarFIT(){
    if (!$('triFitN')) return;
    const theta=Number($('triTheta')?.value||0);
    const informacaoTotal=triItensAtivos.reduce((acc,it)=>acc+informacao(theta,it.a,it.b,it.c),0);
    $('triFitN').textContent=String(triItensAtivos.length);
    $('triFitAtual').textContent=f(informacaoTotal,3);
    $('triFitErro').textContent=informacaoTotal>1e-12?f(1/Math.sqrt(informacaoTotal),3):'Indefinido';
}
function desenharFIT(){
    if (!$('tri-fit')?.open) return;
    destacarFIT();
    if (!triItensAtivos.length) {
        $('triGraficoFIT').textContent='Não há itens válidos para este caderno e recorte.';
        return;
    }
    const {theta,total,ep}=obterCurvaFIT(), t=tema();
    const modo=$('triFitModo')?.value || 'informacao', erro=modo==='erro';
    const el=$('triGraficoFIT');
    if(!window.Plotly){el.textContent='Plotly não disponível.';return;}
    const serie=[{x:theta,y:erro?ep:total,type:'scatter',mode:'lines',name:erro?'Erro-padrão aprox.':'Informação do teste',
        line:{color:erro?t.orange:t.blue,width:3},connectgaps:false,
        hovertemplate:erro?'θ = %{x:.2f}<br>EP ≈ %{y:.3f}<extra></extra>':'θ = %{x:.2f}<br>Informação = %{y:.3f}<extra></extra>'}];
    const lay=layoutBase(t,erro?'Erro-padrão aproximado':'Informação do teste');
    lay.xaxis.range=[-6,6];lay.yaxis.rangemode='tozero';lay.margin={t:28,l:62,r:18,b:52};
    lay.showlegend=false;lay.uirevision=`tri-fit-${modo}`;
    Promise.resolve(window.Plotly.react(el,serie,lay,{responsive:true,displayModeBar:false,scrollZoom:false}))
        .catch(e=>console.error('[TRI] FIT:',e));
}

// Integral numérica pelo método composto de Simpson em 121 nós igualmente
// espaçados em [-6, 6]. Priori normal N(0,1). Cálculos em log para estabilidade.
// O EAP é a média da posterior, NÃO uma nota oficial convertida.
export function estimarEAP(itens, acertos) {
    if (!itens.length || itens.length!==acertos.length || !itens.every(it=>it.a>0&&it.c>=0&&it.c<1))
        return null;
    const passo=(EAP_MAX-EAP_MIN)/(EAP_PONTOS-1), logp=[], eixo=[], pesos=[];
    for(let k=0;k<EAP_PONTOS;k++){
        const th=EAP_MIN+k*passo;
        let l=-0.5*th*th-0.5*Math.log(2*Math.PI); // log f(theta)
        for(let i=0;i<itens.length;i++){
            const it=itens[i],p=Math.min(1-1e-15,Math.max(1e-15,probabilidade(th,it.a,it.b,it.c)));
            l+=acertos[i]?Math.log(p):Math.log1p(-p);
        }
        eixo.push(th);logp.push(l);
        pesos.push((k===0||k===EAP_PONTOS-1?1:k%2?4:2)*passo/3);
    }
    const maior=Math.max(...logp), exp=logp.map(l=>Math.exp(l-maior));
    const soma=exp.reduce((s,v,i)=>s+v*pesos[i],0);
    if (!(soma>0)) return null;
    const densidade=exp.map(v=>v/soma); // densidade normalizada pela quadratura
    const theta=eixo.reduce((s,v,i)=>s+v*densidade[i]*pesos[i],0);
    const varPosterior=eixo.reduce((s,v,i)=>s+(v-theta)**2*densidade[i]*pesos[i],0);
    return {theta,dp:Math.sqrt(Math.max(0,varPosterior)),x:eixo,y:densidade};
}
function montarGradeRespostas(destino,itens,acertos){
    const root=$(destino);if(!root)return;
    root.replaceChildren();
    itens.forEach((item,i)=>{
        const cel=document.createElement('span');cel.textContent=String(item.posicao);
        cel.title=`Questão ${item.posicao} · b=${f(item.b)} · ${acertos[i]?'acerto':'erro'}`;
        if(acertos[i])cel.classList.add('tri-acerto');
        root.append(cel);
    });
}
function desenharEAP(){
    if (!$('tri-respostas')?.open) return;
    const itens=triItensAtivos, n=itens.length;
    if(!n){
        $('triGraficoEAP').textContent='Não há itens válidos neste recorte.';
        $('triEapFacil').textContent='—';$('triEapDificil').textContent='—';$('triEapDelta').textContent='—';
        $('triPadraoA').replaceChildren();$('triPadraoB').replaceChildren();atualizarNotaPadroes(null,null);atualizarFaixaB();atualizarTabelaB();return;
    }
    const k=Math.max(0,Math.min(n,Number($('triAcertos')?.value || 0)));
    $('triAcertosValor').textContent=`${k} de ${n}`;
    // Em empates de b, a posição serve exclusivamente para uma ordenação estável.
    const ordenado=[...itens.keys()].sort((i,j)=>itens[i].b-itens[j].b || itens[i].posicao-itens[j].posicao);
    const maisFaceis=new Set(ordenado.slice(0,k)), maisDificeis=new Set(k?ordenado.slice(-k):[]);
    const uA=itens.map((_,i)=>maisFaceis.has(i)?1:0), uB=itens.map((_,i)=>maisDificeis.has(i)?1:0);
    const eA=estimarEAP(itens,uA), eB=estimarEAP(itens,uB);
    if(!eA||!eB)return;
    $('triEapFacil').textContent=f(eA.theta,3);
    $('triEapDificil').textContent=f(eB.theta,3);
    $('triEapDelta').textContent=f(eB.theta-eA.theta,3);
    atualizarNotaPadroes(eA,eB);
    atualizarFaixaB();
    if ($('triBDetalhes')?.open) atualizarTabelaB();
    montarGradeRespostas('triPadraoA',itens,uA);
    montarGradeRespostas('triPadraoB',itens,uB);
    const delta=eB.theta-eA.theta;
    $('triEapInterpretacao').textContent=`Nos dois cenários, o participante acertou ${k} de ${n} itens válidos. A proficiência estimada para o padrão A foi θ = ${f(eA.theta,3)} e para o padrão B foi θ = ${f(eB.theta,3)} (diferença B − A = ${f(delta,3)}). Isso evidencia o papel do padrão de respostas e dos parâmetros dos itens, sem implicar uma penalidade separada por “incoerência”.`;
    if (!window.Plotly){$('triGraficoEAP').textContent='Plotly não disponível.';return;}
    const t=tema(), gauss=eA.x.map(v=>Math.exp(-v*v/2)/Math.sqrt(2*Math.PI));
    const traces=[
        {x:eA.x,y:gauss,type:'scatter',mode:'lines',name:'Priori N(0,1)',line:{color:t.muted,width:1.5,dash:'dot'},hovertemplate:'θ = %{x:.2f}<br>Priori = %{y:.3f}<extra></extra>'},
        {x:eA.x,y:eA.y,type:'scatter',mode:'lines',name:'Posterior · padrão A',line:{color:t.blue,width:3},hovertemplate:'θ = %{x:.2f}<br>Densidade A = %{y:.3f}<extra></extra>'},
        {x:eB.x,y:eB.y,type:'scatter',mode:'lines',name:'Posterior · padrão B',line:{color:t.orange,width:3},hovertemplate:'θ = %{x:.2f}<br>Densidade B = %{y:.3f}<extra></extra>'}
    ];
    const lay=layoutBase(t,'Densidade posterior');lay.xaxis.range=[-6,6];lay.margin={t:38,l:54,r:16,b:53};
    lay.legend={orientation:'h',y:1.18,x:0,font:{size:10}};lay.yaxis.rangemode='tozero';lay.uirevision='tri-eap';
    Promise.resolve(window.Plotly.react($('triGraficoEAP'),traces,lay,{responsive:true,displayModeBar:false,scrollZoom:false}))
        .catch(e=>console.error('[TRI] EAP:',e));
}
function instalarNavegacaoTRI(){
    document.querySelectorAll('#tri-indice [data-tri-destino]').forEach(botao=>{
        botao.addEventListener('click',()=>{
            const id=botao.dataset.triDestino, alvo=$(id);if(!alvo)return;
            if(alvo.tagName==='DETAILS') alvo.open=true;
            // Não alterar location.hash: o roteador do painel usa #tri.
            alvo.scrollIntoView({behavior:'smooth',block:'start'});
            if(id==='tri-fit')requestAnimationFrame(()=>desenharFIT());
            if(id==='tri-respostas')requestAnimationFrame(()=>desenharEAP());
            if(id==='tri-respostas-livres')requestAnimationFrame(()=>renderizarGradePessoal());
        });
    });
    $('tri-fit')?.addEventListener('toggle',()=>{if($('tri-fit').open)desenharFIT();});
    $('tri-respostas')?.addEventListener('toggle',()=>{if($('tri-respostas').open)desenharEAP();});
    $('triFitModo')?.addEventListener('change',desenharFIT);
    $('triAcertos')?.addEventListener('input',desenharEAP);
    $('triTheta')?.addEventListener('input',destacarFIT);
    $('tri-respostas-livres')?.addEventListener('toggle',()=>{if($('tri-respostas-livres').open)renderizarGradePessoal();});
    $('triPessoalCalcular')?.addEventListener('click',calcularMarcacoesPessoais);
    $('triPessoalLimpar')?.addEventListener('click',limparMarcacoesPessoais);
    $('triBDetalhes')?.addEventListener('toggle',()=>{if($('triBDetalhes').open)atualizarTabelaB();});
    $('triAcertos')?.addEventListener('input',()=>{atualizarFaixaB();if($('triBDetalhes')?.open)atualizarTabelaB();});
}


/* TRI V3 — ranking b, nota didática e simulação individual por marcação de acertos. */
const triNotaDidatica = theta => 500 + 100*theta;
let triPessoalChave = null;
let triAcertosPessoais = new Set();
let triPessoalCalculado = false;

function triOrdemDificuldade() {
    return [...triItensAtivos.keys()].sort((i,j)=>triItensAtivos[i].b-triItensAtivos[j].b || triItensAtivos[i].posicao-triItensAtivos[j].posicao);
}
function triExtremos(k) {
    const ordem=triOrdemDificuldade(), n=ordem.length;
    const quant=Math.max(0,Math.min(n,Math.round(k)));
    return {ordem,facil:new Set(ordem.slice(0,quant)),dificil:new Set(quant?ordem.slice(-quant):[]),quant};
}
function atualizarTabelaB() {
    const tbody=$('triTabelaB');if(!tbody)return;
    tbody.replaceChildren();
    const n=triItensAtivos.length;
    if(!n){const tr=tbody.insertRow();const td=tr.insertCell();td.colSpan=4;td.textContent='Nenhum item válido.';return;}
    const {ordem,facil,dificil}=triExtremos(Number($('triAcertos')?.value || 0));
    ordem.forEach((index,ranking)=>{
        const it=triItensAtivos[index],linha=tbody.insertRow();
        const tipo=facil.has(index)&&dificil.has(index)?'A e B':facil.has(index)?'A · menor b':dificil.has(index)?'B · maior b':'Não selecionado';
        [String(ranking+1)+' de '+n,String(it.posicao),f(it.b,3),tipo].forEach(valor=>{const td=linha.insertCell();td.textContent=valor;});
    });
}
function atualizarFaixaB() {
    const el=$('triFaixaB');if(!el)return;
    const n=triItensAtivos.length;
    if(!n){el.textContent='Não há questões válidas no caderno selecionado.';return;}
    const {ordem,quant}=triExtremos(Number($('triAcertos')?.value||0));
    const min=triItensAtivos[ordem[0]].b,max=triItensAtivos[ordem[n-1]].b;
    if(!quant){el.textContent=`Neste caderno: b mínimo ${f(min,3)}; b máximo ${f(max,3)}. Selecione acertos para definir os padrões.`;return;}
    const maxFacil=triItensAtivos[ordem[quant-1]].b;
    const minDificil=triItensAtivos[ordem[n-quant]].b;
    el.textContent=`Neste caderno, b varia de ${f(min,3)} a ${f(max,3)}. Com ${quant} acertos: padrão A = ${quant} menores b (até ${f(maxFacil,3)}); padrão B = ${quant} maiores b (a partir de ${f(minDificil,3)}).${2*quant>n?' Os padrões têm questões em comum.':''}`;
}
function atualizarNotaPadroes(eA,eB) {
    if ($('triEapNotaFacil')) $('triEapNotaFacil').textContent=eA?f(triNotaDidatica(eA.theta),1):'—';
    if ($('triEapNotaDificil')) $('triEapNotaDificil').textContent=eB?f(triNotaDidatica(eB.theta),1):'—';
    if ($('triEapNotaDelta')) $('triEapNotaDelta').textContent=eA&&eB?f(100*(eB.theta-eA.theta),1):'—';
}
function triChaveDoCaderno() {
    return [String($('triAno')?.value||''),String($('triArea')?.value||''),corAtual,
            String($('triCaderno')?.value||''),$('triLinguaGrupo')?.hidden?'':String($('triLingua')?.value||'')].join('|');
}
function triLimparResultadoPessoal(mensagem) {
    triPessoalCalculado=false;
    triUltimoThetaPessoalV4=null;
    triCalAtualizarV4(null);
    for(const id of ['triPessoalN','triPessoalTheta','triPessoalNota']) if($(id))$(id).textContent='—';
    if($('triPessoalStatus'))$('triPessoalStatus').textContent=mensagem||'Marque seus acertos e clique em “Calcular minha simulação”.';
    const grafico=$('triPessoalGrafico');
    if(grafico){if(window.Plotly?.purge)try{window.Plotly.purge(grafico);}catch(_e){}grafico.replaceChildren();}
}
function atualizarPersonalizacao() {
    const chave=triChaveDoCaderno();
    if(chave!==triPessoalChave){
        triPessoalChave=chave;triAcertosPessoais=new Set();
        triLimparResultadoPessoal('Novo caderno selecionado. Marque as questões que acertou; as demais serão consideradas incorretas.');
    }
    const cab=$('triPessoalCaderno');
    if(cab)cab.textContent=`${identificarCadernoAvancado()} · ${triItensAtivos.length} itens válidos para estimação`;
    if($('tri-respostas-livres')?.open)renderizarGradePessoal();
    triCalAtualizarV4();
}
function renderizarGradePessoal(){
    const root=$('triPessoalGrade');if(!root)return;
    root.replaceChildren();
    const validas=new Map(triItensAtivos.map(it=>[it.posicao,it]));
    const aparicoes=new Map();
    for(const r of posicoes){const p=Number(r[3]); if(Number.isFinite(p)) aparicoes.set(p,(aparicoes.get(p)||0)+1);}
    const posicoesTodas=[...aparicoes.keys()].sort((a,b)=>a-b);
    if(!posicoesTodas.length){root.textContent='Não há questões neste caderno.';return;}
    for(const p of posicoesTodas){
        const it=validas.get(p), ambigua=(aparicoes.get(p)||0)>1, ativa=!!it&&!ambigua;
        const botao=document.createElement('button');botao.type='button';botao.className='tri-pessoal-questao';
        botao.textContent=String(p);
        botao.disabled=!ativa;
        botao.setAttribute('aria-pressed',String(ativa&&triAcertosPessoais.has(p)));
        botao.title=ativa?`Questão ${p} · b = ${f(it.b,3)} · clique para ${triAcertosPessoais.has(p)?'desmarcar':'marcar'} acerto`:
            `Questão ${p} · excluída ou com mapeamento ambíguo, sem estimação`;
        botao.setAttribute('aria-label',botao.title);
        if(ativa)botao.addEventListener('click',()=>{
            if(triAcertosPessoais.has(p))triAcertosPessoais.delete(p);else triAcertosPessoais.add(p);
            botao.setAttribute('aria-pressed',String(triAcertosPessoais.has(p)));
            botao.title=`Questão ${p} · b = ${f(it.b,3)} · ${triAcertosPessoais.has(p)?'acerto marcado':'não marcada (erro)'}`;
            botao.setAttribute('aria-label',botao.title);
            atualizarContagemPessoal();
            if(triPessoalCalculado)triLimparResultadoPessoal('As marcações mudaram. Clique novamente em “Calcular minha simulação” para atualizar a estimativa.');
        });
        root.append(botao);
    }
    atualizarContagemPessoal();
}
function atualizarContagemPessoal(){
    const n=triItensAtivos.length;
    const el=$('triPessoalContagem');
    if(el)el.textContent=`${triAcertosPessoais.size} de ${n} questões válidas marcadas como corretas`;
}
function limparMarcacoesPessoais(){
    triAcertosPessoais.clear();triLimparResultadoPessoal('Marcações limpas. Se não marcar nenhuma questão, o cálculo considerará zero acertos.');
    renderizarGradePessoal();
}
function calcularMarcacoesPessoais(){
    const itens=triItensAtivos,n=itens.length;
    if(!n){triLimparResultadoPessoal('Selecione um caderno com itens válidos.');return;}
    const pos=new Set();let ambiguo=false;
    for(const it of itens){if(pos.has(it.posicao))ambiguo=true;pos.add(it.posicao);}
    const qtdRegistros=new Map();
    for(const r of posicoes){const p=Number(r[3]);qtdRegistros.set(p,(qtdRegistros.get(p)||0)+1);}
    if(ambiguo||itens.some(it=>qtdRegistros.get(it.posicao)!==1)){
        triLimparResultadoPessoal('Mapeamento ambíguo neste caderno. Para evitar uma estimativa incorreta, tente outra prova ou língua.');return;
    }
    const u=itens.map(it=>triAcertosPessoais.has(it.posicao)?1:0);
    const e=estimarEAP(itens,u);
    if(!e){triLimparResultadoPessoal('Não foi possível estimar a proficiência para o caderno selecionado.');return;}
    triPessoalCalculado=true;
    $('triPessoalN').textContent=`${triAcertosPessoais.size} / ${n}`;
    $('triPessoalTheta').textContent=f(e.theta,3);
    triUltimoThetaPessoalV4=e.theta;
    triCalAtualizarV4(e.theta);
    $('triPessoalStatus').textContent=`Foram considerados ${triAcertosPessoais.size} acertos e ${n-triAcertosPessoais.size} erros. Proficiência EAP = ${f(e.theta,3)}; desvio-padrão posterior na escala θ ≈ ${f(e.dp,3)}. Consulte acima a nota calibrada não oficial.`;
    const grafico=$('triPessoalGrafico');
    if(!window.Plotly){grafico.textContent='Plotly não disponível.';return;}
    const t=tema(),priori=e.x.map(v=>Math.exp(-v*v/2)/Math.sqrt(2*Math.PI));
    const serie=[
        {x:e.x,y:priori,type:'scatter',mode:'lines',name:'Priori N(0,1)',line:{color:t.muted,width:2,dash:'dot'},hovertemplate:'θ = %{x:.2f}<br>Priori = %{y:.3f}<extra></extra>'},
        {x:e.x,y:e.y,type:'scatter',mode:'lines',name:'Posterior · seus acertos',line:{color:t.blue,width:3},hovertemplate:'θ = %{x:.2f}<br>Posterior = %{y:.3f}<extra></extra>'}
    ];
    const lay=layoutBase(t,'Densidade posterior');lay.xaxis.range=[-6,6];lay.yaxis.rangemode='tozero';lay.margin={t:38,l:54,r:16,b:53};
    lay.legend={orientation:'h',y:1.18,x:0,font:{size:10}};lay.uirevision='tri-meus-acertos';
    Promise.resolve(window.Plotly.react(grafico,serie,lay,{responsive:true,displayModeBar:false,scrollZoom:false}))
        .catch(err=>console.error('[TRI] Simulação pessoal:',err));
}

/* TRI V4 — calibração específica por caderno, com aprovação explícita. */
const TRI_CALIBRACOES_URL = new URL('../../Calibracao_TRI_ENEM/coeficientes_tri_painel_publico_v9.json', import.meta.url);
let triCalibracoesV4 = null;
let triCalibracoesErroV4 = '';
let triUltimoThetaPessoalV4 = null;
const triPreviewLocalV4 = ['localhost','127.0.0.1','::1','[::1]'].includes(window.location.hostname);

function triCalCadernoV4() {
    const ano = Number($('triAno')?.value), area = $('triArea')?.value || '';
    const codigo = String($('triCaderno')?.value || '').split('|')[0].trim();
    if (!Number.isInteger(ano) || !['MT','CN','CH','LC'].includes(area) || !/^\d+$/.test(codigo)) return null;
    return {ano, area, codigo, chave:`${ano}|${area}|${codigo}`};
}
function triCalMetricasV4(reg) {
    const n = Number(reg.n_validacao), mae = Number(reg.mae_validacao);
    const partes = [`A = ${f(Number(reg.A),4)}`,`B = ${f(Number(reg.B),4)}`];
    if (Number.isFinite(n)) partes.push(`N de validação = ${n}`);
    if (Number.isFinite(mae)) partes.push(`MAE do caderno = ${f(mae,3)} ponto(s)`);
    return partes.join(' · ');
}
// TRI v9: mostra nota calibrada ao publico somente para cadernos habilitados.
// Quantil de erros: obtido da particao de calibracao, com teste separado.
// Piso de cautela: heuristico (5/10/20 pontos). NAO equivale a IC ou cobertura garantida.
function triV9LimparMargem(mensagem) {
    if($('triV6Margem'))$('triV6Margem').textContent='—';
    if($('triV6Intervalo'))$('triV6Intervalo').textContent='—';
    if($('triV6MargemAviso'))$('triV6MargemAviso').textContent=mensagem;
}
function triV9Faixa(reg,acertos) {
    return Object.values(reg?.faixas_margem_empirica||{}).find(x=>
        acertos>=Number(x.min_acertos)&&acertos<=Number(x.max_acertos))||null;
}
function triV9FaixaApta(faixa) {
    if(!faixa||faixa.status!=='apta_a_revisao')return false;
    const m=Number(faixa.margem_pontos), c=Number(faixa.cobertura_teste);
    return faixa.margem_pontos!==null&&Number.isFinite(m)&&m>0&&
        Number(faixa.n_cal)>=50&&Number(faixa.n_teste)>=40&&
        faixa.cobertura_teste!==null&&Number.isFinite(c)&&c>=0.90&&c<=1;
}
function triV9Piso(acertos,validos) {
    if(!Number.isInteger(acertos)||!Number.isInteger(validos)||validos<=0)return NaN;
    const p=acertos/validos;
    return p<2/3?5:p<0.845?10:20;
}
function triCalAtualizarV4(theta=triUltimoThetaPessoalV4) {
    const valor=$('triEscalaNota'), situacao=$('triEscalaSituacao'),explicacao=$('triEscalaExplicacao');
    const meta=$('triEscalaCoeficientes'),calcular=$('triPessoalCalcular'),resumo=$('triV9Resumo');
    if(!valor||!situacao||!explicacao||!meta)return;
    valor.textContent='—';meta.textContent='';
    if(calcular)calcular.disabled=true;
    if(resumo)resumo.textContent='Marque as questões corretas e clique em “Calcular minha nota”.';
    triV9LimparMargem('A margem será exibida somente quando houver amostra e cobertura suficientes na validação.');
    if(triCalibracoesErroV4) {
        situacao.textContent='Dados indisponíveis'; explicacao.textContent=triCalibracoesErroV4;return;
    }
    if(!triCalibracoesV4) {
        situacao.textContent='Carregando dados…';explicacao.textContent='Consultando Calibracao_TRI_ENEM.';return;
    }
    const ident=triCalCadernoV4();
    if(!ident) {
        situacao.textContent='Selecione seu caderno';
        explicacao.textContent='Escolha ano, área, cor, aplicação e caderno na seção 02.';return;
    }
    const reg=triCalibracoesV4.por_caderno?.[ident.chave];
    if(!reg||reg.aprovado_painel!==true||reg.visibilidade_nota!=='publica_nao_oficial'||reg.situacao==='revisar') {
        situacao.textContent='Estimativa indisponível nesta prova';
        explicacao.textContent='A estimação de nota está temporariamente desabilitada neste caderno. As explicações, gráficos de itens e demais recursos educativos continuam disponíveis.';
        triV9LimparMargem('Este caderno requer revisão estatística; não calculamos nota nem margem para ele.');
        if(resumo)resumo.textContent='Você pode explorar os parâmetros e as curvas da TRI nas outras seções.';
        return;
    }
    const A=Number(reg.A), B=Number(reg.B);
    if(!Number.isFinite(A)||!Number.isFinite(B)||A<=0||triItensAtivos.length<30){
        situacao.textContent='Dados insuficientes';
        explicacao.textContent='Confira o caderno e a língua estrangeira selecionada.';return;
    }
    if(calcular)calcular.disabled=false;
    meta.textContent=`A = ${f(A,4)} · B = ${f(B,4)} · N de teste na auditoria = ${reg.n_teste_auditoria??'não informado'} · MAE do teste = ${Number.isFinite(Number(reg.mae_teste_ponderado))?f(Number(reg.mae_teste_ponderado),3):'não informado'}`;
    if(!Number.isFinite(theta)) {
        situacao.textContent='Pronta para calcular';
        explicacao.textContent='A proficiência EAP é convertida para nota por A × θ̂ + B, com os coeficientes específicos do caderno.';return;
    }
    const nota=A*theta+B;
    if(!Number.isFinite(nota))return;
    valor.textContent=f(nota,1);
    situacao.textContent='Estimativa disponível';
    const acertos=triAcertosPessoais.size,n=triItensAtivos.length;
    if(resumo)resumo.textContent=`${acertos} de ${n} questões válidas marcadas como corretas`;
    explicacao.textContent=`Proficiência EAP θ̂ = ${f(theta,3)} (internamente sem arredondamento). Nota = ${f(A,4)} × θ̂ + ${f(B,4)} = ${f(nota,1)} pontos. Os coeficientes e as margens foram obtidos na mesma auditoria; resultado não oficial.`;
    const faixa=triV9Faixa(reg,acertos);
    if(!triV9FaixaApta(faixa)) {
        if($('triV6Margem'))$('triV6Margem').textContent='Não disponível';
        if($('triV6Intervalo'))$('triV6Intervalo').textContent='Sem faixa estimada';
        if($('triV6MargemAviso'))$('triV6MargemAviso').textContent=faixa?.status==='cobertura_insuficiente'
            ?'Nesta faixa de acertos, a cobertura no teste foi insuficiente para divulgar uma margem. A nota pontual continua disponível.'
            :'Nesta faixa de acertos, não há participantes suficientes para estimar uma margem confiável. A nota pontual continua disponível.';
        return;
    }
    const mEmpirico=Number(faixa.margem_pontos),piso=triV9Piso(acertos,n);
    const margem=Math.max(mEmpirico,piso);
    if($('triV6Margem'))$('triV6Margem').textContent=`± ${f(margem,1)} pontos`;
    if($('triV6Intervalo'))$('triV6Intervalo').textContent=`${f(nota-margem,1)} a ${f(nota+margem,1)}`;
    const foiAmpliada=margem>mEmpirico+1e-9;
    const rotulo=`${faixa.min_acertos}–${faixa.max_acertos} acertos`;
    if($('triV6MargemAviso'))$('triV6MargemAviso').textContent=
        `Faixa orientativa (${rotulo}). A margem empírica observada foi ±${f(mEmpirico,1)} ponto(s) `+
        `(n=${faixa.n_cal} na calibração; ${f(100*Number(faixa.cobertura_teste),1)}% de cobertura em ${faixa.n_teste} casos de teste). `+
        (foiAmpliada?`Por cautela, ampliamos a margem exibida para ±${f(margem,1)} pontos. `:'')+
        `Esta faixa não é um intervalo de confiança oficial nem garante cobertura de 95% para sua nota.`;
}

async function triCarregarCalibracoesV4() {
    try {
        const resp=await fetch(TRI_CALIBRACOES_URL,{cache:'no-store'});
        if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
        const dados=await resp.json();
        if(!dados || typeof dados.por_caderno!=='object' || !dados.regras_de_uso)
            throw new Error('Estrutura inesperada no JSON de calibração');
        triCalibracoesV4=dados;
        triCalibracoesErroV4='';
    } catch(err) {
        triCalibracoesErroV4=`Não foi possível carregar Calibracao_TRI_ENEM/coeficientes_tri_painel_publico_v9.json (${err.message}). O cálculo EAP continua disponível.`;
        console.warn('[TRI] Calibração não carregada:',err);
    }
    triCalAtualizarV4();
}
function triInstalarEscalaV4() {
    const grupo=$('triEscalaPreviewGrupo'), input=$('triEscalaPreview');
    if(grupo)grupo.hidden=!triPreviewLocalV4;
    input?.addEventListener('change',()=>triCalAtualizarV4());
    $('triV6Detalhes')?.addEventListener('toggle',()=>{if($('triV6Detalhes').open && triPessoalCalculado)requestAnimationFrame(()=>calcularMarcacoesPessoais());});
    void triCarregarCalibracoesV4();
}

/* TRI V5 — identificação do caderno impresso e modalidade da aplicação. */
// As faixas abaixo correspondem aos dicionários de CO_PROVA de 2019–2023.
// Somente códigos explicitamente classificados recebem modalidade conhecida.
// Códigos não presentes nesses intervalos continuam selecionáveis, mas exibem
// aviso de identificação incompleta; não se atribui aplicação arbitrariamente.
const TRI_V5_BASES = {
  2019: { CH:{regular:507,reaplicacao:547}, LC:{regular:511,reaplicacao:551}, MT:{regular:515,reaplicacao:555}, CN:{regular:503,reaplicacao:543} },
  2020: { CH:{regular:567,reaplicacao:647,digital:687},LC:{regular:577,reaplicacao:657,digital:691},MT:{regular:587,reaplicacao:667,digital:695},CN:{regular:597,reaplicacao:677,digital:699} },
  2021: { CH:{regular:879,reaplicacao:959,digital:999,segunda:1015},LC:{regular:889,reaplicacao:969,digital:1003,segunda:1025},MT:{regular:899,reaplicacao:979,digital:1007,segunda:1035},CN:{regular:909,reaplicacao:989,digital:1011,segunda:1045} },
  2022: { CH:{regular:1055,reaplicacao:1135,digital:1175},LC:{regular:1065,reaplicacao:1145,digital:1179},MT:{regular:1075,reaplicacao:1155,digital:1183},CN:{regular:1085,reaplicacao:1165,digital:1187} },
  2023: { CH:{regular:1191,reaplicacao:1271},LC:{regular:1201,reaplicacao:1281},MT:{regular:1211,reaplicacao:1291},CN:{regular:1221,reaplicacao:1301} }
};
const TRI_V5_NOMES = {regular:'Aplicação regular',reaplicacao:'Reaplicação / PPL',digital:'Aplicação digital',segunda:'Segunda oportunidade',outra:'Outras versões / acessibilidade'};
const TRI_V5_ORDEM = ['regular','reaplicacao','digital','segunda','outra'];
function triModalidadeV5(ano,area,codigo) {
    const n=Number(codigo), defs=TRI_V5_BASES[Number(ano)]?.[area];
    if(!Number.isInteger(n)||!defs)return 'outra';
    for(const [tipo,base] of Object.entries(defs))if(n>=base&&n<=base+3)return tipo;
    return 'outra';
}
function triNumeroImpressoV5(area,cor) {
    const primeiro=['LC','CH'].includes(area);
    const c=String(cor).toUpperCase();
    if(c.includes('LEITOR'))return null;
    if(c.includes('LARANJA'))return primeiro?9:11;
    if(c.includes('VERDE'))return primeiro?10:12;
    const map=primeiro?{AZUL:1,AMARELA:2,BRANCA:3,BRANCO:3,ROSA:4}:
        {AMARELA:5,CINZA:6,AZUL:7,ROSA:8};
    return Object.entries(map).find(([k])=>c.includes(k))?.[1] ?? null;
}
function triFichaCadernoV5(cad,ano,area,cor) {
    const tipo=triModalidadeV5(ano,area,cad.co_prova);
    const numero=triNumeroImpressoV5(area,cor);
    let nome=numero?`Caderno ${numero} · ${cor}`:`Caderno ${cor}`;
    if(tipo==='outra')nome+=' · versão especial (identificação a conferir)';
    if(String(cad.versao_digital||'')!==''){
        const vers=String(cad.versao_digital);
        nome+=area==='LC'&&tipo==='digital'&&(vers==='0'||vers==='1')?` · ${vers==='0'?'Inglês':'Espanhol'}`:` · versão ${vers}`;
    }
    return {tipo,nome,numero,codigo:String(cad.co_prova),versao:String(cad.versao_digital||'')};
}
function triSelecaoFichaV5() {
    const [codigo,versao]=String($('triCaderno')?.value||'').split('|');
    const ano=Number($('triAno')?.value),area=$('triArea')?.value;
    const cad=listaCadernos(ano,area,corAtual).find(x=>String(x.co_prova)===codigo&&String(x.versao_digital||'')===String(versao||''));
    return cad?triFichaCadernoV5(cad,ano,area,corAtual):null;
}
function triReverOrientacaoV5() {
    const ficha=triSelecaoFichaV5(), avisoCaderno=$('triOrientacaoCaderno'),codigo=$('triCodigoInterno'),link=$('triLinkInep');
    if(link)link.href=`https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/${$('triAno')?.value||2023}`;
    if(codigo)codigo.textContent=ficha?`Código interno INEP: ${ficha.codigo}${ficha.versao?' · versão digital '+ficha.versao:''}`:'Nenhum caderno selecionado.';
    if(!avisoCaderno)return;
    if(!ficha){avisoCaderno.textContent='Selecione uma aplicação e um caderno.';return;}
    if(ficha.tipo==='outra')avisoCaderno.textContent='Este código corresponde a uma variante que não foi identificada de forma inequívoca pelos intervalos principais dos dicionários. Verifique a capa e os arquivos oficiais antes de marcar acertos. Não assumimos que seja uma aplicação regular.';
    else avisoCaderno.textContent=`Selecionado: ${ficha.nome} · ${TRI_V5_NOMES[ficha.tipo]}. O código interno será usado automaticamente; você não precisa conhecê-lo.`;
}
function trocarAplicacao() {
    const ano=$('triAno').value,area=$('triArea').value,tipo=$('triAplicacao')?.value;
    const anteriores=listaCadernos(ano,area,corAtual);
    const opcoes=anteriores.filter(c=>triModalidadeV5(ano,area,c.co_prova)===tipo)
        .map(c=>{const dados=triFichaCadernoV5(c,ano,area,corAtual);return [[dados.codigo,dados.versao].join('|'),dados.nome];});
    const unicos=[...new Map(opcoes.map(o=>[o[0],o])).values()];
    const desejado=unicos.some(x=>x[0]===cadernoAtual)?cadernoAtual:'';
    cadernoAtual=preencher('triCaderno',unicos,desejado);
    trocarCaderno();
}

/* TRI V9 — nota pública não oficial, margem orientativa e detalhes recolhidos. */
// tri_v9_estimativas_publicas_faixas_orientativas
