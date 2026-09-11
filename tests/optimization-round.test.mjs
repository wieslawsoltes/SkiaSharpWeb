import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {Initialize} from '../dist/lib/index.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
const values=p=>p.Points.map(v=>v.ToArray());
const own=(list,o)=>(list.push(o),o);
const scoped=fn=>{const list=[];try{return fn(o=>own(list,o));}finally{for(const o of list.reverse())o.Dispose();}};

test('all eighteen fill-path overloads use native geometry and preserve source ownership',()=>scoped(o=>{
 assert.equal(S.SKPaint.HasNativeGeometry,true);
 const src=o(new S.SKPath().MoveTo(2,4).CubicTo(18,42,30,-7,55,33)),paint=o(new S.SKPaint({Style:S.SKPaintStyle.Stroke,StrokeWidth:7,StrokeJoin:S.SKStrokeJoin.Round}));
 const rect=new S.SKRect(-10,-10,100,100),matrix=S.SKMatrix.CreateScale(3,.5),suffixes=[[],[2],[matrix],[rect],[rect,2],[rect,matrix]];
 for(const suffix of suffixes){
  const expected=K.SkiaSharpPaintGetFillPath(paint._native,src._native,suffix[0] instanceof S.SKRect?rect.ToArray():null,(suffix.at(-1) instanceof S.SKMatrix?matrix:typeof suffix.at(-1)==='number'?S.SKMatrix.CreateScale(suffix.at(-1),suffix.at(-1)):S.SKMatrix.Identity).ToArray());
  const reference=o(S.SKPath.FromVerbsPointsWeights(expected.Verbs,expected.Points,expected.Weights));
  for(const kind of ['return','path','builder']){
   const dst=kind==='path'?o(new S.SKPath().AddCircle(900,900,10)):kind==='builder'?o(new S.SKPathBuilder().MoveTo(900,900)):null;
   const result=dst?paint.GetFillPath(src,dst,...suffix):o(paint.GetFillPath(src,...suffix));
   assert.equal(dst?result:true,expected.Success);assert.deepEqual(values(dst??result),values(reference));
  }
 }
 assert.equal(src.PointCount,4);
}));
test('hairline fill-path failure distinguishes obsolete SKPath and SKPathBuilder destinations',()=>scoped(o=>{
 const paint=o(new S.SKPaint({Style:S.SKPaintStyle.Stroke,StrokeWidth:0})),src=o(new S.SKPath().MoveTo(1,2).LineTo(8,9)),dst=o(new S.SKPath().AddCircle(30,30,3)),builder=o(new S.SKPathBuilder().AddCircle(30,30,3));
 const before=dst.ToSvgPathData();assert.equal(paint.GetFillPath(src),null);assert.equal(paint.GetFillPath(src,dst),false);assert.equal(dst.ToSvgPathData(),before);assert.equal(paint.GetFillPath(src,builder),false);assert.deepEqual(values(builder),values(src));
}));
test('fill geometry honors dash effects, culling, aliases and validates before mutation',()=>scoped(o=>{
 const src=o(new S.SKPath().MoveTo(0,0).LineTo(100,0)),paint=o(new S.SKPaint({Style:S.SKPaintStyle.Stroke,StrokeWidth:3})),dash=o(S.SKPathEffect.CreateDash([5,5],0));paint.PathEffect=dash;
 const result=o(paint.GetFillPath(src,new S.SKRect(0,-2,20,2),S.SKMatrix.Identity));assert(result.PointCount>4);
 const expected=result.ToSvgPathData();assert(paint.GetFillPath(src,src,new S.SKRect(0,-2,20,2),S.SKMatrix.Identity));assert.equal(src.ToSvgPathData(),expected);
 const before=src.ToSvgPathData();assert.throws(()=>paint.GetFillPath(src,src,{},9),TypeError);assert.equal(src.ToSvgPathData(),before);assert.throws(()=>paint.GetFillPath(src,null),TypeError);
}));
test('native fast bounds incorporates blur, stroke, output shapes and failure state',()=>scoped(o=>{
 const paint=o(new S.SKPaint({Style:S.SKPaintStyle.Stroke,StrokeWidth:4})),blur=o(S.SKMaskFilter.CreateBlur(S.SKBlurStyle.Normal,3));paint.MaskFilter=blur;
 const r=new S.SKRect(0,0,10,10),native=K.SkiaSharpPaintFastBounds(paint._native,r.ToArray());
 for(const output of [{},new S.SKRect(),[]]){assert.equal(paint.GetFastBounds(r,output),native.Success);assert.deepEqual((output.Value??output).ToArray?.()??output,native.Bounds);}
 assert.deepEqual(paint.GetFastBounds(r).ToArray(),native.Bounds);assert(native.Bounds[0]<-2);
}));

