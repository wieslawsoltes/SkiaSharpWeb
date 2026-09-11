import { createAssetScenes } from '../dist/asset-samples.js';
/** Runs the entire gallery on native Graphite via a real Dawn adapter.
 * WEBGPU_MODULE=/path/to/webgpu/index.js node scripts/verify-graphite.mjs
 * Optional: --output report.json --images output/directory
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {Initialize} from '../dist/lib/index.js';
import {createScenes} from '../dist/samples.js';
import {createAdvancedScenes} from '../dist/samples-advanced.js';
import {createAnimationScenes} from '../dist/animation-samples.js';
import {createFontScenes} from '../dist/font-samples.js';
import {createRegionEffectScenes} from '../dist/region-effect-scenes.js';
const args=process.argv.slice(2),option=n=>args.includes(n)?args[args.indexOf(n)+1]:null;
const {create,globals}=await import(process.env.WEBGPU_MODULE?pathToFileURL(resolve(process.env.WEBGPU_MODULE)).href:'webgpu');
Object.assign(globalThis,globals);const gpu=create(['backend=vulkan','enable-dawn-features=allow_unsafe_apis']);
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{requestAdapter:o=>gpu.requestAdapter(o),getPreferredCanvasFormat:()=> 'rgba8unorm'}}});
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,isolated:true,fonts:['DejaVuSans.ttf','DejaVuSerif.ttf','DejaVuSansMono.ttf'].map(file=>({data:fs.readFileSync(new URL('../dist/fonts/'+file,import.meta.url))}))});
assert.equal(S.NativeGpuCapabilities.GraphiteDawn,true,'The bundled WASM must contain a real Graphite bridge');
const animation=createAnimationScenes(S),fonts=await createFontScenes(S,{loadBytes:url=>fs.readFileSync(new URL('../dist/'+url,import.meta.url))});
const scenes=[...createScenes(S),...createAdvancedScenes(S),...animation.scenes,...fonts.scenes,...createRegionEffectScenes(S),...createAssetScenes(S)];
const results=[],validationErrors=[];let texture;
const canvas={width:480,height:300,getContext(type){assert.equal(type,'webgpu');return context}};
const context={configure({device,format}){texture?.destroy();texture=device.createTexture({size:[canvas.width,canvas.height],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});},getCurrentTexture(){return texture},unconfigure(){texture?.destroy()}};
const surface=await S.SKSurface.CreateForCanvas(canvas,{backend:'webgpu',allowFallback:false});
assert.equal(surface.RenderMode,'skia-graphite-webgpu');surface.GraphiteContext.Device.addEventListener('uncapturederror',event=>validationErrors.push(event.error.message));
const options={amount:7,count:200,time:.63,weight:740,palette:1,surface};
const reference=S.SKSurface.Create(new S.SKImageInfo(480,300));
const background=[14,24,35];
const ink=pixels=>{let n=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(Math.abs(pixels[i]-background[0]),Math.abs(pixels[i+1]-background[1]),Math.abs(pixels[i+2]-background[2]))>24)n++;return n;};
if(option('--images'))fs.mkdirSync(resolve(option('--images')),{recursive:true});
try{
 for(const scene of scenes){let image,data;const before=validationErrors.length,start=performance.now();
  try{const c=surface.Canvas;c.RestoreToCount(1);c.ResetMatrix();c.Clear(S.SKColor.Parse('#0E1823'));const saved=c.Save();scene.draw(c,480,300,options);assert.equal(c.SaveCount,saved+1,'scene preserves save count');c.RestoreToCount(saved);await surface.FlushAsync();image=await surface.SnapshotAsync();const pixels=image.ReadPixels();assert(pixels.some((v,i)=>i%4!==3&&v>50),'scene contains visible pixels');assert.equal(validationErrors.length,before,'no GPU validation errors');const statistics=surface._graphitePresenter.statistics;assert.equal(statistics.lastUploadBytes,0,'Graphite presentation must not upload CPU raster pixels');
   const rc=reference.Canvas;rc.RestoreToCount(1);rc.ResetMatrix();rc.Clear(S.SKColor.Parse('#0E1823'));scene.draw(rc,480,300,options);reference.Flush();const expected=rc.ReadPixels(new S.SKImageInfo(480,300));const referenceInk=ink(expected),graphiteInk=ink(pixels);let totalError=0;for(let i=0;i<pixels.length;i++)totalError+=Math.abs(pixels[i]-expected[i]);const mae=totalError/pixels.length;
   if(option('--images')){data=image.Encode(S.SKEncodedImageFormat.Png,100);fs.writeFileSync(resolve(option('--images'),scene.id+'.png'),data.ToArray());}
   assert(graphiteInk>=referenceInk*.80,`Graphite lost visible content: ${graphiteInk} vs ${referenceInk} raster pixels`);
   assert(mae<12,`Graphite/raster mean component error too large: ${mae}`);
   results.push({scene:scene.id,passed:true,elapsedMs:performance.now()-start,referenceInk,graphiteInk,meanAbsoluteError:mae,sha256:createHash('sha256').update(pixels).digest('hex')});}
  catch(error){results.push({scene:scene.id,passed:false,error:error.stack});}
  finally{data?.Dispose();image?.Dispose();}
 }
}finally{reference.Dispose();await surface.DisposeAsync();animation.Dispose();fonts.Dispose();}
const adapter=await gpu.requestAdapter(),info=adapter.info;
const report={engine:'native Skia Graphite / Dawn / Vulkan',adapter:{vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description,isFallbackAdapter:info.isFallbackAdapter},physicalGPU:!info.isFallbackAdapter&&!/swiftshader|llvmpipe|software/i.test([info.vendor,info.device,info.description].join(' ')),passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,validationErrors,results};
if(option('--output'))fs.writeFileSync(resolve(option('--output')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exit(report.failed||validationErrors.length?1:0);
