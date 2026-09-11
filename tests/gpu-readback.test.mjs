import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Initialize} from '../dist/lib/index.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
function deviceHarness(bytes=new Uint8Array(1024)) {
 const made=[],copies=[];let fail=false;
 const device={limits:{maxBufferSize:1024*1024},queue:{submit(){},async onSubmittedWorkDone(){}},
  createBuffer(descriptor){const b={descriptor,destroyed:0,maps:0,async mapAsync(){this.maps++;if(fail)throw Error('map failed');},getMappedRange(){return bytes.buffer;},unmap(){},destroy(){this.destroyed++;}};made.push(b);return b;},
  createCommandEncoder(){return{copyTextureToBuffer(...args){copies.push(args);},finish(){return{};}};}};
 return {device,made,copies,fail:()=>{fail=true;}};
}
const texture=(format='rgba8unorm',width=2,height=2)=>({format,width,height,usage:1,sampleCount:1,dimension:'2d'});
test('all uncompressed color formats preserve packed bytes and exact row stride',async()=>{
 for(const format of S.GPUReadbackFormats){
  const h=deviceHarness();const r=await S.ReadWebGPUTexture(h.device,texture(format),{swizzle:false});
  assert.equal(r.GetData().length,4*r.BytesPerPixel,format);assert.equal(r.RowBytes,2*r.BytesPerPixel);assert.equal(r.DataFormat,format);
  assert.equal(h.made[0].destroyed,1);r.Dispose();
 }
 assert(S.GPUReadbackFormats.includes('rgba32float'));assert(S.GPUReadbackFormats.includes('rgba16float'));
});
test('F32 and F16 texture readback retain HDR, negative, fractional and alpha components',async()=>{
 const bits=new Uint8Array(512),floats=new Float32Array(bits.buffer);
 floats.set([2.5,-.25,.1234567,1,5,6,7,.5]);floats.set([10,11,12,1,13,14,15,.75],64);
 let h=deviceHarness(bits),r=await S.ReadWebGPUTexture(h.device,texture('rgba32float'));
 assert.deepEqual([...r.GetPixelSpan(Float32Array)],[...floats.slice(0,8),...floats.slice(64,72)]);
 assert.equal(r.Info.ColorType,K.ColorType.RGBA_F32);r.Dispose();
 const halfs=new Uint16Array(bits.buffer);halfs.fill(0);halfs.set([0x4000,0xbc00,0x3800,0x3c00]);
 h=deviceHarness(bits);r=await S.ReadWebGPUTexture(h.device,texture('rgba16float'));
 assert.deepEqual([...r.GetPixelSpan(Uint16Array).slice(0,4)],[0x4000,0xbc00,0x3800,0x3c00]);
 const image=r.ToImage();assert(image);image.Dispose();r.Dispose();
});
test('raw integer formats cannot masquerade as RGBA images',async()=>{
 const h=deviceHarness(),r=await S.ReadWebGPUTexture(h.device,texture('r16uint'));
 assert.equal(r.GetPixelSpan(Uint16Array).length,4);assert.throws(()=>r.ToImage(),/no matching/);
 assert.throws(()=>r.GetPixelSpan(DataView),TypeError);r.Dispose();assert.throws(()=>r.GetPixelSpan(),/disposed/);
});
test('readback derives mip dimensions, respects array layers and rejects format reinterpretation',async()=>{
 const h=deviceHarness(),t={...texture('rgba8unorm',8,8),mipLevelCount:3,depthOrArrayLayers:2};
 const r=await S.ReadWebGPUTexture(h.device,t,{mipLevel:2,layer:1});
 assert.equal(r.Width,2);assert.equal(r.Height,2);assert.equal(h.copies[0][0].origin.z,1);r.Dispose();
 await assert.rejects(S.ReadWebGPUTexture(h.device,t,{format:'rgba16float'}),/reinterpret/);
 await assert.rejects(S.ReadWebGPUTexture(h.device,t,{mipLevel:3}),/outside/);
 await assert.rejects(S.ReadWebGPUTexture(h.device,{...t,sampleCount:4}),/multisampled/);
 await assert.rejects(S.ReadWebGPUTexture(h.device,{...t,dimension:'3d'}),/2D/);
 await assert.rejects(S.ReadWebGPUTexture(h.device,{...t,usage:4}),/COPY_SRC/);
 await assert.rejects(S.ReadWebGPUTexture(h.device,t,{layer:2}),/outside/);
});
test('bounded readback pool reuses staging memory, keeps returned pixels independent and cleans up',async()=>{
 const h=deviceHarness(),pool=new S.SKGPUReadbackPool(h.device,{Capacity:1,MaxBytes:512}),t=texture();
 for(let i=0;i<20;i++){const r=await S.ReadWebGPUTexture(h.device,t,{pool});r.GetData().fill(i);r.Dispose();}
 assert.equal(h.made.length,1);assert.equal(pool.GetStatistics().Reuses,19);assert.equal(pool.GetStatistics().IdleBytes,512);
 pool.Dispose();pool.Dispose();assert.equal(h.made[0].destroyed,1);
 await assert.rejects(S.ReadWebGPUTexture(h.device,t,{pool}),/disposed/);
});
test('concurrent readbacks cannot reuse active staging storage; failures never reenter the pool',async()=>{
 const h=deviceHarness(),pool=new S.SKGPUReadbackPool(h.device,{Capacity:1,MaxBytes:512});
 const results=await Promise.all([S.ReadWebGPUTexture(h.device,texture(),{pool}),S.ReadWebGPUTexture(h.device,texture(),{pool})]);
 assert.equal(h.made.length,2);assert.equal(pool.GetStatistics().PeakActive,2);assert.equal(h.made.filter(x=>x.destroyed).length,1);results.forEach(r=>r.Dispose());
 h.fail();await assert.rejects(S.ReadWebGPUTexture(h.device,texture(),{pool}),/map failed/);
 assert.equal(pool.GetStatistics().IdleBuffers,0);assert.equal(pool.GetStatistics().Active,0);pool.Dispose();
});
test('readback validates allocation limits and foreign pools before creating GPU resources',async()=>{
 const a=deviceHarness(),b=deviceHarness(),pool=new S.SKGPUReadbackPool(b.device);
 await assert.rejects(S.ReadWebGPUTexture(a.device,texture(),{pool}),/same GPUDevice/);
 await assert.rejects(S.ReadWebGPUTexture(a.device,texture('rgba32float',10000,10000)),/allocation limit/);
 assert.equal(a.made.length,0);pool.Dispose();
});
function contextHarness(){
 let callback,calls=[],result=new Uint8Array(64);
 const native={submit(boundary,frame){calls.push(['submit',boundary,frame]);return true;},checkAsyncWorkCompletion(){calls.push(['check']);callback?.(result);callback=null;},readPixels(surface,info,rect,gamma,mode,done){calls.push(['read',info,rect,gamma,mode]);callback=done;},hasUnfinishedGpuWork(){return false;},delete(){}};
 const context=new S.SKGraphiteContext(native);context._children=new Set();context.Device={queue:{async onSubmittedWorkDone(){}}};
 const surface={_native:{},Width:4,Height:4,GraphiteContext:context,ThrowIfDisposed(){},Flush(){}};
 return {context,surface,calls,setResult:bytes=>{result=bytes;}};
}
test('SubmitAsync fulfills Sync=true through an asynchronous fence without mutating the record',async()=>{
 const h=contextHarness(),info=new S.SKGraphiteSubmitInfo({Sync:true,MarkBoundary:true,FrameID:12n});
 assert.equal(await h.context.SubmitAsync(info),true);assert.equal(info.Sync,true);assert.equal(info.FrameID,12n);
 assert.deepEqual(h.calls,[['submit',true,12],['check']]);
 assert.throws(()=>h.context.Submit(info),/cannot block/);
 assert.throws(()=>h.context.Submit({FrameID:9007199254740993n}),/integer/);h.context.Dispose();
});
test('Graphite readback preserves F32 pixels and rescale enums through native callbacks',async()=>{
 const h=contextHarness(),pixels=new Float32Array([2,-1,.125,1,4,.5,.75,.25,6,7,8,1,9,10,11,1]);h.setResult(new Uint8Array(pixels.buffer));
 let calls=0;const result=await h.context.RequestReadPixels(h.surface,new S.SKImageInfo(2,2,K.ColorType.RGBA_F32,K.AlphaType.Unpremul),new S.SKRectI(0,0,4,4),'Linear','RepeatedCubic',r=>{calls++;assert(r);});
 assert.deepEqual([...result.GetPixelSpan(Float32Array)],[...pixels]);assert.equal(result.RowBytes,32);assert.equal(calls,1);
 const read=h.calls.find(c=>c[0]==='read');assert.equal(read[3],1);assert.equal(read[4],3);result.Dispose();h.context.Dispose();
});
test('Graphite readback validates ownership, enums, source bounds and native byte counts',async()=>{
 const h=contextHarness(),info=new S.SKImageInfo(2,2,K.ColorType.RGBA_F32),rect=new S.SKRectI(0,0,4,4);
 await assert.rejects(h.context.RequestReadPixels({...h.surface,GraphiteContext:{}},info,rect,()=>{}),/another/);
 await assert.rejects(h.context.RequestReadPixels(h.surface,info,new S.SKRectI(-1,0,4,4),()=>{}),/inside/);
 await assert.rejects(h.context.RequestReadPixels(h.surface,info,rect,'bad','Linear',()=>{}),/Unknown/);
 h.setResult(new Uint8Array(4));await assert.rejects(h.context.RequestReadPixels(h.surface,info,rect,()=>{}),/byte count/);
 assert.equal(h.context._pendingReadbacks,0);h.context.Dispose();
});
test('pending native readback holds context lifetime; callback exceptions release result ownership',async()=>{
 const h=contextHarness(),info=new S.SKImageInfo(2,2,K.ColorType.RGBA_F32),rect=new S.SKRectI(0,0,4,4);let captured;
 const promise=h.context.RequestReadPixels(h.surface,info,rect,r=>{captured=r;throw Error('consumer');});
 assert.throws(()=>h.context.Dispose(),/pending/);await assert.rejects(promise,/consumer/);assert(captured.IsDisposed);h.context.Dispose();
});
