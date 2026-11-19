/** Testes paramétricos sobre estatísticas suficientes por grupo.
 * Levene na variante Brown–Forsythe: ANOVA de |nota - mediana do grupo|.
 * Welch: ANOVA ponderada pelas variâncias dos grupos.
 * Games–Howell: q studentizado, com CDF/quantil da jStat (carregada sob demanda).
 */
export const ALFA = 0.05;

const soma = (lista, fn) => lista.reduce((acc, v, i) => acc + fn(v, i), 0);
const probabil = p => Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : null;

/** p valor e estatística do teste global de Welch. */
export function calcularWelch(grupos, jStat) {
    const g = grupos.filter(v => v.n >= 2 && v.var > 0 && Number.isFinite(v.media));
    const k = g.length;
    if (k < 2) return null;
    const pesos = g.map(v => v.n / v.var);
    const W = pesos.reduce((a,b) => a+b, 0);
    const mediaW = soma(g, (v,i) => pesos[i] * v.media) / W;
    const B = soma(g, (v,i) => ((1 - pesos[i]/W)**2)/(v.n-1));
    const dfn = k-1;
    const dfd = B > 0 ? (k*k-1)/(3*B) : Infinity;
    const numerador = soma(g, (v,i) => pesos[i]*(v.media-mediaW)**2) / dfn;
    const F = numerador / (1 + 2*(k-2)*B/(k*k-1));
    return {F, dfn, dfd, p: probabil(1 - jStat.centralF.cdf(F,dfn,dfd)), k};
}

/** Levene centrado na mediana, requer média/variância dos desvios absolutos por grupo. */
export function calcularLevene(grupos, jStat) {
    const g = grupos.filter(v => v.n >= 2 && Number.isFinite(v.mediaZ) && Number.isFinite(v.varZ));
    const k = g.length;
    const N = soma(g,v=>v.n);
    if (k < 2 || N <= k) return null;
    const media = soma(g, v=>v.n*v.mediaZ)/N;
    const ssb = soma(g,v=>v.n*(v.mediaZ-media)**2);
    const ssw = soma(g,v=>(v.n-1)*v.varZ);
    const dfn=k-1, dfd=N-k;
    const F = ssw > 0 ? (ssb/dfn)/(ssw/dfd) : (ssb > 0 ? Infinity : 0);
    return {F, dfn, dfd, p: probabil(1-jStat.centralF.cdf(F,dfn,dfd)), k};
}

/** η² descritivo: fração de soma de quadrados entre grupos; não é ω² de Welch. */
export function calcularEtaQuadrado(grupos) {
    const g = grupos.filter(v=>v.n>=2 && Number.isFinite(v.var) && Number.isFinite(v.media));
    const N = soma(g,v=>v.n);
    if (N === 0 || g.length < 2) return null;
    const media = soma(g,v=>v.n*v.media)/N;
    const ssb=soma(g,v=>v.n*(v.media-media)**2);
    const ssw=soma(g,v=>(v.n-1)*v.var);
    return (ssb+ssw)>0 ? ssb/(ssb+ssw) : 0;
}

/** Ômega quadrado clássico (ANOVA): correção amostral de soma de quadrados.
 * Não se confunde com um ω² derivado de Welch (heterocedástico).
 */
export function calcularOmegaClassico(grupos) {
    const g=grupos.filter(v=>v.n>=2 && Number.isFinite(v.var) && Number.isFinite(v.media));
    const k=g.length, N=soma(g,v=>v.n);
    if(k<2 || N<=k)return null;
    const media=soma(g,v=>v.n*v.media)/N;
    const ssb=soma(g,v=>v.n*(v.media-media)**2);
    const ssw=soma(g,v=>(v.n-1)*v.var);
    const msw=ssw/(N-k);
    return (ssb+ssw+msw)>0 ? Math.max(0,(ssb-(k-1)*msw)/(ssb+ssw+msw)) : 0;
}

/** Compara um par de grupos (ordem: média de A - média de B). */
export function calcularPar(a,b,k,jStat) {
    const v1=a.var/a.n, v2=b.var/b.n;
    const se=Math.sqrt(v1+v2);
    const df=((v1+v2)**2)/(v1*v1/(a.n-1)+v2*v2/(b.n-1));
    const dif=a.media-b.media;
    if (!Number.isFinite(df) || !(se>0)) return null;
    const q=Math.SQRT2*Math.abs(dif)/se;
    const p=probabil(1-jStat.tukey.cdf(q,k,df));
    const qcrit=jStat.tukey.inv(1-ALFA,k,df);
    const margem = qcrit * se / Math.SQRT2;
    const dav=dif/Math.sqrt((a.var+b.var)/2);
    return {grupo1:a.rotulo,grupo2:b.rotulo,dif,icInf:dif-margem,icSup:dif+margem,p,dav,
        df, valido: p!==null && Number.isFinite(margem), magnitude:magnitudeD(dav)};
}

export function magnitudeD(d) {
    const x=Math.abs(d);
    return x<.2 ? 'Desprezível' : x<.5 ? 'Pequeno' : x<.8 ? 'Moderado' : 'Grande';
}
export function magnitudeEta(eta) {
    return eta<.01 ? 'Muito pequeno' : eta<.06 ? 'Pequeno' : eta<.14 ? 'Moderado' : 'Grande';
}
export const significativo = p => p !== null && p < ALFA;
