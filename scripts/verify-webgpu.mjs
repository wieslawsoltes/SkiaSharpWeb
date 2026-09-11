/** Execute the WGSL renderer on a real Dawn adapter and read back its output.
 * npm install --no-save webgpu; WEBGPU_MODULE=/absolute/path/to/index.js node scripts/verify-webgpu.mjs
 * For software Vulkan, set VK_ICD_FILENAMES to the SwiftShader ICD first.
 * An optional --baseline DIST directory compares old/new shader output.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),option=n=>args.includes(n)?args[args.indexOf(n)+1]:null;
const {create,globals}=await import(process.env.WEBGPU_MODULE?pathToFileURL(resolve(process.env.WEBGPU_MODULE)).href:'webgpu');
Object.assign(globalThis,globals);
const gpu=create(['backend=vulkan','enable-dawn-features=allow_unsafe_apis']);
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{requestAdapter:options=>gpu.requestAdapter(options),getPreferredCanvasFormat:()=> 'rgba8unorm'}}});
const {createWebGPUBackend}=await import('../dist/lib/webgpu.js');
const variants=[['current',createWebGPUBackend]];
if(option('--baseline'))variants.unshift(['baseline',(await import(pathToFileURL(resolve(option('--baseline'),'lib/webgpu.js')))).createWebGPUBackend]);
const results=[],images=[];
const commands=[{type:'clear',color:[0,0,0,0]},
 {type:'rect',rect:[5,7,27,16],color:[1,0,0,1]},
 {type:'circle',cx:48.25,cy:27.5,r:14.75,color:[0,1,0,.5]},
 {type:'line',x1:5,y1:57,x2:66,y2:40,width:4.25,color:[0,0,1,.8]},
 {type:'rect',rect:[95,12,-18,25],color:[1,.5,0,.7]}];
for(const [label,factory]of variants){
 let texture,device,format,errors=[];
 const context={configure(options){device=options.device;format=options.format;texture?.destroy();texture=device.createTexture({size:[canvas.width,canvas.height],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});},unconfigure(){texture?.destroy()},getCurrentTexture(){return texture}};
 const canvas={width:101,height:67,getContext(type){assert.equal(type,'webgpu');return context}};
 const renderer=await factory(canvas);device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
 const read=async()=>{const rowBytes=Math.ceil(canvas.width*4/256)*256,buffer=device.createBuffer({size:rowBytes*canvas.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture},{buffer,bytesPerRow:rowBytes},[canvas.width,canvas.height]);device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);const data=new Uint8Array(buffer.getMappedRange()),packed=new Uint8Array(canvas.width*canvas.height*4);for(let y=0;y<canvas.height;y++)packed.set(data.subarray(y*rowBytes,y*rowBytes+canvas.width*4),y*canvas.width*4);buffer.unmap();buffer.destroy();return packed};
 renderer.presentPrimitives(commands,101,67);let pixels=await read();images.push(pixels);
 const pixel=(x,y)=>Array.from(pixels.subarray((y*101+x)*4,(y*101+x+1)*4));
 assert.deepEqual(pixel(10,10),[255,0,0,255]);assert.deepEqual(pixel(48,27),[0,128,0,128]);assert.deepEqual(pixel(0,0),[0,0,0,0]);
 // Upload odd-width tightly packed rows and a view with a nonzero offset.
 const storage=new Uint8Array(13+65*3*4+9),upload=storage.subarray(13,13+65*3*4);for(let y=0;y<3;y++)for(let x=0;x<65;x++)upload.set([10+y,20+x,30,128],(y*65+x)*4);
 renderer.presentPixels(upload,65,3);const uploaded=await read();assert.deepEqual(uploaded,upload);
 await device.queue.onSubmittedWorkDone();assert.deepEqual(errors,[]);
 results.push({label,primitiveChecks:3,uploadBytes:uploaded.length,validationErrors:errors,adapter:renderer.adapterInfo??null});renderer.dispose();
}
let difference=null;
if(images.length===2){let changed=0,max=0,total=0;for(let i=0;i<images[0].length;i++){const d=Math.abs(images[0][i]-images[1][i]);if(d)changed++;max=Math.max(max,d);total+=d;}difference={changedComponents:changed,maxComponentError:max,meanAbsoluteError:total/images[0].length};assert(max<=1,`Instancing altered coverage by ${max} bytes`);}
const adapter=await gpu.requestAdapter(),report={runtime:process.version,backend:'Dawn Vulkan',adapterInfo:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description,isFallbackAdapter:adapter.info.isFallbackAdapter},physicalGPU:!adapter.info.isFallbackAdapter&&!/swiftshader|llvmpipe|software/i.test(JSON.stringify(adapter.info)),results,difference};
if(option('--output'))writeFileSync(resolve(option('--output')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
// Dawn's background executor can retain Node after every resource is disposed.
process.exit(0);
