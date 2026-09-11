import {Initialize,RegisterWebComponent} from '../dist/lib/index.js';
import {createScenes} from '../dist/samples.js';
import {createAdvancedScenes} from '../dist/samples-advanced.js';
import {createAnimationScenes} from '../dist/animation-samples.js';
import {createFontScenes} from '../dist/font-samples.js';
import {createRegionEffectScenes} from '../dist/region-effect-scenes.js';
import {createAssetScenes} from '../dist/asset-samples.js';
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const pause=()=>new Promise(resolve=>requestAnimationFrame(resolve));
export async function Run({software=true,requirePhysical=false}={}){
 const S=await Initialize(),K=S.CanvasKit,animation=createAnimationScenes(S);
 const fonts=await createFontScenes(S,{loadBytes:async url=>{const r=await fetch(new URL('../dist/'+url,import.meta.url));assert(r.ok,'font HTTP '+r.status);return new Uint8Array(await r.arrayBuffer());}});
 const scenes=[...createScenes(S),...createAdvancedScenes(S),...animation.scenes,...fonts.scenes,...createRegionEffectScenes(S),...createAssetScenes(S)];
 const report={version:S.Version,userAgent:navigator.userAgent,softwareAdapterRequested:software,physicalGPU:false,backends:[],component:null,errors:[]};
 const width=320,height=200,base=new Map();
 try{
  for(const backend of ['canvas','webgl','webgpu']){
   const element=document.createElement('canvas');element.width=width;element.height=height;document.body.append(element);
   let surface;
   const record={backend,scenes:[],errors:[]};report.backends.push(record);
   try{
    surface=await S.SKSurface.Create(element,{backend,allowFallback:false});
    record.mode=surface.RenderMode;record.fallbacks=surface.FallbackReasons;
    assert(surface.Backend===backend,'Explicit backend fell back');
    const presenter=surface._graphitePresenter;
    if(backend==='webgpu'){
     assert(surface.RenderMode==='skia-graphite-webgpu','Expected real native Graphite');
     record.adapter=presenter.adapterInfo;
     const description=JSON.stringify(record.adapter);
     report.physicalGPU=!software && !record.adapter.isFallbackAdapter && !!(record.adapter.vendor||record.adapter.device) && !/swiftshader|llvmpipe|software/i.test(description);
     assert(!requirePhysical||report.physicalGPU,'A physical GPU was required but not positively identified');
     presenter.device.addEventListener('uncapturederror',e=>record.errors.push(e.error.message));
    }
    for(const scene of scenes){
     const c=surface.Canvas;c.RestoreToCount(1);c.ResetMatrix();c.Clear(S.SKColor.Parse('#0E1823'));
     const save=c.Save(),start=performance.now();
     try{scene.draw(c,width,height,{amount:7,count:200,time:.63,weight:740,palette:1,surface});}finally{c.RestoreToCount(save);}
     await surface.FlushAsync();
     const snapshot=await surface.SnapshotAsync();let pixels;
     try{pixels=snapshot.ReadPixels();}finally{snapshot.Dispose();}
     assert(pixels?.length===width*height*4,scene.id+' readback size');
     assert(pixels.some((v,i)=>i%4!==3&&v>50),scene.id+' blank output');
     let sum=0,max=0,changed=0;
     if(backend==='canvas')base.set(scene.id,pixels.slice());
     else{const reference=base.get(scene.id);for(let i=0;i<pixels.length;i++){const delta=Math.abs(pixels[i]-reference[i]);sum+=delta;max=Math.max(max,delta);if(delta>8)changed++;}}
     record.scenes.push({id:scene.id,cpuAndCompletionMs:performance.now()-start,meanAbsoluteError:sum/pixels.length,maxError:max,componentsOver8:changed});
     // Different GPU rasterizers may differ on AA/filters. A gross blank/wrong
     // rendering must still fail; detailed error values remain in the report.
     assert(sum/pixels.length<30,scene.id+' excessive whole-image error');
    }
    if(presenter){record.presentation=presenter.statistics;assert(record.presentation.uploadedBytes===0,'Graphite presentation uploaded CPU frames');}
    if(backend==='webgl'&&S.SKGraphics.GetCapabilities().GaneshMemoryDump){
     const trace=new S.SKMemoryTrace();try{K.setCurrentContext(surface._glHandle);K.SkiaSharpGaneshDumpMemoryStatistics(surface._grContext,trace);record.memoryRows=trace.Entries.length;}finally{trace.Dispose();}
    }
    assert(record.errors.length===0,record.errors.join('\n'));
   }finally{if(surface?.DisposeAsync)await surface.DisposeAsync();else surface?.Dispose();element.remove();}
  }
  await RegisterWebComponent();
  const view=document.createElement('skia-canvas');view.setAttribute('backend','canvas');view.setAttribute('width','127');view.setAttribute('height','91');view.style.cssText='width:127px;height:91px';
  let paints=0;const paint=new S.SKPaint({Color:S.SKColors.Red});
  view.addEventListener('paintsurface',e=>{paints++;e.detail.Canvas.Clear(S.SKColors.White);e.detail.Canvas.DrawRect(1,1,20,20,paint);});
  document.body.append(view);await view.InvalidateSurface();await pause();
  const initial=view.Surface,before=paints,requests=[];
  for(let i=0;i<10000;i++)requests.push(view.InvalidateSurface());
  await Promise.all(requests);
  assert(paints-before===1,'Invalidations were not frame-coalesced');assert(view.Surface===initial,'Same-size repaint reallocated surface');
  view.setAttribute('width','129');await view.InvalidateSurface();assert(initial.IsDisposed,'Retired surface not disposed');assert(view.Surface.Width===129,'Resize not applied');
  const resized=view.Surface;view.remove();assert(resized.IsDisposed,'Disconnect leaked surface');
  document.body.append(view);await view.InvalidateSurface();assert(view.Surface&&!view.Surface.IsDisposed,'Reconnect failed');
  report.component={burstRequests:10000,burstFrames:paints-before-2,statistics:view.Statistics};
  view.remove();paint.Dispose();
  assert(report.backends.length===3,'Missing backend');
  return report;
 }finally{fonts.Dispose();animation.Dispose();}
}
