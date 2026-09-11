import {createAssetScenes} from '../dist/asset-samples.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Initialize} from '../dist/lib/index.js';
import {createScenes} from '../dist/samples.js';
import {createAdvancedScenes} from '../dist/samples-advanced.js';
import {createAnimationScenes} from '../dist/animation-samples.js';
import {createFontScenes} from '../dist/font-samples.js';
import {createRegionEffectScenes} from '../dist/region-effect-scenes.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:['DejaVuSans.ttf','DejaVuSerif.ttf','DejaVuSansMono.ttf'].map(file=>({data:fs.readFileSync(new URL('../dist/fonts/'+file,import.meta.url))}))});
const animation=createAnimationScenes(S),fonts=await createFontScenes(S,{loadBytes:url=>fs.readFileSync(new URL('../dist/'+url,import.meta.url))});
const scenes=[...createScenes(S),...createAdvancedScenes(S),...animation.scenes,...fonts.scenes,...createRegionEffectScenes(S),...createAssetScenes(S)];
const output=new URL('../test-output/gallery/',import.meta.url);fs.mkdirSync(output,{recursive:true});
test('every gallery scene renders and exports through the fully initialized public API',async t=>{
 assert.equal(new Set(scenes.map(s=>s.id)).size,scenes.length,'sample IDs must be unique');
 try{for(const scene of scenes)await t.test(scene.id,()=>{
  const surface=S.SKSurface.Create(new S.SKImageInfo(480,300)),options={amount:7,count:200,time:.63,weight:740,palette:1,surface};
  let image,data;
  try{surface.Canvas.Clear(S.SKColor.Parse('#0E1823'));const saved=surface.Canvas.Save(),count=surface.Canvas.SaveCount,matrix=surface.Canvas.TotalMatrix.ToArray();scene.draw(surface.Canvas,480,300,options);assert.equal(surface.Canvas.SaveCount,count,'reusable scene preserves save count');assert.deepEqual(surface.Canvas.TotalMatrix.ToArray(),matrix,'reusable scene preserves transform');surface.Canvas.RestoreToCount(saved);surface.Flush();image=surface.Snapshot();const pixels=image.ReadPixels();assert.ok(pixels.some((value,i)=>i%4!==3&&value>50),'scene contains visible graphics');data=image.Encode(S.SKEncodedImageFormat.Png,100);fs.writeFileSync(new URL(scene.id+'.png',output),data.ToArray());}finally{data?.Dispose();image?.Dispose();surface.Dispose();}
  for(const format of ['Pdf','Xps']){const doc=S.SKDocument['Create'+format]({Title:scene.title,RasterDpi:72});let bytes;try{const canvas=doc.BeginPage(320,200);canvas.Clear(S.SKColor.Parse('#0E1823'));const saved=canvas.Save();scene.draw(canvas,320,200,options);canvas.RestoreToCount(saved);doc.EndPage();bytes=doc.ToData();assert.ok(bytes.Size>100);assert.equal(doc.PageCount,1);const value=bytes.ToArray();assert.equal(new TextDecoder().decode(value.slice(0,format==='Pdf'?4:2)),format==='Pdf'?'%PDF':'PK');if(['vector_documents','document_fallbacks','skottie','variations','colorfonts','paragraph'].includes(scene.id))fs.writeFileSync(new URL(scene.id+'.'+format.toLowerCase(),output),value);}finally{bytes?.Dispose();doc.Dispose();}}
 });}finally{animation.Dispose();fonts.Dispose();}
});
test('software color filters affect scalar image draws and path effects trim public primitives',()=>{
 const surface=S.SKSurface.Create(new S.SKImageInfo(50,30)),source=S.SKSurface.Create(new S.SKImageInfo(4,4));source.Canvas.Clear(S.SKColors.Red);const image=source.Snapshot(),table=S.SKColorFilter.CreateTable(null,Array.from({length:256},(_,i)=>255-i),null,null),p=new S.SKPaint({ColorFilter:table});
 try{surface.Canvas.DrawImage(image,2,2,p);const sample=surface.Canvas.ReadPixels(new S.SKImageInfo(1,1),3,3);assert.deepEqual([...sample],[0,0,0,255]);p.ColorFilter=null;p.Color=S.SKColors.Blue;p.Style=S.SKPaintStyle.Stroke;p.StrokeWidth=2;const trim=S.SKPathEffect.CreateTrim(.25,.75);p.PathEffect=trim;trim.Dispose();surface.Canvas.DrawLine(5,20,45,20,p);assert.equal(surface.Canvas.ReadPixels(new S.SKImageInfo(1,1),9,20)[3],0);assert.ok(surface.Canvas.ReadPixels(new S.SKImageInfo(1,1),25,20)[2]>200);}finally{p.Dispose();table.Dispose();image.Dispose();source.Dispose();surface.Dispose();}
});
