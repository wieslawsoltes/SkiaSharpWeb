import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Initialize} from '../dist/lib/index.js';
import {installMemoryTracing} from '../dist/lib/memory.js';
import {installGpuRecords} from '../dist/lib/gpu-records.js';
const K = await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S = await Initialize({CanvasKit:K,fonts:false,isolated:true});

test('memory trace preserves ulong values, ownership and immutable snapshots',()=>{
 const trace=new S.SKMemoryTrace(true,false);
 trace.OnDumpNumericValue('cache/item','size','bytes',9007199254740993n);
 trace.OnDumpStringValue('cache/item','type','texture');
 trace.OnSetMemoryBacking('cache/item','gpu','7');
 trace.OnDumpWrappedState('cache/item',true);trace.OnSetDiscardableMemoryBacking('cache/item');
 assert.equal(trace.Entries[0].Values.size.Value,9007199254740993n);
 const entries=trace.Entries;entries[0].Backing.Id='changed';
 assert.equal(trace.Entries[0].Backing.Id,'7');assert.match(trace.ToJson(),/9007199254740993/);
 assert.equal(trace.DetailedDump,true);assert.equal(trace.DumpWrappedObjects,false);
 trace.Clear();assert.equal(trace.Entries.length,0);trace.Dispose();trace.Dispose();
 assert.throws(()=>trace.Entries,/disposed/i);
});
test('memory facade invokes native statistics, never fabricated approximations',()=>{
 let current=0,seen;
 class Context{_current(){current++;} }
 const api={SKObject:S.SKObject,SKNotSupportedError:S.SKNotSupportedError,GRContext:Context,SKGraphics:{GetCapabilities:()=>({Other:true})}};
 const engine={SkiaSharpGraphicsDumpMemoryStatistics(d){d.OnDumpNumericValue('native','size','bytes',123);},SkiaSharpGaneshDumpMemoryStatistics(c,d){seen=c;d.OnDumpStringValue('ganesh','type','texture');}};
 installMemoryTracing(engine,api);
 const trace=new api.SKMemoryTrace(),context=new Context();context._native={id:9};
 api.SKGraphics.DumpMemoryStatistics(trace);context.DumpMemoryStatistics(trace);
 assert.equal(current,1);assert.equal(seen,context._native);assert.equal(trace.Entries[0].Values.size.Value,123);
 assert.equal(api.SKGraphics.GetCapabilities().NativeMemoryDump,true);
 assert.throws(()=>api.SKGraphics.DumpMemoryStatistics({}),TypeError);
 trace.Dispose();assert.throws(()=>context.DumpMemoryStatistics(trace),/disposed/i);
 delete engine.SkiaSharpGraphicsDumpMemoryStatistics;
 assert.equal(api.SKGraphics.GetCapabilities().NativeMemoryDump,false);
 assert.throws(()=>api.SKGraphics.DumpMemoryStatistics(new api.SKMemoryTrace()),/rebuilt/);
});
test('bundled native memory callbacks execute when present; older engines reject explicitly',()=>{
 const trace=new S.SKMemoryTrace();
 try{
  if(S.SKGraphics.GetCapabilities().NativeMemoryDump){
   const surface=S.SKSurface.Create(new S.SKImageInfo(16,16)),paint=new S.SKPaint();
   try{surface.Canvas.DrawCircle(4,4,3,paint);S.SKGraphics.DumpMemoryStatistics(trace);assert(Array.isArray(trace.Entries));for(const row of trace.Entries)assert.equal(typeof row.Name,'string');}finally{surface.Dispose();paint.Dispose();}
  }else assert.throws(()=>S.SKGraphics.DumpMemoryStatistics(trace),/rebuilt/);
 }finally{trace.Dispose();}
});
function cacheHarness(fast=true){
 let deletes=0,uploads=0,next=1,identityCalls=0;
 class Native{
  constructor(id=next++){this.id=id;this.deleted=false;}
  clone(){assert(!this.deleted);return new Native(this.id);}
  delete(){assert(!this.deleted,'native double delete');this.deleted=true;deletes++;}
  isAliasOf(n){assert(!this.deleted);return this.id===n.id;}
 }
 class Image{
  constructor(w=4,h=4,n=new Native()){this.Width=w;this.Height=h;this.Info={BytesPerPixel:4};this._native=n;this.IsDisposed=false;}
  static _fromNative(n){return new Image(4,4,n);}
  ThrowIfDisposed(){if(this.IsDisposed)throw Error('disposed image');}
  Dispose(){if(!this.IsDisposed){this.IsDisposed=true;this._native.delete();}}
 }
 class Recorder{constructor(){this._native={};this._surfaces=new Set();this.IsDisposed=false;this.Context={ThrowIfDisposed(){}};}ThrowIfDisposed(){if(this.IsDisposed)throw Error('disposed recorder');}}
 class Record{constructor(values){Object.assign(this,values);}}
 const engine={SkiaSharpImageToGraphiteTexture(r,i,m){uploads++;return new Native(i.id);}};
 if(fast)engine.SkiaSharpImageUniqueID=n=>{identityCalls++;return n.id;};
 const api={SKNotSupportedError:Error,SKImage:Image,SKGraphiteRecorder:Recorder,SKGraphiteContextOptions:class extends Record{},SKGraphiteSubmitInfo:class extends Record{},SKGraphiteInsertRecordingInfo:class extends Record{}};
 installGpuRecords(engine,api);
 return {api,Image,Recorder,Native,stats:()=>({deletes,uploads,identityCalls})};
}
test('Graphite cache bounds bytes, refreshes LRU and retains caller ownership',()=>{
 const {api,Image,Recorder}=cacheHarness(),cache=new api.SKGraphiteImageCache({Capacity:3,MaxBytes:128}),r=new Recorder();
 const a=new Image(),b=new Image(),c=new Image(),ta=cache.FindOrCreate(r,a),tb=cache.FindOrCreate(r,b);
 const again=cache.FindOrCreate(r,a);again.Dispose();
 const tc=cache.FindOrCreate(r,c);
 assert.equal(cache.GetStatistics().Count,2);assert.equal(cache.GetStatistics().EstimatedBytes,128);
 assert.equal(cache.GetStatistics().Evictions,1);assert.equal(tb.IsDisposed,false);
 assert.equal(cache.GetStatistics().AliasComparisons,0);
 cache.MaxBytes=64;assert.equal(cache.GetStatistics().Count,1);
 assert.equal(ta.IsDisposed,false);cache.Dispose();assert.equal(tc.IsDisposed,false);
 for(const v of [a,b,c,ta,tb,tc])v.Dispose();assert.equal(r._surfaces.size,0);
});
test('Graphite image aliases hit native-ID map without linear scans',()=>{
 const {api,Image,Recorder,stats}=cacheHarness(),cache=new api.SKGraphiteImageCache(),r=new Recorder();
 const sources=[];
 for(let i=0;i<100;i++){const image=new Image();sources.push(image);cache.FindOrCreate(r,image).Dispose();}
 for(let i=0;i<100;i++){const alias=new Image(4,4,sources[i]._native.clone());cache.FindOrCreate(r,alias).Dispose();alias.Dispose();}
 assert.equal(stats().uploads,100);assert.equal(cache.GetStatistics().Hits,100);assert.equal(cache.GetStatistics().AliasComparisons,0);
 assert.equal(cache.GetStatistics().NativeIdentity,true);cache.Dispose();sources.forEach(s=>s.Dispose());assert.equal(r._surfaces.size,0);
});
test('Graphite byte budgets account for mipmaps and bypass oversized images',()=>{
 const {api,Image,Recorder}=cacheHarness(),cache=new api.SKGraphiteImageCache({MaxBytes:80}),r=new Recorder(),a=new Image();
 cache.FindOrCreate(r,a,false).Dispose();assert.equal(cache.GetStatistics().EstimatedBytes,64);
 const m=cache.FindOrCreate(r,a,true);assert.equal(cache.GetStatistics().OversizeBypasses,1);assert.equal(cache.GetStatistics().Count,1);m.Dispose();
 cache.MaxBytes=84;cache.FindOrCreate(r,a,true).Dispose();assert.equal(cache.GetStatistics().EstimatedBytes,84);assert.equal(cache.GetStatistics().Count,1);
 cache.Capacity=0;assert.equal(cache.GetStatistics().Count,0);cache.FindOrCreate(r,a).Dispose();assert.equal(cache.GetStatistics().Count,0);
 cache.Dispose();a.Dispose();assert.equal(r._surfaces.size,0);
});
test('Graphite cache isolates recorders, validates limits and supports old engines',()=>{
 const {api,Image,Recorder}=cacheHarness(false),cache=new api.SKGraphiteImageCache(),a=new Image(),alias=new Image(4,4,a._native.clone()),r=new Recorder(),r2=new Recorder();
 for(const limit of [-1,1.1,Infinity,NaN])assert.throws(()=>{cache.MaxBytes=limit;},RangeError);
 cache.FindOrCreate(r,a).Dispose();cache.FindOrCreate(r,alias).Dispose();cache.FindOrCreate(r2,a).Dispose();
 assert.equal(cache.GetStatistics().Hits,1);assert.equal(cache.GetStatistics().Count,2);assert.equal(cache.GetStatistics().NativeIdentity,false);
 cache.PurgeForRecorder(r);assert.equal(cache.GetStatistics().Count,1);assert.equal(r._surfaces.size,0);
 cache.Dispose();a.Dispose();alias.Dispose();assert.equal(r2._surfaces.size,0);
});
test('parallel initialization fetches concurrently but registers in declared order',async()=>{
 const original=globalThis.fetch,requests=[],pending=[];const bytes=fs.readFileSync(new URL('../dist/fonts/DejaVuSans.ttf',import.meta.url));
 globalThis.fetch=url=>new Promise(resolve=>{requests.push(url);pending.push(()=>resolve({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}));});
 try{
  const initialized=Initialize({CanvasKit:K,isolated:true,fonts:[{url:'one',family:'First'},{url:'two',family:'Second'},{url:'three',family:'Third'}]});
  await Promise.resolve();assert.deepEqual(requests,['one','two','three']);
  pending[2]();pending[1]();pending[0]();const api=await initialized;
  assert.deepEqual(api.SKFontManager.Default.FontFamilies.slice(-3),['First','Second','Third']);
  api.SKFontManager.Default.Dispose();
 }finally{globalThis.fetch=original;}
});
test('initialization rejects failed font fetches and cancelled requests',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:503});
 try{await assert.rejects(Initialize({CanvasKit:K,isolated:true,fonts:[{url:'failed'}]}),/503/);}finally{globalThis.fetch=original;}
 const controller=new AbortController();controller.abort();
 await assert.rejects(Initialize({CanvasKit:K,isolated:true,signal:controller.signal,fonts:[]}),/abort/i);
});