test('path query cache batches native point and classification queries while returning independent values',()=>scoped(o=>{
 S.SKGraphics.PurgePathCache();const p=o(new S.SKPath().MoveTo(1,2).LineTo(3,4).QuadTo(5,6,7,8).ConicTo(9,10,11,12,.5).CubicTo(13,14,15,16,17,18).Close());
 const n=p._native.toCmds.bind(p._native);let reads=0;p._native.toCmds=(...args)=>{reads++;return n(...args);};
 const a=p.GetPoints(),b=p.GetPoints();a[0].X=999;assert.equal(b[0].X,1);
 assert.equal(p.VerbCount,6);assert.equal(p.SegmentMasks,15);assert.equal(p.IsLastContourClosed,true);assert.equal(p.IsFinite,true);assert.equal(p.IsLine,false);
 for(let i=0;i<100;i++)assert.equal(p.GetPoint(i%p.PointCount).X,b[i%p.PointCount].X);
 assert.equal(reads,1);assert.equal(S.SKGraphics.GetPathCacheStatistics().EntryCount,1);
}));
test('path query cache invalidates edits, replacements, detach, last-point changes and disposal',()=>{
 S.SKGraphics.PurgePathCache();const p=new S.SKPathBuilder().MoveTo(1,2).LineTo(3,4);
 try{assert(p.IsLine);p.QuadTo(5,6,7,8);assert.equal(p.VerbCount,3);p.SetLastPoint(8,9);assert.deepEqual(p.GetPoint(p.PointCount-1).ToArray(),[8,9]);
  const copy=p.Detach();try{assert.equal(p.PointCount,0);assert.equal(p.VerbCount,0);assert.equal(copy.VerbCount,3);copy.Reset();assert.equal(copy.GetPoints().length,0);}finally{copy.Dispose();}
 }finally{p.Dispose();}assert.equal(S.SKGraphics.GetPathCacheStatistics().EntryCount,0);assert.throws(()=>p.GetPoints(),/disposed/);
});
test('path query LRU obeys byte budgets, oversized bypass, disable and purge',()=>scoped(o=>{
 S.SKGraphics.PurgePathCache();const old=S.SKGraphics.SetPathCacheLimit(100);
 try{const a=o(new S.SKPath().MoveTo(1,2).LineTo(3,4)),b=o(new S.SKPath().AddRect(S.SKRect.Create(10,10)));a.GetPoints();assert.equal(S.SKGraphics.GetPathCacheStatistics().RetainedBytes,80);b.GetPoints();assert.equal(S.SKGraphics.GetPathCacheStatistics().EntryCount,1);
  a.GetPoints();assert.equal(S.SKGraphics.GetPathCacheStatistics().RetainedBytes,80);S.SKGraphics.SetPathCacheLimit(0);assert.equal(S.SKGraphics.GetPathCacheStatistics().EntryCount,0);assert.equal(a.GetPoints().length,2);
  S.SKGraphics.SetPathCacheLimit(100);a.GetPoints();S.SKGraphics.PurgeAllCaches();assert.equal(S.SKGraphics.GetPathCacheStatistics().RetainedBytes,0);
 }finally{S.SKGraphics.SetPathCacheLimit(old);}
}));
test('path query output overloads keep zero padding, full count, and transactional bounds checking',()=>scoped(o=>{
 const p=o(new S.SKPath().MoveTo(1,2).LineTo(3,4)),out=[null];assert.equal(p.GetPoints(out),2);assert.deepEqual(out[0].ToArray(),[1,2]);
 assert.deepEqual(p.GetPoints(4).map(v=>v.ToArray()),[[1,2],[3,4],[0,0],[0,0]]);assert.throws(()=>p.GetPoint(-1),RangeError);assert.throws(()=>p.GetPoints(-1),RangeError);assert.throws(()=>p.GetPoints(out,2),RangeError);
}));

