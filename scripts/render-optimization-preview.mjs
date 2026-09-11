/** Native raster preview of the exact sample draw function; no browser or fonts. */
import fs from 'node:fs';import path from 'node:path';import{createRequire}from'node:module';import{performance}from'node:perf_hooks';
import{Initialize}from'../dist/lib/index.js';import{DrawOptimizationScene,CreateOptimizationPath}from'../dist/optimization-scene.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
const output=process.argv[2]??'test-output/optimization-preview';fs.mkdirSync(output,{recursive:true});
const curve=CreateOptimizationPath(S),surface=S.SKSurface.Create(new S.SKImageInfo(1000,420));const state={width:12,cap:'Round',dash:true,controls:false};
const palettes={dark:{bg:'#121B27',grid:'#202F42',stroke:'#49DDBD',fill:'#83ACFF',point:'#DAA7FF'},light:{bg:'#EEF3F8',grid:'#DDE5EF',stroke:'#087B66',fill:'#437AC7',point:'#8658BB'}};
const report={version:S.Version,scope:'Actual Skia raster preview of the shared sample draw function, not a browser GPU test',themes:{}};
try{for(const [theme,palette]of Object.entries(palettes)){const start=performance.now();DrawOptimizationScene(S,curve,surface.Canvas,state,palette);const elapsed=performance.now()-start,image=surface.Snapshot(),png=image.Encode('Png');try{fs.writeFileSync(path.join(output,theme+'.png'),png.AsSpan());}finally{png.Dispose();image.Dispose();}report.themes[theme]={points:curve.PointCount,cpuDrawMs:elapsed,cache:S.SKGraphics.GetPathCacheStatistics()};}
 for(const blur of [false,true]){const d=S.SKDocument.CreatePdf({NativeBackend:true,StrictVector:!blur});try{DrawOptimizationScene(S,curve,d.BeginPage(1000,420),state,palettes.light,blur);const data=d.ToData();try{fs.writeFileSync(path.join(output,blur?'blur.pdf':'vector.pdf'),data.AsSpan());}finally{data.Dispose();}report[blur?'blur':'vector']=d.RasterDiagnostics;}finally{d.Dispose();}}
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}finally{curve.Dispose();surface.Dispose();S.SKGraphics.PurgePathCache();}
