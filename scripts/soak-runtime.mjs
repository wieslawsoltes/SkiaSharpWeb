/** Finite, reproducible native-resource soak. Not indefinite production certification. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {Initialize} from '../dist/lib/index.js';
const rounds=Number(process.argv[2]??100000),output=process.argv[3]??'test-output/soak/runtime.json';
if(!Number.isSafeInteger(rounds)||rounds<1000||rounds>1000000)throw new RangeError('Soak rounds must be an integer from 1,000 through 1,000,000.');
if(!global.gc)throw new Error('Run with node --expose-gc scripts/soak-runtime.mjs [rounds] [report.json].');
const wasm=fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url));
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:wasm});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
const animationJSON=fs.readFileSync(new URL('../dist/samples/orbit.json',import.meta.url),'utf8');
const report={version:S.Version,node:process.version,rounds,warmupRounds:2000,backend:'native-Skia-raster',physicalGPU:false,
  scope:'Finite native-resource create/render/encode/decode/dispose soak. Not a hardware GPU, complete fuzzing or indefinite production qualification.',
  cycles:{surfaces:0,paints:0,paths:0,shaders:0,snapshots:0,encodes:0,decodes:0,pictures:0,documents:0,animations:0},samples:[],errors:[]};
let liveOwned=0,peakOwned=0;
function cycle(i,count=true){
 const owned=[],take=o=>{assert(o,'Native allocation returned null');owned.push(o);liveOwned++;peakOwned=Math.max(peakOwned,liveOwned);return o;};
 const bump=name=>{if(count)report.cycles[name]++;};
 try{
  const surface=take(S.SKSurface.Create(new S.SKImageInfo(48,48))),paint=take(new S.SKPaint({IsAntialias:true,Color:S.SKColors.Red})),curve=take(new S.SKPath());bump('surfaces');bump('paints');bump('paths');
  const shader=take(S.SKShader.CreateLinearGradient(new S.SKPoint(0,0),new S.SKPoint(48,48),[S.SKColors.Red,S.SKColors.Blue],[0,1],S.SKShaderTileMode.Clamp));paint.Shader=shader;bump('shaders');
  curve.MoveTo(3,5).CubicTo(7,43,41,6,43,41).LineTo(4,43).Close();
  surface.Canvas.Clear(S.SKColors.Transparent);surface.Canvas.DrawPath(curve,paint);
  const image=take(surface.Snapshot());bump('snapshots');
  if(i%25===0){const data=take(image.Encode('Png'));bump('encodes');const decoded=take(S.SKImage.FromEncodedData(data));bump('decodes');assert.equal(decoded.Width,48);assert(decoded.ReadPixels().some(v=>v>0));}
  if(i%40===0){const recorder=take(new S.SKPictureRecorder()),c=recorder.BeginRecording(S.SKRect.Create(48,48));c.DrawPath(curve,paint);const picture=take(recorder.EndRecording());bump('pictures');surface.Canvas.DrawPicture(picture);}
  if(i%100===0){const doc=take(S.SKDocument.CreatePdf({DiagnosticsLimit:2}));doc.BeginPage(48,48).DrawPath(curve,paint);doc.EndPage();const data=take(doc.ToData());assert(data.Size>100);bump('documents');}
  if(i%100===0){const a=take(S.Animation.Parse(animationJSON));a.SeekFrame(i%120);a.Render(surface.Canvas,S.SKRect.Create(48,48));bump('animations');}
 }finally{
  const failures=[];for(const o of owned.reverse()){try{o.Dispose();}catch(e){failures.push(e);}finally{liveOwned--;}}
  assert.equal(liveOwned,0,'An iteration retained tracked resources');if(failures.length)throw new AggregateError(failures,'Native disposal failed');
 }
}
async function snapshot(round){
 S.SKGraphics.PurgeAllCaches();S.SKGraphics.PurgeBitmapCache();S.SKFontCache?.Clear();
 await new Promise(resolve=>setImmediate(resolve));global.gc();await new Promise(resolve=>setImmediate(resolve));
 const memory=process.memoryUsage(),trace=new S.SKMemoryTrace();let nativeRows;
 try{S.SKGraphics.DumpMemoryStatistics(trace);nativeRows=trace.Entries;}finally{trace.Dispose();}
 return{round,elapsedMs:performance.now()-start,emvalHandles:K.count_emval_handles(),wasmCapacityBytes:K.HEAPU8.buffer.byteLength,
  heapUsed:memory.heapUsed,external:memory.external,rss:memory.rss,liveTrackedResources:liveOwned,
  bitmapCache:S.SKGraphics.GetBitmapCacheStatistics(),nativeMemoryRows:nativeRows};
}
const start=performance.now();
try{
 for(let i=0;i<report.warmupRounds;i++)cycle(i,false);
 report.samples.push(await snapshot(0));
 const interval=Math.max(1000,Math.floor(rounds/20));
 for(let i=0;i<rounds;i++){cycle(i);if((i+1)%interval===0||i+1===rounds)report.samples.push(await snapshot(i+1));}
 const baseline=report.samples[0],last=report.samples.at(-1);
 assert(report.samples.every(s=>s.emvalHandles===baseline.emvalHandles),'Embind JS reference handles increased after resource disposal');
 assert(report.samples.every(s=>s.liveTrackedResources===0),'Tracked native wrappers leaked');
 assert(report.samples.every(s=>s.bitmapCache.EntryCount===0&&s.bitmapCache.RetainedBytes===0),'Purged bitmap cache retained entries');
 // WASM capacity is an allocator high-water mark, not total live allocation.
 assert.equal(last.wasmCapacityBytes,baseline.wasmCapacityBytes,'WASM capacity grew beyond the warmed workload plateau');
 const plateau=report.samples.slice(Math.floor(report.samples.length/2));
 const spread=Math.max(...plateau.map(s=>s.heapUsed))-Math.min(...plateau.map(s=>s.heapUsed));
 assert(spread<16*1024*1024,'Post-GC JavaScript heap did not stabilize within the 16 MiB tolerance');
 report.final={durationMs:performance.now()-start,peakTrackedResources:peakOwned,postGcHeapSpreadBytes:spread,
  emvalHandleGrowth:last.emvalHandles-baseline.emvalHandles,wasmCapacityGrowth:last.wasmCapacityBytes-baseline.wasmCapacityBytes};
 report.passed=true;
}catch(e){report.passed=false;report.errors.push({message:e.message,stack:e.stack});process.exitCode=1;}
finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');console.log(JSON.stringify({passed:report.passed,rounds,cycles:report.cycles,final:report.final,errors:report.errors}));}
