import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Initialize } from '../dist/lib/index.js';
import { createScenes } from '../dist/samples.js';
const require=createRequire(import.meta.url),init=require('../dist/vendor/canvaskit.cjs');
const K=await init({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false});
for(const [file,family]of [['DejaVuSans.ttf','DejaVu Sans'],['DejaVuSerif.ttf','DejaVu Serif'],['DejaVuSansMono.ttf','DejaVu Sans Mono']])S.SKFontManager.Default.RegisterFont(fs.readFileSync(new URL('../dist/fonts/'+file,import.meta.url)),family);
fs.mkdirSync(new URL('../test-output/',import.meta.url),{recursive:true});
for(const scene of createScenes(S))test('sample renders: '+scene.id,()=>{
 const surface=S.SKSurface.Create(new S.SKImageInfo(960,600));
 try{const canvas=surface.Canvas;canvas.Clear(S.SKColor.Parse('#0E1823'));canvas.Save();scene.draw(canvas,960,600,{time:2.2,amount:8,count:500});canvas.RestoreToCount(1);surface.Flush();const image=surface.Snapshot();try{const data=image.Encode(S.SKEncodedImageFormat.Png,100);try{const bytes=data.ToArray();assert.ok(bytes.length>2500,'sample must produce meaningful nonempty output');fs.writeFileSync(new URL('../test-output/'+scene.id+'.png',import.meta.url),bytes);}finally{data.Dispose();}}finally{image.Dispose();}}finally{surface.Dispose();}
});
test('disposed canvas owner and ended recording reject use',()=>{const surface=S.SKSurface.Create(new S.SKImageInfo(20,20));const canvas=surface.Canvas;surface.Dispose();assert.throws(()=>canvas.Clear(S.SKColors.Red));const rec=new S.SKPictureRecorder();const rc=rec.BeginRecording(S.SKRect.Create(0,0,20,20));const pic=rec.EndRecording();assert.throws(()=>rc.Clear(S.SKColors.Red));pic.Dispose();rec.Dispose();});
test('snapshot survives surface disposal and keeps exact pixels',()=>{const s=S.SKSurface.Create(new S.SKImageInfo(10,10));s.Canvas.Clear(S.SKColors.Red);const img=s.Snapshot();s.Dispose();const p=img.ReadPixels();assert.equal(p[0],255);assert.equal(p[1],0);img.Dispose();});
test('WebGPU primitive frames defer rasterization, then snapshot replays disposed paints exactly',()=>{
 let primitiveCalls=0,pixelCalls=0;
 const s=new S.SKSurface(K.MakeSurface(16,16),'webgpu',null,{presentPrimitives(commands){primitiveCalls++;assert.equal(commands.length,2);},presentPixels(){pixelCalls++;},dispose(){}});
 const p=new S.SKPaint({Color:S.SKColors.Red,IsAntialias:true});s.Canvas.Clear(S.SKColors.Black);s.Canvas.Save();s.Canvas.DrawRect(0,0,16,16,p);s.Canvas.Restore();p.Dispose();
 assert.equal(s._native.getCanvas().readPixels(0,0,{width:1,height:1,colorType:K.ColorType.RGBA_8888,alphaType:K.AlphaType.Unpremul,colorSpace:K.ColorSpace.SRGB})[0],0);
 s.Flush();assert.equal(primitiveCalls,1);assert.equal(pixelCalls,0);const snapshot=s.Snapshot();assert.equal(snapshot.ReadPixels()[0],255);snapshot.Dispose();s.Dispose();
});
test('deferred GPU primitives replay before transforms and fallback preserve order',()=>{
 let uploaded;
 const s=new S.SKSurface(K.MakeSurface(20,10),'webgpu',null,{presentPrimitives(){throw Error('expected raster fallback');},presentPixels(p){uploaded=new Uint8Array(p);},dispose(){}});
 const p=new S.SKPaint({Color:S.SKColors.Red,IsAntialias:true});s.Canvas.Clear(S.SKColors.Black);s.Canvas.DrawRect(0,0,10,10,p);s.Canvas.Translate(10,0);p.Color=S.SKColors.Blue;s.Canvas.DrawRect(0,0,10,10,p);s.Flush();assert.equal(uploaded[0],255);assert.equal(uploaded[(15*4)+2],255);p.Dispose();s.Dispose();
});
test('direct paragraph Paint forces deferred WebGPU frame into complete raster output',()=>{
 let uploaded=false;
 const s=new S.SKSurface(K.MakeSurface(200,70),'webgpu',null,{presentPrimitives(){throw Error('text was omitted');},presentPixels(){uploaded=true;},dispose(){}});
 s.Canvas.Clear(S.SKColors.White);const b=new S.SKParagraphBuilder({TextStyle:{FontSize:25,Color:S.SKColors.Black}});b.AddText('Hello');const paragraph=b.Build();paragraph.Layout(150);paragraph.Paint(s.Canvas,5,5);s.Flush();assert.ok(uploaded);paragraph.Dispose();b.Dispose();s.Dispose();
});
