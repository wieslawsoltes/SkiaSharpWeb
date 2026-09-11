import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';
import{Initialize}from'../dist/lib/index.js';import{DrawOptimizationScene,CreateOptimizationPath}from'../dist/optimization-scene.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true}),palette={bg:'#ffffff',grid:'#ffffff',stroke:'#000000',fill:'#000000',point:'#ff00ff'};
test('font-free sample draws matching stroke and fill geometry for every cap, dash mode and control toggle',()=>{
 const path=CreateOptimizationPath(S),surface=S.SKSurface.Create(new S.SKImageInfo(1000,420));
 try{for(const cap of ['Round','Square','Butt'])for(const dash of [true,false]){
  DrawOptimizationScene(S,path,surface.Canvas,{width:17,cap,dash,controls:false},palette);const image=surface.Snapshot();try{const pixels=image.ReadPixels();let mae=0,ink=0;for(let y=0;y<420;y++)for(let x=0;x<490;x++){const a=(y*1000+x)*4,b=(y*1000+x+500)*4;mae+=Math.abs(pixels[a]-pixels[b]);if(pixels[a]<128)ink++;}assert(mae/(490*420)<1,cap+' '+dash+' geometry differs');assert(ink>2000);}finally{image.Dispose();}
 }
 const before=K.count_emval_handles();for(let i=0;i<100;i++)DrawOptimizationScene(S,path,surface.Canvas,{width:12,cap:'Round',dash:true,controls:true},palette);assert.equal(K.count_emval_handles(),before);
 }finally{path.Dispose();surface.Dispose();}
});
test('sample vector export remains vector and blur export reports native raster decisions',()=>{
 const path=CreateOptimizationPath(S),state={width:12,cap:'Round',dash:true,controls:false};
 try{for(const blur of [false,true]){const doc=S.SKDocument.CreatePdf({NativeBackend:true,StrictVector:!blur});try{DrawOptimizationScene(S,path,doc.BeginPage(1000,420),state,palette,blur);const bytes=doc.ToData();try{assert(bytes.Size>500);}finally{bytes.Dispose();}assert.equal(doc.RasterDiagnostics.Total>0,blur);}finally{doc.Dispose();}}}finally{path.Dispose();}
});
