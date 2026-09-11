import {DrawOptimizationScene,CreateOptimizationPath} from './optimization-scene.js';
import {RegisterWebComponent} from './lib/index.js';
const $=id=>document.getElementById(id),view=$('view'),state={width:12,dash:true,controls:false,cap:'Round',blur:false},nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
let S,path,lastReport,busy=false,closed=false;
const colors=()=>document.documentElement.dataset.theme==='light'?{bg:'#EEF3F8',grid:'#DDE5EF',stroke:'#087B66',fill:'#437AC7',point:'#8658BB'}:{bg:'#121B27',grid:'#202F42',stroke:'#49DDBD',fill:'#83ACFF',point:'#DAA7FF'};
const error=e=>{$('error').hidden=false;$('error').textContent=e.message??String(e);};
function render(canvas,blur=false){return DrawOptimizationScene(S,path,canvas,state,colors(),blur);}

function update(){if(closed||!S)return;void view.InvalidateSurface();}
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportPDF({blur=state.blur,strict=$('strict').checked}={}){
 const doc=S.SKDocument.CreatePdf({NativeBackend:true,StrictVector:strict,DiagnosticsLimit:64});
 try{render(doc.BeginPage(1000,420),blur);const data=doc.ToData();try{return {bytes:data.ToArray(),diagnostics:doc.RasterDiagnostics};}finally{data.Dispose();}}
 finally{doc.Dispose();}
}
async function benchmarks(){
 if(busy)throw Error('A benchmark is already running.');busy=true;$('benchmark').disabled=true;const previousLimit=S.SKGraphics.GetPathCacheStatistics().MaxBytes;
 const curve=new S.SKPath().MoveTo(0,0),writer=new S.SKDynamicMemoryWStream();for(let i=0;i<96;i++)curve.CubicTo(i,40,i+20,-30,i+35,i%50);
 const part=new Uint8Array(16384).fill(123);for(let i=0;i<128;i++)writer.Write(part);
 const report={version:S.Version,userAgent:navigator.userAgent,scope:'Warmed CPU microbenchmarks, not GPU throughput',warmupRounds:5,measuredRounds:9,results:{}};
 try{
  const query=()=>{let sum=0;for(let i=0;i<150;i++)sum+=curve.GetPoints().length+curve.VerbCount+(curve.IsFinite?1:0);return sum;};
  const beforeData=()=>{const buffer=new Uint8Array(writer.BytesWritten);let i=0;for(const p of writer._parts){buffer.set(p,i);i+=p.length;}const data=new S.SKData(buffer);try{return data.Size;}finally{data.Dispose();}};
  const afterData=()=>{const data=writer.CopyToData();try{return data.Size;}finally{data.Dispose();}};
  const pairs={path:[()=>{S.SKGraphics.SetPathCacheLimit(0);return query();},()=>{S.SKGraphics.SetPathCacheLimit(8*1024*1024);return query();}],data:[beforeData,afterData]};
  for(const [name,functions]of Object.entries(pairs)){
   const samples=[[],[]];let expected;
   for(let round=-5;round<9;round++){
    if(closed)throw Error('Page closed');$('benchmark-status').textContent=`Measuring ${name} · round ${Math.max(0,round)+1} / 9`;await nextFrame();
    for(const index of round%2?[1,0]:[0,1]){const start=performance.now(),value=functions[index](),ms=performance.now()-start;expected??=value;if(value!==expected)throw Error('Benchmark outputs differ');if(round>=0)samples[index].push(ms);}
   }
   const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],before=median(samples[0]),after=median(samples[1]);
   report.results[name]={beforeMedianMs:before,afterMedianMs:after,ratio:before/after,samples,checksum:expected};
   $(name+'-before').textContent=before.toFixed(2)+' ms';$(name+'-after').textContent=after.toFixed(2)+' ms';$(name+'-ratio').textContent=(before/after).toFixed(2)+'×';
  }
  lastReport=report;$('save-report').disabled=false;$('benchmark-status').textContent='Completed · workload checksums agree';return report;
 }finally{curve.Dispose();writer.Dispose();S.SKGraphics.SetPathCacheLimit(previousLimit);busy=false;$('benchmark').disabled=false;update();}
}
async function initialize(){
 S=await RegisterWebComponent({fonts:false});if(closed)return;
 path=CreateOptimizationPath(S);
 $('version').textContent='v'+S.Version;
 view.addEventListener('paintsurface',e=>{const start=performance.now();try{render(e.detail.Canvas,state.blur);const stats=S.SKGraphics.GetPathCacheStatistics();$('mode').textContent=e.detail.Surface.RenderMode;$('points').textContent=path.PointCount;$('hits').textContent=stats.Hits.toLocaleString();$('memory').textContent=stats.RetainedBytes.toLocaleString();$('draw-time').textContent=(performance.now()-start).toFixed(2)+' ms · CPU draw';}catch(e){error(e);}});
 view.addEventListener('surfaceerror',e=>error(e.detail));
 $('backend').addEventListener('change',e=>{view.setAttribute('backend',e.target.value);});
 $('width').addEventListener('input',e=>{state.width=Number(e.target.value);$('width-value').textContent=state.width+' px';update();});
 $('cap').addEventListener('change',e=>{state.cap=e.target.value;update();});
 for(const name of ['dash','controls','blur'])$(name).addEventListener('change',e=>{state[name]=e.target.checked;update();});
 $('cache').addEventListener('change',e=>{S.SKGraphics.SetPathCacheLimit(e.target.checked?8*1024*1024:0);update();});
 $('purge').addEventListener('click',()=>{S.SKGraphics.PurgePathCache();update();});
 $('theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';update();});
 $('export').addEventListener('click',()=>{try{const result=exportPDF();download(result.bytes,'native-geometry.pdf','application/pdf');$('document-status').textContent=`${result.bytes.length.toLocaleString()} bytes · ${result.diagnostics.Total} native raster decisions${result.diagnostics.Total?' · '+result.diagnostics.Events.map(e=>e.Reason).filter((x,i,a)=>a.indexOf(x)===i).join(', '):' · vector geometry retained'}`;$('error').hidden=true;}catch(e){$('document-status').textContent=e.message;error(e);}});
 $('benchmark').addEventListener('click',()=>void benchmarks().catch(error));$('save-report').addEventListener('click',()=>download(JSON.stringify(lastReport,null,2),'geometry-benchmark.json','application/json'));
 window.optimizationLab={S,view,benchmarks,exportPDF,state};await view.InvalidateSurface();
}
window.addEventListener('pagehide',e=>{if(!e.persisted){closed=true;view.remove();path?.Dispose();S?.SKGraphics.PurgePathCache();}});
void initialize().catch(error);