test('checked SKData sizes and byte lengths preserve view offsets and deep-copy boundaries',()=>{
 const input=new Uint16Array([0x0102,0x0304,0x0506]),d=S.SKData.CreateCopy(new Uint8Array(input.buffer,2,4),3n);
 try{assert.deepEqual([...d.AsSpan()],[4,3,6]);input[1]=0;assert.equal(d.AsSpan()[0],4);d.Span[0]=9;assert.equal(d.AsSpan()[0],9);const copy=d.ToArray();copy[0]=0;assert.equal(d.AsSpan()[0],9);}finally{d.Dispose();}
 for(const n of [-1,1.5,Infinity,NaN,1n<<53n])assert.throws(()=>S.SKData.Create(n),RangeError);
 assert.throws(()=>S.SKData.CreateCopy([1],2),RangeError);assert.throws(()=>S.SKData.Create(4096,4),/pointer/);
 const zero=S.SKData.Create(5n);assert.deepEqual([...zero.AsSpan()],[0,0,0,0,0]);zero.Dispose();
});
test('borrowed data and nested subsets release exactly once after the last retained view',()=>{
 const source=new Uint8Array([1,2,3,4]);let calls=0;const context={};
 const root=S.SKData.Create(source,4,(p,c)=>{assert.equal(p,source);assert.equal(c,context);calls++;},context),a=root.Subset(1n,3n),b=a.Subset(1,1),alias=S.SKData.Create(root,2);
 root.Dispose();assert.equal(calls,0);source[2]=9;assert.equal(b.Span[0],9);a.Dispose();b.Dispose();assert.equal(calls,0);alias.Dispose();alias.Dispose();assert.equal(calls,1);
});
test('stream views retain bytes after data disposal and honor streamDisposesData',()=>{
 let released=0;const data=S.SKData.Create(new Uint8Array([3,4]),2,()=>released++),stream=data.AsStream();data.Dispose();assert.equal(released,0);assert.deepEqual([...stream.ReadToEnd()],[3,4]);stream.Dispose();assert.equal(released,1);
 const other=S.SKData.CreateCopy([7]),owning=other.AsStream(true);owning.Dispose();assert(other.IsDisposed);
});
test('release callbacks remain once-only even when they throw or aliases add callbacks',()=>{
 const events=[],a=S.SKData.Create(new Uint8Array(1),1,()=>events.push('root')),b=S.SKData.Create(a,1,()=>events.push('alias'));a.Dispose();assert.deepEqual(events,[]);b.Dispose();assert.deepEqual(events,['alias','root']);
 const d=S.SKData.Create(new Uint8Array(1),1,()=>{throw Error('release');});assert.throws(()=>d.Dispose(),/release/);assert(d.IsDisposed);d.Dispose();
});
test('SKData stream factories handle short reads, declared-length EOF and nonseekable streams',()=>{
 let position=0;const src={CanSeek:true,Length:7,Position:1,Read(dst,offset,count){const n=Math.min(count,2,6-position);for(let i=0;i<n;i++)dst[offset+i]=++position;return n;}};
 const d=S.SKData.Create(src);assert.deepEqual([...d.AsSpan()],[1,2,3,4,5,6]);d.Dispose();
 const native=new S.SKMemoryStream(new Uint8Array([1,2,3]));native.Read(1);assert.equal(S.SKData.Create(native),null);native.Rewind();const full=S.SKData.Create(native,3n);assert.equal(full.Size,3);full.Dispose();native.Dispose();
 position=0;const unknown={Read(dst,offset,count){if(position++===0){dst.set([1,2],offset);return 2;}return 0;}};
 const streamed=S.SKData.Create(unknown);assert.deepEqual([...streamed.AsSpan()],[1,2]);streamed.Dispose();
 for(const bad of [-1,NaN,1.5,10])assert.throws(()=>S.SKData.Create({Read(){return bad;}},4),/byte count/);
});
test('packed UInt32 distinguishes encoded zero, truncation, and EOF for all marker lengths',()=>{
 const w=new S.SKDynamicMemoryWStream();try{for(const value of [0,1,253,254,65535,65536,4294967295])w.WritePackedUInt32(value);const r=w.DetachAsStream();try{for(const value of [0,1,253,254,65535,65536,4294967295]){const box={};assert(r.ReadPackedUInt32(box));assert.equal(box.Value,value);}const empty={Value:99};assert.equal(r.ReadPackedUInt32(empty),false);assert.equal(empty.Value,0);}finally{r.Dispose();}}finally{w.Dispose();}
 for(const bytes of [[254],[254,1],[255],[255,1,2,3]]){const s=new S.SKMemoryStream(new Uint8Array(bytes)),box={};try{assert.equal(s.ReadPackedUInt32(box),false);}finally{s.Dispose();}}
});
test('writer materialization makes one full-size copy and detaching preserves data ownership',()=>{
 const w=new S.SKDynamicMemoryWStream();w.Write(new Uint8Array([1,2]));w.Write(new Uint8Array([3]));const before=S.SKData.GetCopyStatistics(),d=w.CopyToData(),after=S.SKData.GetCopyStatistics();
 assert.equal(after.Allocations-before.Allocations,1);assert.equal(after.CopiedBytes-before.CopiedBytes,3);w.Reset();assert.deepEqual([...d.AsSpan()],[1,2,3]);d.Dispose();w.Write(new Uint8Array([4,5]));const s=w.DetachAsStream();w.Dispose();assert.deepEqual([...s.ReadToEnd()],[4,5]);s.Dispose();
});
test('SaveTo chunks bytes and rejects failed writes without disposing caller data',()=>{
 const d=S.SKData.Create(200000),parts=[];try{assert(d.SaveTo({Write(bytes,n){assert.equal(n,bytes.length);parts.push(bytes);}}));assert.deepEqual(parts.map(p=>p.length),[81920,81920,36160]);assert.equal(parts[0].buffer,d.Span.buffer);assert.throws(()=>d.SaveTo({Write(){return false;}}),/rejected/);assert(!d.IsDisposed);}finally{d.Dispose();}
});
test('SaveToAsync retains data across awaits and releases writer locks and callbacks',async()=>{
 let resume,released=0;const d=S.SKData.Create(new Uint8Array(90000),90000,()=>released++),parts=[];
 const stream=new WritableStream({write(chunk){parts.push(chunk.length);if(parts.length===1)return new Promise(r=>resume=r);}});
 const pending=d.SaveToAsync(stream);await new Promise(r=>setTimeout(r,0));d.Dispose();assert.equal(released,0);resume();await pending;assert.equal(released,1);assert.deepEqual(parts,[81920,8080]);assert.equal(stream.locked,false);
});
test('SaveToAsync never leaks retained buffers on lock acquisition failure or cancellation',async()=>{
 let released=0;const d=S.SKData.Create(new Uint8Array(90000),90000,()=>released++),controller=new AbortController();
 await assert.rejects(d.SaveToAsync({getWriter(){throw Error('locked');}}),/locked/);
 let writes=0;await assert.rejects(d.SaveToAsync({async write(){writes++;controller.abort();}},{signal:controller.signal}),/abort/i);assert.equal(writes,1);d.Dispose();assert.equal(released,1);
});
test('ReadableStream data import owns chunks, enforces size and releases locks on errors',async()=>{
 const source=new Uint8Array([1,2]),stream=new ReadableStream({start(c){c.enqueue(source);c.enqueue(new Uint8Array([3]));c.close();}}),data=await S.SKData.FromReadableStream(stream);source.fill(0);assert.deepEqual([...data.AsSpan()],[1,2,3]);assert.equal(stream.locked,false);data.Dispose();
 const bounded=new ReadableStream({start(c){c.enqueue(new Uint8Array([7,8]));c.close();}}),big=await S.SKData.FromReadableStream(bounded,{maxBytes:2n});try{assert.deepEqual([...big.Span],[7,8]);}finally{big.Dispose();}assert.equal(bounded.locked,false);
 let cancelled=0;const oversized=new ReadableStream({start(c){c.enqueue(new Uint8Array(4));},cancel(){cancelled++;}});await assert.rejects(S.SKData.FromReadableStream(oversized,{maxBytes:3}),/limit/);assert.equal(cancelled,1);assert.equal(oversized.locked,false);
});

