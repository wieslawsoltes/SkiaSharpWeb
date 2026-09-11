/** Alternating, warmed CPU microbenchmarks; not whole-application GPU claims. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {Initialize} from '../dist/lib/index.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
const warmupRounds=5,rounds=21;
function compare(before,after){
 const samples={before:[],after:[]};let checksum;
 const measure=fn=>{const t=performance.now(),result=fn(),ms=performance.now()-t;if(checksum===undefined)checksum=result;assert.equal(result,checksum,'Workload result changed');return ms;};
 for(let i=0;i<warmupRounds;i++){measure(before);measure(after);}
 for(let i=0;i<rounds;i++)for(const name of i%2?['after','before']:['before','after'])samples[name].push(measure(name==='before'?before:after));
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],b=median(samples.before),a=median(samples.after);
 return{warmupRounds,measuredRounds:rounds,beforeMedianMs:b,afterMedianMs:a,speedup:b/a,checksum,samples};
}
const curve=new S.SKPath().MoveTo(0,0),writer=new S.SKDynamicMemoryWStream();
for(let i=0;i<128;i++)curve.CubicTo(i,30,i+20,-20,i+30,i%70);curve.Close();
const chunk=new Uint8Array(16384);for(let i=0;i<chunk.length;i++)chunk[i]=i%251;
for(let i=0;i<256;i++)writer.Write(chunk);
try{
 const count=500,limit=S.SKGraphics.GetPathCacheStatistics().MaxBytes;
 const workload=()=>{let sum=0;for(let i=0;i<count;i++){const points=curve.GetPoints();sum+=points.length+points[i%points.length].X+curve.VerbCount+curve.SegmentMasks+(curve.IsFinite?1:0)+(curve.IsLastContourClosed?1:0);}return sum;};
 const before=()=>{S.SKGraphics.SetPathCacheLimit(0);return workload();};
 const after=()=>{S.SKGraphics.SetPathCacheLimit(limit);return workload();};
 // Assert all returned coordinates and classifications, not just an aggregate.
 S.SKGraphics.SetPathCacheLimit(0);const expected=curve.GetPoints().map(p=>p.ToArray());S.SKGraphics.SetPathCacheLimit(limit);assert.deepEqual(curve.GetPoints().map(p=>p.ToArray()),expected);
 const queries=compare(before,after);queries.workload={cubicSegments:128,pointCount:curve.PointCount,queryBundlesPerRound:count};queries.cache=S.SKGraphics.GetPathCacheStatistics();
 function legacyMaterialize(){const bytes=new Uint8Array(writer.BytesWritten);let at=0;for(const part of writer._parts){bytes.set(part,at);at+=part.length;}return new S.SKData(bytes);}
 const old=legacyMaterialize(),current=writer.CopyToData();let hash;
 try{assert.deepEqual(old.AsSpan(),current.AsSpan());hash=createHash('sha256').update(current.AsSpan()).digest('hex');}finally{old.Dispose();current.Dispose();}
 const data=compare(()=>{const d=legacyMaterialize();try{return d.Size+d.Span[5000];}finally{d.Dispose();}},()=>{const d=writer.CopyToData();try{return d.Size+d.Span[5000];}finally{d.Dispose();}});
 data.workload={bytes:writer.BytesWritten,chunks:256};data.outputSha256=hash;data.fullSizeCopies={before:2,after:1};
 const rectangles=Array.from({length:1200},(_,i)=>new S.SKRectI(i%20,Math.floor(i/20)*3,i%20+2,Math.floor(i/20)*3+2));
 const makeRegion=batched=>{const r=new S.SKRegion();if(batched)r.SetRects(rectangles);else for(const rect of rectangles)r.Op(rect,S.SKRegionOperation.Union);return r;};
 const reference=makeRegion(false),batched=makeRegion(true);try{assert(reference.Equals(batched));}finally{reference.Dispose();batched.Dispose();}
 const regions=compare(()=>{const r=makeRegion(false);try{return r.Complexity;}finally{r.Dispose();}},()=>{const r=makeRegion(true);try{return r.Complexity;}finally{r.Dispose();}});
 regions.workload={rectangles:rectangles.length,before:'Sequential Op(Union)',after:'Balanced SetRects',equalCanonicalRegions:true};
 const report={version:S.Version,node:process.version,platform:process.platform,architecture:process.arch,scope:'Same-process CPU path-query and byte-copy microbenchmarks. Not physical-GPU or full-application speedups.',pathQueries:queries,writerMaterialization:data,regionConstruction:regions,passed:true};
 const output=process.argv[2];if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));
}finally{curve.Dispose();writer.Dispose();S.SKGraphics.PurgePathCache();}
