import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {Initialize,RegisterWebComponent} from '../dist/lib/index.js';
import {createCanvasAPI} from '../dist/lib/canvas.js';

const require=createRequire(import.meta.url);
const init=require('../dist/vendor/canvaskit.cjs');
const K=await init({wasmBinary:readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const A=await Initialize({CanvasKit:K,isolated:true,fonts:[{family:'DejaVu Sans',data:new Uint8Array(readFileSync(new URL('../dist/fonts/DejaVuSans.ttf',import.meta.url)))}]});
const rgbaInfo=(w,h)=>new A.SKImageInfo(w,h,K.ColorType.RGBA_8888,K.AlphaType.Unpremul);
const pixel=(bytes,w,x,y)=>Array.from(bytes.subarray((y*w+x)*4,(y*w+x+1)*4));
const read=surface=>surface.Canvas.ReadPixels(rgbaInfo(surface.Width,surface.Height));
function scope(fn){const objects=[];const own=o=>(objects.push(o),o);try{return fn(own)}finally{for(const o of objects.reverse())o?.Dispose?.()}}
function presenter(){return {pixels:null,primitives:null,disposed:0,presentPixels(data,w,h){this.pixels={data:data.slice(),w,h}},presentPrimitives(commands,w,h){this.primitives={commands,w,h}},dispose(){this.disposed++}}}

test('SKRoundRect object overload draws the rounded shape',()=>scope(own=>{
  const s=own(A.SKSurface.Create(new A.SKImageInfo(40,40))),p=own(new A.SKPaint({Color:A.SKColors.Red}));
  s.Canvas.Clear(A.SKColors.Transparent);
  s.Canvas.DrawRoundRect(new A.SKRoundRect(A.SKRect.Create(4,4,32,32),12,12),p);
  const px=read(s);assert.deepEqual(pixel(px,40,20,20),[255,0,0,255]);assert.equal(pixel(px,40,4,4)[3],0);
}));

test('base clip survives save restore and keeps WebGPU on the clipped raster path',()=>scope(own=>{
  const output=presenter(),s=own(new A.SKSurface(K.MakeSurface(8,8),'webgpu',null,output));
  s.Canvas.ClipRect(A.SKRect.Create(0,0,4,8));const count=s.Canvas.Save();s.Canvas.RestoreToCount(count);s.Canvas.Clear(A.SKColors.Red);s.Flush();
  assert.equal(output.primitives,null);assert(output.pixels);assert.deepEqual(pixel(output.pixels.data,8,2,2),[255,0,0,255]);assert.equal(pixel(output.pixels.data,8,6,2)[3],0);
}));

test('nested clip restoration permits a fresh full-canvas primitive frame',()=>scope(own=>{
  const output=presenter(),s=own(new A.SKSurface(K.MakeSurface(8,8),'webgpu',null,output)),p=own(new A.SKPaint({IsAntialias:true,Color:A.SKColors.Red}));
  s.Canvas.Save();s.Canvas.ClipRect(A.SKRect.Create(0,0,4,8));s.Canvas.Save();s.Canvas.ClipRect(A.SKRect.Create(0,0,2,8));s.Canvas.Restore();s.Canvas.Restore();
  s.Canvas.Clear(A.SKColors.Transparent);s.Canvas.DrawRect(1,1,6,6,p);s.Flush();assert(output.primitives);assert.equal(output.primitives.commands.length,2);
}));

test('paint effect eligibility does not allocate native getter clones',()=>scope(own=>{
  const s=own(A.SKSurface.Create(new A.SKImageInfo(8,8))),shader=own(A.SKShader.CreateColor(A.SKColors.Blue)),p=own(new A.SKPaint({IsAntialias:true,Shader:shader}));
  const native=p._effects.Shader._native,original=native.clone;let clones=0;native.clone=function(...args){clones++;return original.apply(this,args)};
  try{for(let i=0;i<8;i++){s.Canvas.Clear(A.SKColors.Transparent);s.Canvas.DrawRect(0,0,8,8,p)}}finally{native.clone=original}
  assert.equal(clones,0);
}));

test('custom blender and non-antialiased paints use the faithful raster route',()=>scope(own=>{
  const output=presenter(),s=own(new A.SKSurface(K.MakeSurface(8,8),'webgpu',null,output)),p=own(new A.SKPaint({Color:A.SKColors.Red}));
  s.Canvas.Clear(A.SKColors.Transparent);s.Canvas.DrawRect(0,0,8,8,p);s.Flush();assert(output.pixels);assert.equal(output.primitives,null);
  p.IsAntialias=true;p.Blender=own(A.SKBlender.Create(A.SKBlendMode.Src));output.pixels=null;s.Canvas.Clear(A.SKColors.Transparent);s.Canvas.DrawRect(0,0,8,8,p);s.Flush();assert(output.pixels);assert.equal(output.primitives,null);
}));

test('legacy point text overload retains font scale skew and emboldening',()=>scope(own=>{
  const x=own(A.SKSurface.Create(new A.SKImageInfo(200,90))),y=own(A.SKSurface.Create(new A.SKImageInfo(200,90))),p=own(new A.SKPaint({Color:A.SKColors.Red,TextSize:28,TextScaleX:1.3,TextSkewX:.2,FakeBoldText:true})),font=own(p.ToFont());
  x.Canvas.DrawText('Ideas',new A.SKPoint(10,50),p);y.Canvas.DrawText('Ideas',10,50,font,p);assert.deepEqual(read(x),read(y));
}));

test('named legacy Center and Right alignment match their measured anchors',()=>scope(own=>{
  for(const [alignment,factor]of [[A.SKTextAlign.Center,.5],[A.SKTextAlign.Right,1]]){
    const x=own(A.SKSurface.Create(new A.SKImageInfo(220,80))),y=own(A.SKSurface.Create(new A.SKImageInfo(220,80))),p=own(new A.SKPaint({Color:A.SKColors.Blue,TextSize:25,TextAlign:alignment})),font=own(p.ToFont());
    x.Canvas.DrawText('Anchor',120,50,p);y.Canvas.DrawText('Anchor',120-font.MeasureText('Anchor')*factor,50,font,p);assert.deepEqual(read(x),read(y));
  }
}));

test('shaped text honors paint color and lowercase width options',()=>scope(own=>{
  const s=own(A.SKSurface.Create(new A.SKImageInfo(300,150))),font=own(new A.SKFont(null,24)),p=own(new A.SKPaint({Color:A.SKColors.Red}));
  s.Canvas.DrawShapedText('alpha beta gamma delta',2,35,font,p,{width:50});const px=read(s);let red=0,black=0,maxX=0;
  for(let i=0;i<px.length;i+=4)if(px[i+3]){if(px[i]>128)red++;if(px[i]===0&&px[i+1]===0&&px[i+2]===0)black++;maxX=Math.max(maxX,(i/4)%300)}
  assert(red>50);assert.equal(black,0);assert(maxX<=52);
}));

test('recording canvas expires while serialized picture replay preserves pixels',()=>scope(own=>{
  const recorder=own(new A.SKPictureRecorder()),paint=own(new A.SKPaint({Color:A.SKColors.Blue})),canvas=recorder.BeginRecording(A.SKRect.Create(30,30));canvas.DrawCircle(15,15,10,paint);
  const picture=own(recorder.EndRecording());assert.throws(()=>canvas.DrawCircle(0,0,1,paint),/recording|valid/i);recorder.Dispose();
  const data=own(picture.Serialize()),copy=own(A.SKPicture.Deserialize(data)),x=own(A.SKSurface.Create(new A.SKImageInfo(30,30))),y=own(A.SKSurface.Create(new A.SKImageInfo(30,30)));x.Canvas.DrawPicture(picture);y.Canvas.DrawPicture(copy);assert.deepEqual(read(x),read(y));assert(data.Size>20);
}));

test('snapshot remains readable after the originating surface is disposed',()=>scope(own=>{
  const s=own(A.SKSurface.Create(new A.SKImageInfo(6,6)));s.Canvas.Clear(A.SKColors.Green);const image=own(s.Snapshot());s.Dispose();const bytes=image._native.readPixels(0,0,{width:6,height:6,colorType:K.ColorType.RGBA_8888,alphaType:K.AlphaType.Unpremul,colorSpace:K.ColorSpace.SRGB});assert.deepEqual(pixel(bytes,6,3,3),[0,128,0,255]);assert.throws(()=>s.Canvas.Clear(A.SKColors.Red),/disposed/i);
}));

test('deferred primitives materialize exactly once for snapshots and complex draws',()=>scope(own=>{
  const output=presenter(),gpu=own(new A.SKSurface(K.MakeSurface(50,40),'webgpu',null,output)),cpu=own(A.SKSurface.Create(new A.SKImageInfo(50,40,K.ColorType.RGBA_8888,K.AlphaType.Unpremul,K.ColorSpace.SRGB))),p=own(new A.SKPaint({Color:A.SKColors.Red.WithAlpha(128),IsAntialias:true}));
  for(const s of [gpu,cpu]){s.Canvas.Clear(A.SKColors.White);s.Canvas.DrawRect(5,5,20,20,p)}
  const image=own(gpu.Snapshot());assert.deepEqual(read(gpu),read(cpu));assert.deepEqual(read(gpu),read(cpu));
  p.Color=A.SKColors.Blue.WithAlpha(128);
  for(const s of [gpu,cpu]){s.Canvas.DrawCircle(22,20,10,p);s.Canvas.Save();s.Canvas.Translate(3,1);s.Canvas.DrawRoundRect(A.SKRect.Create(20,6,18,24),4,4,p);s.Canvas.Restore()}
  gpu.Flush();assert(output.pixels);assert.deepEqual(read(gpu),read(cpu));assert(image.Width===50);
}));

test('image point and sampling overloads match direct CanvasKit drawing',()=>scope(own=>{
  const source=own(A.SKSurface.Create(new A.SKImageInfo(4,4))),p=own(new A.SKPaint({Color:A.SKColors.Red}));source.Canvas.Clear(A.SKColors.Blue);source.Canvas.DrawRect(0,0,2,4,p);const image=own(source.Snapshot());
  const wrapped=own(A.SKSurface.Create(new A.SKImageInfo(30,20))),expected=own(A.SKSurface.Create(new A.SKImageInfo(30,20))),sample=new A.SKSamplingOptions(K.FilterMode.Nearest,K.MipmapMode.None);
  wrapped.Canvas.DrawImage(image,new A.SKPoint(2,2),sample);expected.Canvas._native.drawImageOptions(image._native,2,2,K.FilterMode.Nearest,K.MipmapMode.None,null);
  wrapped.Canvas.DrawImage(image,A.SKRect.Create(10,2,16,16),sample,p);expected.Canvas._native.drawImageRectOptions(image._native,[0,0,4,4],[10,2,26,18],K.FilterMode.Nearest,K.MipmapMode.None,p._native);
  assert.deepEqual(read(wrapped),read(expected));
}));

test('atlas sprite-first signature and optional paint preserve sprite and color mapping',()=>scope(own=>{
  const source=own(A.SKSurface.Create(new A.SKImageInfo(4,4)));source.Canvas.Clear(A.SKColors.Red);const image=own(source.Snapshot()),s=own(A.SKSurface.Create(new A.SKImageInfo(12,8))),p=own(new A.SKPaint());
  s.Canvas.DrawAtlas(image,[A.SKRect.Create(0,0,4,4)],[[1,0,1,1]],p);assert.deepEqual(pixel(read(s),12,2,2),[255,0,0,255]);
  s.Canvas.DrawAtlas(image,[A.SKRect.Create(0,0,4,4)],[[1,0,6,1]],[A.SKColors.Green],A.SKBlendMode.Dst);assert.deepEqual(pixel(read(s),12,7,2),[0,128,0,255]);
}));

test('oval point-size and round-rect size overloads equal scalar equivalents',()=>scope(own=>{
  const x=own(A.SKSurface.Create(new A.SKImageInfo(80,40))),y=own(A.SKSurface.Create(new A.SKImageInfo(80,40))),p=own(new A.SKPaint({Color:A.SKColors.Blue}));
  x.Canvas.DrawOval(new A.SKPoint(20,20),new A.SKSize(12,8),p);y.Canvas.DrawOval(20,20,12,8,p);
  x.Canvas.DrawRoundRect(A.SKRect.Create(45,5,30,30),new A.SKSize(7,9),p);y.Canvas.DrawRoundRect(A.SKRect.Create(45,5,30,30),7,9,p);assert.deepEqual(read(x),read(y));
}));

class FakeCanvas {
  constructor(width=8,height=8){this.width=width;this.height=height;this.kind=null;this.isConnected=false;this.replacement=null;this.parent=null;this.contexts=new Map()}
  getContext(kind){if(this.kind&&this.kind!==kind)return null;this.kind=kind;if(!this.contexts.has(kind))this.contexts.set(kind,{kind});return this.contexts.get(kind)}
  cloneNode(){return new FakeCanvas(this.width,this.height)}
  replaceWith(next){this.replacement=next;if(this.parent){this.parent.canvas=next;next.parent=this.parent}next.isConnected=this.isConnected;this.isConnected=false}
}
function mockCanvasAPI(overrides={},gpu=async()=>{throw Error('WebGPU unavailable')}){
  const fake={...K,...overrides};return createCanvasAPI(fake,A,gpu);
}

test('fallback replaces a context-locked canvas and presents on its returned Element',async()=>{
  const original=new FakeCanvas();original.isConnected=true;let presented=0;
  const C=mockCanvasAPI({GetWebGLContext(){return 0},MakeSWCanvasSurface(element){assert(element.getContext('2d'));const surface=K.MakeSurface(element.width,element.height);const flush=surface.flush.bind(surface);surface.flush=()=>{assert(element.getContext('2d'));presented++;flush()};return surface}},async element=>{assert(element.getContext('webgpu'));throw Error('Injected pipeline failure')});
  const surface=await C.SKSurface.CreateForCanvas(original,{backend:'auto'});
  try{assert.equal(surface.Backend,'canvas');assert.notEqual(surface.Element,original);assert.equal(original.replacement,surface.Element);assert.equal(surface.FallbackReasons.length,2);surface.Canvas.Clear(A.SKColors.Blue);surface.Flush();assert.equal(presented,1)}finally{surface.Dispose()}
});

test('explicit WebGL initialization releases both direct context and context handle once',async()=>{
  let deletes=0,handles=0;const C=mockCanvasAPI({GetWebGLContext(element){element.getContext('webgl');return 7},MakeWebGLContext(){return {delete(){deletes++}}},MakeOnScreenGLSurface(_context,w,h){return K.MakeSurface(w,h)},deleteContext(handle){assert.equal(handle,7);handles++}});
  const surface=await C.SKSurface.CreateForCanvas(new FakeCanvas(),{backend:'webgl',allowFallback:false});assert.equal(surface.Backend,'webgl');surface.Dispose();surface.Dispose();assert.equal(deletes,1);assert.equal(handles,1);
});

test('failed WebGL surface releases its context before Canvas fallback',async()=>{
  let deletes=0,handles=0;const C=mockCanvasAPI({GetWebGLContext(element){element.getContext('webgl');return 8},MakeWebGLContext(){return {delete(){deletes++}}},MakeOnScreenGLSurface(){return null},deleteContext(handle){assert.equal(handle,8);handles++},MakeSWCanvasSurface(element){assert(element.getContext('2d'));return K.MakeSurface(element.width,element.height)}});
  const original=new FakeCanvas(),surface=await C.SKSurface.CreateForCanvas(original,{backend:'webgl'});try{assert.equal(surface.Backend,'canvas');assert.notEqual(surface.Element,original);assert.equal(deletes,1);assert.equal(handles,1)}finally{surface.Dispose()}
});

test('forced backend with disabled fallback rejects failed initialization',async()=>{
  let software=0;const C=mockCanvasAPI({MakeSWCanvasSurface(){software++;return K.MakeSurface(8,8)}},async element=>{element.getContext('webgpu');throw Error('Injected failure')});
  await assert.rejects(C.SKSurface.CreateForCanvas(new FakeCanvas(),{backend:'webgpu',allowFallback:false}),/Injected failure/);assert.equal(software,0);
});

test('custom element inserts the canvas actually returned by fallback',async()=>{
  const saved=Object.fromEntries(['HTMLElement','customElements','ResizeObserver','CustomEvent'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));const definitions=new Map();
  class Host {
    constructor(){this.clientWidth=64;this.clientHeight=48;this.isConnected=true;this.events=[];this.attributes=new Map()}
    attachShadow(){const root={canvas:new FakeCanvas(64,48),querySelector(){return this.canvas}};root.canvas.parent=root;root.canvas.isConnected=true;this.shadowRoot=root;return root}
    getAttribute(name){return this.attributes.get(name)??null}
    dispatchEvent(event){this.events.push(event);return true}
  }
  Object.defineProperties(globalThis,{HTMLElement:{value:Host,configurable:true},customElements:{value:{get:name=>definitions.get(name),define:(name,type)=>definitions.set(name,type)},configurable:true},ResizeObserver:{value:class{observe(){}disconnect(){}},configurable:true},CustomEvent:{value:class{constructor(type,options){this.type=type;this.detail=options.detail}},configurable:true}});
  let surface;
  try{
    const api=await RegisterWebComponent({CanvasKit:K,fonts:false,isolated:true});const replacement=new FakeCanvas(64,48);let flushed=0;
    api.SKSurface.Create=async()=>surface={Element:replacement,Canvas:{},IsDisposed:false,Flush(){flushed++},Dispose(){this.IsDisposed=true}};
    const element=new(definitions.get('skia-canvas'))();await element.InvalidateSurface();assert.equal(element.shadowRoot.canvas,replacement);assert.equal(element.Surface,surface);assert.equal(flushed,1);assert(element.events.some(e=>e.type==='paintsurface'));element.disconnectedCallback();assert(surface.IsDisposed);
  }finally{surface?.Dispose();for(const [name,descriptor]of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}}
});