test('linear-band region Boolean sweep matches an independent occupancy oracle for all six operations',()=>{
 let seed=0x13579bdf;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const rectangle=()=>{const x=rnd()%16-8,y=rnd()%16-8;return new S.SKRectI(x,y,x+1+rnd()%6,y+1+rnd()%6);};
 const within=(r,x,y)=>x>=r.Left&&x<r.Right&&y>=r.Top&&y<r.Bottom;
 for(let sample=0;sample<60;sample++){
  const ar=Array.from({length:8},rectangle),br=Array.from({length:8},rectangle),a=new S.SKRegion(),b=new S.SKRegion();a.SetRects(ar);b.SetRects(br);
  try{let intersection=false;
   for(let op=0;op<6;op++){
    const c=a.Clone();try{c.Op(b,op);
     for(let y=-9;y<=14;y++)for(let x=-9;x<=14;x++){
      const aa=ar.some(r=>within(r,x,y)),bb=br.some(r=>within(r,x,y));intersection||=aa&&bb;
      const expected=[aa&&!bb,aa&&bb,aa||bb,aa!==bb,bb&&!aa,bb][op];assert.equal(c.Contains(x,y),expected,`case ${sample} op ${op} at ${x},${y}`);
     }
    }finally{c.Dispose();}
   }
   assert.equal(a.Intersects(b),intersection);
  }finally{a.Dispose();b.Dispose();}
 }
});
test('balanced SetRects equals sequential unions, handles iterable inputs and rolls back invalid coordinates',()=>{
 const r=new S.SKRegion(),sequential=new S.SKRegion();const rectangles=Array.from({length:257},(_,i)=>new S.SKRectI(i%17,Math.floor(i/17)*3,i%17+3,Math.floor(i/17)*3+2));
 try{for(const rect of rectangles)sequential.Op(rect,S.SKRegionOperation.Union);r.SetRects((function*(){yield*rectangles;})());assert(r.Equals(sequential));
  assert.throws(()=>r.SetRects([new S.SKRectI(0,0,1,1),[0,0,Infinity,2]]),RangeError);assert(r.Equals(sequential));
  const edge=new S.SKRegion(new S.SKRectI(100,0,101,2));try{assert.equal(r.Intersects(edge),false);assert.equal(r.Intersects(new S.SKRectI(0,2,20,3)),false);}finally{edge.Dispose();}
  assert.equal(r.SetRects([]),false);assert(r.IsEmpty);
 }finally{r.Dispose();sequential.Dispose();}
});

