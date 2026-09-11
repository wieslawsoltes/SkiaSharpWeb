/** Real Dawn device verification. Run with webgpu installed and a usable Vulkan ICD.
 * This verifies Graphite images; Ganesh's adopted WebGL textures require WebGL. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const project=path.resolve(process.env.SKIA_WEB_ROOT??path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const native=path.resolve(process.env.SKIA_NATIVE_DIR??path.join(project,'dist/vendor'));
const {create,globals}=await import(process.env.SKIA_WEBGPU_MODULE??'webgpu');
const {Initialize}=await import(pathToFileURL(path.join(project,'dist/lib/index.js')));
Object.assign(globalThis,globals);
const gpu=create(['backend=vulkan','enable-dawn-features=allow_unsafe_apis']);
const adapter=await gpu.requestAdapter();assert(adapter,'A real Dawn Vulkan adapter is required.');
const adapterInfo={vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description};
const features=[...adapter.features].filter(x=>['float32-filterable','float32-blendable','bgra8unorm-storage','texture-compression-bc','texture-compression-etc2','texture-compression-astc','rg11b10ufloat-renderable','depth32float-stencil8'].includes(x));
const device=await adapter.requestDevice({requiredFeatures:features});
const errors=[];device.addEventListener('uncapturederror',event=>errors.push(event.error.message));
const require=createRequire(import.meta.url),K=await require(path.join(native,'canvaskit.cjs'))({wasmBinary:fs.readFileSync(path.join(native,'canvaskit.wasm'))});
const S=await Initialize({CanvasKit:K,isolated:true,fonts:false});
const context=S.SKGraphiteContext.CreateDawn(device);assert(context,'Native Graphite context');
const recorder=context.CreateRecorder(),sourceBytes=Uint8Array.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,0,255]),source=S.SKImage.FromPixels(new S.SKImageInfo(2,2),sourceBytes);
const plain=source.ToTextureImage(recorder),mipmapped=source.ToTextureImage(recorder,true);assert(plain&&mipmapped,'Native TextureFromImage returned images');assert.equal(plain.TextureImportMode,'graphite-upload');assert(plain.IsTextureBacked&&mipmapped.IsTextureBacked);
source.Dispose();assert(recorder._surfaces.has(plain)&&recorder._surfaces.has(mipmapped));assert.throws(()=>recorder.Dispose(),/Dispose Graphite surfaces/);
const texture=device.createTexture({label:'SkiaSharp GPU image verification',size:[16,8],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST}),backend=S.SKGraphiteBackendTexture.CreateDawn(texture),surface=S.SKSurface.CreateGraphite(recorder,backend),paint=new S.SKPaint();
surface.Canvas.Clear(S.SKColors.Black);surface.Canvas.DrawImage(plain,1,1,paint);surface.Canvas.DrawImage(mipmapped,8,1,paint);
// The recordings must retain their resources after caller-owned image wrappers die.
plain.Dispose();mipmapped.Dispose();assert(!recorder._surfaces.has(plain)&&!recorder._surfaces.has(mipmapped));
surface.Flush();await context.SubmitAsync();const readback=await S.ReadWebGPUTexture(device,texture),pixels=readback.GetPlaneData(0),pixel=(x,y)=>[...pixels.subarray((y*16+x)*4,(y*16+x)*4+4)];
for(const x of[1,8]){assert.deepEqual(pixel(x,1),[255,0,0,255]);assert.deepEqual(pixel(x+1,1),[0,255,0,255]);assert.deepEqual(pixel(x,2),[0,0,255,255]);assert.deepEqual(pixel(x+1,2),[255,255,0,255]);}
assert.deepEqual(pixel(0,0),[0,0,0,255]);
const observed={plain:[pixel(1,1),pixel(2,1),pixel(1,2),pixel(2,2)],mipmapped:[pixel(8,1),pixel(9,1),pixel(8,2),pixel(9,2)]};
readback.Dispose();paint.Dispose();surface.Dispose();backend.Dispose();recorder.Dispose();await context.DisposeAsync();texture.destroy();await device.queue.onSubmittedWorkDone();
const handles={devices:Object.keys(K.WebGPU.mgrDevice.objects).length,queues:Object.keys(K.WebGPU.mgrQueue.objects).length,textures:Object.keys(K.WebGPU.mgrTexture.objects).length};assert.deepEqual(handles,{devices:0,queues:0,textures:0});assert.deepEqual(errors,[]);device.destroy();
const report={adapter:adapterInfo,physicalGpu:false,checks:['native Graphite TextureFromImage','mipmapped and unmipmapped images','source raster disposal before draw','owner recorder disposal guard','image wrappers disposed before GPU submission','exact RGBA pixels for both textures','zero native device/queue/texture handles after cleanup'],pixels:observed,handles,errors,notExercised:['Ganesh FromAdoptedTexture and Ganesh ToTextureImage require a WebGL context; Dawn/Vulkan does not provide WebGL.']};
const output=process.env.SKIA_GPU_IMAGE_REPORT??path.join(native,'gpu-image-validation.json');fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exit(0);
