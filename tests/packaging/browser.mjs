import {Initialize,RegisterWebComponent,Version} from './node_modules/skiasharp-web/dist/package/browser.js';
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
window.packageResult=(async()=>{
 const S=await Initialize({assetBaseUrl:'./public/skia/'});
 assert(S.Version===Version,'version mismatch');assert(S.SKFontManager.Default.FontFamilies.length===0,'unexpected fonts');
 const report={version:Version,backends:[],component:null};
 for(const backend of ['canvas','webgl','webgpu']){
  const element=document.createElement('canvas');element.width=64;element.height=64;document.body.append(element);
  const surface=await S.SKSurface.Create(element,{backend,allowFallback:false});
  const paint=new S.SKPaint({Color:S.SKColors.Red,IsAntialias:true}),path=new S.SKPath();
  try {
   path.MoveTo(8,8);path.CubicTo(56,8,56,56,8,56);path.Close();
   surface.Canvas.Clear(S.SKColors.White);surface.Canvas.DrawPath(path,paint);await surface.FlushAsync();
   const image=await surface.SnapshotAsync();try{const p=image.ReadPixels();assert(p.length===64*64*4,'pixel size');assert(p.some((v,i)=>i%4===1&&v<20),'no red path');}finally{image.Dispose();}
   report.backends.push({backend,mode:surface.RenderMode});
   if(backend==='webgpu')assert(surface.RenderMode==='skia-graphite-webgpu','not native Graphite');
  }finally{paint.Dispose();path.Dispose();await surface.DisposeAsync();element.remove();}
 }
 await RegisterWebComponent({assetBaseUrl:'./public/skia/'});
 const view=document.createElement('skia-canvas');view.setAttribute('backend','canvas');view.setAttribute('width','120');view.setAttribute('height','80');
 let frames=0;view.addEventListener('paintsurface',e=>{frames++;e.detail.Canvas.Clear(S.SKColors.Blue);});document.body.append(view);await view.InvalidateSurface();
 const before=frames,surface=view.Surface;await Promise.all(Array.from({length:100},()=>view.InvalidateSurface()));
 assert(frames===before+1,'uncoalesced paint');assert(view.Surface===surface,'surface reallocated');report.component={burst:100,frames:frames-before};view.remove();assert(surface.IsDisposed,'surface leaked');
 return report;
})();