test('numeric, named and boxed paint enums produce identical actual geometry and pixels',()=>scoped(o=>{
 const src=o(new S.SKPath().MoveTo(6,7).LineTo(20,30).LineTo(37,9));
 for(const style of ['Fill','Stroke','StrokeAndFill'])for(const cap of ['Butt','Round','Square'])for(const join of ['Miter','Round','Bevel']){
  const options={StrokeWidth:5,Color:S.SKColors.Red};
  const paints=[
   o(new S.SKPaint({...options,Style:S.SKPaintStyle[style],StrokeCap:S.SKStrokeCap[cap],StrokeJoin:S.SKStrokeJoin[join]})),
   o(new S.SKPaint({...options,Style:S.SKPaintStyle[style].value,StrokeCap:S.SKStrokeCap[cap].value,StrokeJoin:S.SKStrokeJoin[join].value})),
   o(new S.SKPaint({...options,Style:style,StrokeCap:cap,StrokeJoin:join}))
  ];
  const results=paints.map(p=>o(p.GetFillPath(src)));assert.deepEqual(values(results[0]),values(results[1]));assert.deepEqual(values(results[0]),values(results[2]));
  assert.equal(paints[1].Style,paints[0].Style);assert.equal(paints[1].StrokeCap,paints[0].StrokeCap);
 }
 const a=o(S.SKSurface.Create(new S.SKImageInfo(16,16))),b=o(S.SKSurface.Create(new S.SKImageInfo(16,16)));
 for(const name of Object.keys(S.SKBlendMode).filter(n=>Number.isInteger(S.SKBlendMode[n]?.value))){
  const mode=S.SKBlendMode[name],p=o(new S.SKPaint({Color:S.SKColors.Red.WithAlpha(128),BlendMode:mode})),q=o(new S.SKPaint({Color:S.SKColors.Red.WithAlpha(128),BlendMode:mode.value}));
  for(const [surface,paint] of [[a,p],[b,q]]){surface.Canvas.Clear(S.SKColors.Blue);surface.Canvas.DrawRect(0,0,16,16,paint);}
  const x=o(a.Snapshot()),y=o(b.Snapshot());assert.deepEqual(x.ReadPixels(),y.ReadPixels(),name);
 }
}));
test('invalid paint enum assignment rejects before mutating managed or native state',()=>scoped(o=>{
 const p=o(new S.SKPaint({Style:1,StrokeCap:2,StrokeJoin:1,BlendMode:3}));
 for(const [field,expected]of [['Style',p.Style],['StrokeCap',p.StrokeCap],['StrokeJoin',p.StrokeJoin],['BlendMode',p.BlendMode]]){
  for(const bad of [-1,1000,1.5,NaN,'Bogus',{},null]){assert.throws(()=>{p[field]=bad;},typeof bad==='string'?TypeError:RangeError);assert.equal(p[field],expected);}
 }
 const copy=o(p.Clone());assert.equal(copy.Style,p.Style);assert.equal(copy.StrokeCap,p.StrokeCap);
}));

test('one-byte stream chunks are coalesced into bounded staging allocations',async()=>{
 const count=10000;let position=0;
 const before=S.SKData.GetCopyStatistics();
 const data=S.SKData.Create({Read(dst,offset){if(position===count)return 0;dst[offset]=position++%251;return 1;}});
 try{assert.equal(data.Size,count);assert(data.Span.every((value,i)=>value===i%251));const after=S.SKData.GetCopyStatistics();assert.equal(after.Allocations-before.Allocations,2);assert.equal(after.StreamReadCalls-before.StreamReadCalls,count+1);}finally{data.Dispose();}
 position=0;const recycled=new Uint8Array(1),stream=new ReadableStream({pull(controller){if(position===count){controller.close();return;}recycled[0]=position++%251;controller.enqueue(recycled);}});
 const first=S.SKData.GetCopyStatistics(),received=await S.SKData.FromReadableStream(stream,{maxBytes:count});
 try{assert.equal(received.Size,count);assert(received.Span.every((value,i)=>value===i%251));assert.equal(S.SKData.GetCopyStatistics().Allocations-first.Allocations,2);}finally{received.Dispose();}
});
