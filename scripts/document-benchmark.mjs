/** Reproducible CPU document-export benchmark. No browser or GPU is involved. */
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const site=process.env.SKIA_SOURCE_ROOT||fileURLToPath(new URL('../',import.meta.url)),engine=process.env.SKIA_ENGINE_ROOT||site+'/dist/vendor',require=createRequire(import.meta.url);
const K=await require(engine+'/canvaskit.cjs')({locateFile:n=>engine+'/'+n}),{Initialize}=await import(site+'/dist/lib/index.js'),S=await Initialize({CanvasKit:K,isolated:true,fonts:[{family:'DejaVu Sans',data:readFileSync(site+'/dist/fonts/DejaVuSans.ttf')}]});
if(process.env.SKIA_DOCUMENT_MODULE){const {createDocuments}=await import(process.env.SKIA_DOCUMENT_MODULE);Object.assign(S,createDocuments(K,S));}
const p=new S.SKPaint({Color:S.SKColors.Black}),font=new S.SKFont(null,11),results=[];
for(const [name,options]of [['native',{}],['strict vector',{StrictVector:true}],['vector with fallback backing',{NativeBackend:false}]]){const times=[];let size;for(let run=0;run<4;run++){const start=performance.now(),doc=S.SKDocument.CreatePdf(options);for(let page=0;page<6;page++){const canvas=doc.BeginPage(600,840);for(let line=0;line<80;line++)canvas.DrawText('Searchable document text — Zażółć gęślą jaźń '+line,25,25+line*9,font,p);doc.EndPage();}const data=doc.ToData();size=data.Size;data.Dispose();doc.Dispose();if(run>0)times.push(performance.now()-start);}times.sort((a,b)=>a-b);results.push({Backend:name,Pages:6,TextDraws:480,MedianMilliseconds:+times[1].toFixed(2),PdfBytes:size});}font.Dispose();p.Dispose();console.log(JSON.stringify(results,null,2));
