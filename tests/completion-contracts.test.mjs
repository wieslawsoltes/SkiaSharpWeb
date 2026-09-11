import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Initialize} from '../dist/lib/index.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,isolated:true,fonts:false});
const asArray=p=>p.ToArray();

test('descriptor defaults, high UInt64 values, nested value-copy, equality and JSON',()=>{
 const a=new S.GRVkAlloc({Memory:0xffffffffffffffffn,Offset:1n<<60n,Size:4096,Flags:4294967295});
 const image=new S.GRVkImageInfo({Image:9007199254740993n,Alloc:a});
 a.Size=8192;assert.equal(image.Alloc.Size,4096n);
 const nested=image.Alloc;nested.Size=1;assert.equal(image.Alloc.Size,4096n);
 image.Alloc=nested;assert.equal(image.Alloc.Size,1n);
 const clone=image.Clone();assert(image.Equals(clone));assert.equal(image.GetHashCode(),clone.GetHashCode());
 assert.equal(image.SampleCount,0);assert.equal(image.Protected,false);assert.equal(image.YcbcrConversionInfo.Components.R,0);
 clone.Protected=true;assert(!image.Equals(clone));assert(!image.Equals(image.toJSON()));
 const restored=S.GRVkImageInfo.FromJSON(JSON.stringify(image));assert(restored.Equals(image));
 assert.equal(restored.Image,9007199254740993n);assert(S.GRVkImageInfo.op_Equality(image,restored));
 for(const value of [-1,1.5,Number.MAX_SAFE_INTEGER+1,1n<<64n])assert.throws(()=>{a.Memory=value;},RangeError);
 assert.throws(()=>{a.Flags=4294967296;},RangeError);assert.throws(()=>{image.Protected=1;},TypeError);
 assert.throws(()=>S.GRVkAlloc.FromJSON('{"Offset":"18446744073709551616"}'),RangeError);
});
test('Vulkan YCbCr and Graphite descriptors preserve all scalar fields without pretending to import devices',()=>{
 const y=new S.GRVkYcbcrConversionInfo({Format:37,ExternalFormat:1n<<63n,YcbcrModel:3,YcbcrRange:1,XChromaOffset:1,YChromaOffset:0,ChromaFilter:1,ForceExplicitReconstruction:1,Components:{R:4,G:5,B:6,A:3},SamplerFilterMustMatchChromaFilter:true,SupportsLinearFilter:true});
 const legacy=new S.GrVkYcbcrConversionInfo(y);legacy.FormatFeatures=100;assert.equal(legacy.FormatFeatures,0);assert(legacy.ToCurrent().Equals(y));
 const copied=y.Components;copied.R=99;assert.equal(y.Components.R,4);
 const texture=new S.SKGraphiteVkTextureInfo({SampleCount:4,Mipmapped:true,Flags:1,Format:-1,ImageTiling:1,ImageUsageFlags:16,SharingMode:0,AspectMask:1});
 assert(texture.Clone().Equals(texture));assert(S.SKGraphiteVkTextureInfo.FromJSON(JSON.stringify(texture)).Equals(texture));
 assert.equal(S.SKGraphiteVkTextureInfo.InteropKind,'value-descriptor-only');
 assert.throws(()=>S.GRContext.CreateVulkan({}),/process-local/);
});
test('path measure failed convenience calls return empty values and out calls retain destinations',()=>{
 const m=new S.SKPathMeasure(),p=new S.SKPoint(7,9),t=new S.SKPoint(3,4),matrix=S.SKMatrix.CreateScale(2,3);
 try{assert.deepEqual(asArray(m.GetPosition(0)),[0,0]);assert.deepEqual(asArray(m.GetTangent(0)),[0,0]);assert.deepEqual(m.GetMatrix(0,3).Values,new Array(9).fill(0));assert.equal(m.GetPositionAndTangent(0,p,t),false);assert.deepEqual(asArray(p),[7,9]);assert.deepEqual(asArray(t),[3,4]);assert.equal(m.GetMatrix(0,matrix,3),false);assert.equal(matrix.ScaleX,2);}finally{m.Dispose();}
});
test('path measure clamps infinities, handles NaN, contour lifetime, and all matrix flag variants',()=>{
 const p=new S.SKPath().MoveTo(10,20).LineTo(40,60).MoveTo(1,2).LineTo(1,7),m=new S.SKPathMeasure(p);p.Dispose();
 try{
  assert.equal(m.Length,50);assert.deepEqual(asArray(m.GetPosition(-Infinity)),[10,20]);assert.deepEqual(asArray(m.GetPosition(Infinity)),[40,60]);
  assert.deepEqual(asArray(m.GetPosition(NaN)),[0,0]);const pos=new S.SKPoint(),tan=new S.SKPoint();assert(m.GetPositionAndTangent(25,pos,tan));assert.deepEqual(asArray(pos),[25,40]);
  for(let flag=0;flag<4;flag++){const a=m.GetMatrix(25,flag),b=new S.SKMatrix();assert(m.GetMatrix(25,b,flag));assert.deepEqual(a.Values,b.Values);assert.equal(a.TransX,flag&1?25:0);assert(Math.abs(a.ScaleX-(flag&2?.6:1))<1e-6);}
  assert(m.NextContour());assert.equal(m.Length,5);assert(!m.NextContour());assert.equal(m.Length,0);m.SetPath(null);assert.equal(m.IsClosed,false);
 }finally{m.Dispose();}
});
test('path and builder segment overloads respectively replace and append; failures are transactional',()=>{
 const source=new S.SKPath().MoveTo(10,10).LineTo(100,10),m=new S.SKPathMeasure(source),dst=new S.SKPath().AddCircle(300,300,20),builder=new S.SKPathBuilder().MoveTo(1,1);
 try{
  assert(m.GetSegment(10,40,dst,true));assert.deepEqual(dst.Points.map(asArray),[[20,10],[50,10]]);
  assert(m.GetSegment(10,40,builder,false));assert.deepEqual(builder.Points.map(asArray),[[1,1],[50,10]]);
  const old=dst.ToSvgPathData();assert.equal(m.GetSegment(50,40,dst,true),false);assert.equal(dst.ToSvgPathData(),old);
  assert.throws(()=>m.GetSegment(1,2,null,true),TypeError);const segment=m.GetSegment(-Infinity,Infinity,true);assert(segment);assert.deepEqual(segment.Points.map(asArray),[[10,10],[100,10]]);segment.Dispose();
 }finally{source.Dispose();m.Dispose();dst.Dispose();builder.Dispose();}
});
test('opacity scans inspect alpha bits even when metadata says opaque and ignore row padding',()=>{
 const bytes=new Uint8Array([1,2,3,255,4,5,6,255,0,0,0,0,7,8,9,255,0,1,2,255]);
 const p=new S.SKPixmap(new S.SKImageInfo(2,2,K.ColorType.RGBA_8888,K.AlphaType.Opaque),bytes,12);
 try{assert(p.ComputeIsOpaque());bytes[19]=128;assert.equal(p.ComputeIsOpaque(),false);assert.equal(p.GetPixelAlpha(1,1),Math.fround(128*Math.fround(1/255)));assert.equal(p.GetPixelColorF(1,1).Alpha,Math.fround(128*Math.fround(1/255)));assert.throws(()=>p.GetPixelAlpha(2,0),RangeError);}finally{p.Dispose();}
});
test('opacity scans preserve native floating-point threshold behavior without RGBA8 clamping',()=>{
 const bytes=new Float32Array([.1,.2,.3,2]),p=new S.SKPixmap(new S.SKImageInfo(1,1,K.ColorType.RGBA_F32,K.AlphaType.Unpremul),bytes);
 try{assert.equal(p.GetPixelAlpha(0,0),2);assert(p.ComputeIsOpaque());bytes[3]=.99999;assert(!p.ComputeIsOpaque());bytes[3]=NaN;assert(p.ComputeIsOpaque());assert(Number.isNaN(p.GetPixelAlpha(0,0)));}finally{p.Dispose();}
 const bits=new Uint16Array([0,0,0,0x4000]),half=new S.SKPixmap(new S.SKImageInfo(1,1,K.ColorType.RGBA_F16),bits);try{assert(half.ComputeIsOpaque());assert.equal(half.GetPixelAlpha(0,0),2);bits[3]=0x3bff;assert(!half.ComputeIsOpaque());}finally{half.Dispose();}
});
test('all pixel alpha encodings have direct storage scans, including packed 10-bit and 16-bit formats',()=>{
 const samples=[['Alpha8',1,255],['Argb4444',2,0xf123],['Bgra1010102',4,0xc0123456],['Bgra10101010XR',8,894<<6],['Rgba10x6',8,0xffc1],['Alpha16',2,65535],['Rgba16161616',8,65535]];
 for(const [type,bpp,alpha]of samples){const bytes=new Uint8Array(bpp),dv=new DataView(bytes.buffer);if(bpp===1)bytes[0]=alpha;else if(bpp===4)dv.setUint32(0,alpha,true);else dv.setUint16(bpp===8?6:0,alpha,true);const p=new S.SKPixmap(new S.SKImageInfo(1,1,S.SKColorType[type],K.AlphaType.Unpremul),bytes);try{assert(p.ComputeIsOpaque(),type);bytes.fill(0);assert.equal(p.ComputeIsOpaque(),false,type);}finally{p.Dispose();}}
});
test('document abort and failed output are terminal, with no successful ToData or repeated writes',()=>{
 const aborted=S.SKDocument.CreatePdf();aborted.BeginPage(20,20);aborted.Abort();assert.throws(()=>aborted.Close(),/aborted/);assert.throws(()=>aborted.ToData(),/aborted/);aborted.Dispose();
 let calls=0;const doc=S.SKDocument.CreatePdf({Write(){calls++;return false;}});doc.BeginPage(20,20);assert.throws(()=>doc.Close(),/rejected/);assert.throws(()=>doc.ToData(),/rejected/);assert.equal(calls,1);doc.Dispose();
 for(const metadata of [{DiagnosticsLimit:-1},{DiagnosticsLimit:65537},{CompressionLevel:8},{EncodingQuality:102},{RasterDpi:0}])assert.throws(()=>S.SKDocument.CreatePdf(metadata),RangeError);
});
