/** Repeatable CPU benchmarks. The WebGPU host benchmark does not time a GPU. */
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(new URL('../',import.meta.url).pathname), args=process.argv.slice(2);
const option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const baseline=option('--baseline'),count=Number(option('--count')||10000),rounds=Number(option('--rounds')||31);
const require=createRequire(import.meta.url),K=await require('../dist/vendor/canvaskit.cjs')({wasmBinary:readFileSync(resolve(root,'dist/vendor/canvaskit.wasm'))});
const configurations=baseline?[['baseline',resolve(baseline)],['current',resolve(root,'dist')]]:[['current',resolve(root,'dist')]];
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const commands=[{type:'clear',color:[0,0,0,0]},...Array.from({length:count},(_,i)=>({type:'circle',cx:(i*17)%512,cy:(i*31)%512,r:2+(i%3),color:[0.2,0.5,0.8,0.5]}))];
const results=[];
// Minimal submission sink: it measures JavaScript validation/packing only.
// Real shader execution and mapped output have a separate validation script.
const pending=new Promise(()=>{}),pipe={getBindGroupLayout(){return {}}};
const pass={setPipeline(){},setBindGroup(){},setVertexBuffer(){},draw(){},end(){}};
const counters={bufferBytes:0,textureBytes:0};
const device={lost:pending,limits:{maxTextureDimension2D:8192,maxBufferSize:268435456},pushErrorScope(){},async popErrorScope(){return null},
 createShaderModule(){return {async getCompilationInfo(){return {messages:[]}}}},async createRenderPipelineAsync(){return pipe},createSampler(){return {}},
 createTexture(){return {createView(){return {}},destroy(){}}},createBuffer(){return {destroy(){}}},createBindGroup(){return {}},
 createCommandEncoder(){return {beginRenderPass(){return pass},finish(){return {}}}},destroy(){},
 queue:{writeBuffer(b,o,v,s,n){counters.bufferBytes=n},writeTexture(t,v){counters.textureBytes=v.byteLength},submit(){}}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{async requestAdapter(){return {async requestDevice(){return device}}},getPreferredCanvasFormat(){return 'rgba8unorm'}}}});
globalThis.GPUTextureUsage={RENDER_ATTACHMENT:16,TEXTURE_BINDING:4,COPY_DST:2};globalThis.GPUBufferUsage={VERTEX:32,COPY_DST:8};
for(const [label,directory]of configurations){
 const {Initialize}=await import(pathToFileURL(resolve(directory,'lib/index.js'))),A=await Initialize({CanvasKit:K,fonts:false,isolated:true});
 const colorSpace=A.SKColorSpace.CreateSrgb(),surface=A.SKSurface.Create(new A.SKImageInfo(512,512,A.SKColorType.Rgba8888,A.SKAlphaType.Unpremul,colorSpace)),paint=new A.SKPaint({Color:new A.SKColor(51,128,204,128),IsAntialias:true});
 const {createWebGPUBackend}=await import(pathToFileURL(resolve(directory,'lib/webgpu.js')));
 const backend=await createWebGPUBackend({width:512,height:512,getContext(){return {configure(){},getCurrentTexture(){return {createView(){return {}}}},unconfigure(){}}}});
 const pixels=new Uint8Array(997*563*4);
 results.push({label,surface,paint,backend,pixels,A,colorSpace,cases:{}});
}
const cases={
 raster_primitives:r=>{const c=r.surface.Canvas;c.Clear(r.A.SKColors.Transparent);for(let i=0;i<count;i++)c.DrawCircle((i*17)%512,(i*31)%512,2+i%3,r.paint);r.surface.Flush()},
 webgpu_command_preparation:r=>r.backend.presentPrimitives(commands,512,512),
 texture_upload_preparation:r=>r.backend.presentPixels(r.pixels,997,563)
};
for(const [name,fn]of Object.entries(cases)){
 for(const r of results){r.cases[name]={samples:[],cpu:[]};for(let i=0;i<7;i++)fn(r)}
 for(let i=0;i<rounds;i++)for(const r of i%2?[...results].reverse():results){const cpu=process.cpuUsage(),start=performance.now();fn(r);const elapsed=performance.now()-start,used=process.cpuUsage(cpu);r.cases[name].samples.push(elapsed);r.cases[name].cpu.push((used.user+used.system)/1000);r.cases[name].uploadBytes=name==='webgpu_command_preparation'?counters.bufferBytes:name==='texture_upload_preparation'?counters.textureBytes:0;}
}
const output={runtime:process.version,nativeWasmSHA256:createHash('sha256').update(readFileSync(resolve(root,'dist/vendor/canvaskit.wasm'))).digest('hex'),adapter:'submission sink (CPU benchmarks only)',count,rounds,results:results.map(r=>({label:r.label,rasterSHA256:createHash('sha256').update(r.surface.Canvas.ReadPixels(new r.A.SKImageInfo(512,512))).digest('hex'),cases:Object.fromEntries(Object.entries(r.cases).map(([name,v])=>[name,{medianMs:median(v.samples),medianCpuMs:median(v.cpu),p95Ms:[...v.samples].sort((a,b)=>a-b)[Math.floor(v.samples.length*.95)],uploadedBytesPerFrame:v.uploadBytes}]))}))};
for(const r of results){r.paint.Dispose();r.surface.Dispose();r.colorSpace.Dispose();r.backend.dispose()}
if(option('--output'))writeFileSync(resolve(option('--output')),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
