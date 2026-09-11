/** Real Skia raster workload, interleaved cache-off/on, identical pixel hashes. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Initialize } from '../dist/lib/index.js';
const K = await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const A = await Initialize({CanvasKit:K,fonts:false,isolated:true});
const count = 10000, rounds = 21, width = 512, height = 512;
const bitmap = new A.SKBitmap(24,24), sourceCanvas = new A.SKCanvas(bitmap);
sourceCanvas.Clear(A.SKColors.Transparent);
const paint = new A.SKPaint({Color:new A.SKColor(30,180,140,230),IsAntialias:true});
sourceCanvas.DrawCircle(12,12,11,paint); sourceCanvas.Dispose(); paint.Dispose(); bitmap.SetImmutable();
const surface = A.SKSurface.Create(new A.SKImageInfo(width,height));
const samples = {uncached:[],cached:[]}, allocations = {uncached:[],cached:[]};
const oldFromBitmap = A.SKImage.FromBitmap;
// Count calls in uncached original drawing; cache misses are independently counted.
let copies = 0; A.SKImage.FromBitmap = function(...args){ copies++; return oldFromBitmap.apply(this,args); };
const hash = () => {const image=surface.Snapshot();try{return createHash('sha256').update(image.ReadPixels()).digest('hex');}finally{image.Dispose();}};
const hashes = {};
function workload(mode) {
  A.SKGraphics.SetBitmapCacheLimit(mode==='cached'?32*1024*1024:0);
  surface.Canvas.Clear(A.SKColors.Transparent); copies=0;
  const before=A.SKGraphics.GetBitmapCacheStatistics();
  const start=performance.now();
  for(let i=0;i<count;i++)surface.Canvas.DrawBitmap(bitmap,(i*17)%width-12,(i*31)%height-12);
  surface.Flush(); const elapsed=performance.now()-start;
  allocations[mode].push(copies+A.SKGraphics.GetBitmapCacheStatistics().Misses-before.Misses);
  hashes[mode]=hash(); return elapsed;
}
for(let i=0;i<5;i++){workload('uncached');workload('cached');}
allocations.cached=[];allocations.uncached=[];
for(let i=0;i<rounds;i++)for(const mode of i%2?['cached','uncached']:['uncached','cached'])samples[mode].push(workload(mode));
const median = a => [...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const report={runtime:process.version,renderer:'actual Skia CPU raster (not GPU timing)',count,rounds,bitmap:[24,24],surface:[width,height],pixelHashes:hashes,
  identicalPixels:hashes.cached===hashes.uncached,cases:Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,{medianMs:median(values),p95Ms:[...values].sort((a,b)=>a-b)[Math.floor(values.length*.95)],medianSnapshotConstructions:median(allocations[name])}])),speedup:median(samples.uncached)/median(samples.cached)};
A.SKImage.FromBitmap=oldFromBitmap;bitmap.Dispose();surface.Dispose();A.SKGraphics.PurgeBitmapCache();
if(!report.identicalPixels)throw new Error('Optimization changed rendered pixels');
const target=process.argv[process.argv.indexOf('--output')+1];if(process.argv.includes('--output'))writeFileSync(target,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
