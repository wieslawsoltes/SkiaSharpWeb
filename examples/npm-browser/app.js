// With a bundler, use: import { RegisterWebComponent } from '@wieslawsoltes/skiasharpweb/browser';
// For this unbundled example, serve the project root after npm install:
import { RegisterWebComponent } from './node_modules/@wieslawsoltes/skiasharpweb/dist/package/browser.js';
try {
  const S=await RegisterWebComponent({ assetBaseUrl:'./public/skia/' });
  const view=document.querySelector('skia-canvas');
  view.addEventListener('paintsurface',({detail:{Canvas,Info,Surface}})=>{
    const paint=new S.SKPaint({Color:S.SKColors.Teal,IsAntialias:true});
    try { Canvas.Clear(S.SKColors.White);Canvas.DrawCircle(Info.Width/2,Info.Height/2,90,paint); }
    finally {paint.Dispose();}
    document.querySelector('#status').textContent=`${S.Version} · ${Surface.RenderMode}`;
  });
  view.addEventListener('surfaceerror',event=>document.querySelector('#status').textContent=event.detail.message);
  await view.InvalidateSurface();
} catch(error) { document.querySelector('#status').textContent=error.message; }
