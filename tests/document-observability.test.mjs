import test from 'node:test';import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{createRequire}from'node:module';import{execFileSync}from'node:child_process';
import{Initialize}from'../dist/lib/index.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:[{data:readFileSync(new URL('../dist/fonts/DejaVuSans.ttf',import.meta.url)),family:'DejaVu Sans'}],isolated:true});
const probe=new K._SkiaSharpDocument(true),available=typeof probe.rasterDiagnostics==='function';probe.delete();
if(process.env.SKIA_REQUIRE_PDF_DIAGNOSTICS==='1')assert(available,'This qualification run requires the rebuilt native PDF extension');
const out=new URL('../test-output/document-observability/',import.meta.url);mkdirSync(out,{recursive:true});
const save=(name,doc)=>{const data=doc.ToData();try{const path=new URL(name,out);writeFileSync(path,data.AsSpan());return path.pathname;}finally{data.Dispose();}};
const parse=path=>JSON.parse(execFileSync('python3',['-c',`import fitz,json,sys
p=fitz.open(sys.argv[1])[0];pix=p.get_pixmap()
print(json.dumps(dict(images=len(p.get_images()),text=p.get_text(),pixel=pix.pixel(20,20),drawings=len(p.get_drawings()))))`,path],{encoding:'utf8'}));

test('native PDF vertices produce actual pixels instead of silently empty pages',()=>{
 for(const pictureMode of ['direct','recorded','deserialized']){
  const doc=S.SKDocument.CreatePdf(),canvas=doc.BeginPage(100,100),p=new S.SKPaint({Color:S.SKColors.White}),v=S.SKVertices.CreateCopy(S.SKVertexMode.Triangles,[10,10,90,10,10,90],null,[S.SKColors.Red,S.SKColors.Green,S.SKColors.Blue]);
  let picture,recorder,data;
  try{
   canvas.Clear(S.SKColors.White);
   if(pictureMode==='direct')canvas.DrawVertices(v,S.SKBlendMode.Modulate,p);
   else {recorder=new S.SKPictureRecorder();recorder.BeginRecording(S.SKRect.Create(100,100)).DrawVertices(v,S.SKBlendMode.Modulate,p);picture=recorder.EndRecording();if(pictureMode==='deserialized'){data=picture.Serialize();picture.Dispose();picture=S.SKPicture.Deserialize(data);}canvas.DrawPicture(picture);}
   const report=parse(save('vertices-'+pictureMode+'.pdf',doc));assert(report.images>0);assert(report.pixel[0]<250||report.pixel[1]<250||report.pixel[2]<250,JSON.stringify(report));
   if(available){assert(doc.RasterDiagnostics.AdapterEventCount>0);assert(doc.RasterFallbacks.some(e=>e.Stage==='AdapterRasterLayer'));}
  }finally{data?.Dispose();picture?.Dispose();recorder?.Dispose();v.Dispose();p.Dispose();doc.Dispose();}
 }
});
test('native diagnostics distinguish existing image assets from generated raster decisions',()=>{
 const doc=S.SKDocument.CreatePdf(),c=doc.BeginPage(80,80),paint=new S.SKPaint({Color:S.SKColors.Red}),image=S.SKImage.FromPixels(new S.SKImageInfo(2,2),new Uint8Array(16).fill(255));
 try{
  c.DrawRect(4,4,20,20,paint);c.DrawImage(image,30,30);doc.Close();
  if(available){assert.equal(doc.RasterFallbackReporting,'NativeDecisionSites');assert.equal(doc.RasterDiagnostics.Total,0);assert.deepEqual(doc.RasterFallbacks,[]);}
  else {assert.equal(doc.RasterFallbackReporting,'UnavailableNative');assert.equal(doc.RasterDiagnostics,null);}
 }finally{paint.Dispose();image.Dispose();doc.Dispose();}
});
test('real PDF raster decisions include mask and filtered-layer branches; snapshots are detached',{skip:!available},()=>{
 const d=S.SKDocument.CreatePdf({DiagnosticsLimit:32}),c=d.BeginPage(100,100),f=S.SKMaskFilter.CreateBlur(S.SKBlurStyle.Normal,3),p=new S.SKPaint({Color:S.SKColors.Red,MaskFilter:f});
 try{c.DrawCircle(40,40,15,p);d.Close();if(available){const r=d.RasterDiagnostics;assert(r.Events.some(e=>e.Reason==='mask-filter'));assert(r.Events.every(e=>e.Page===1&&e.Bounds.length===4&&e.CoordinateSpace));r.Events[0].Reason='modified';assert.notEqual(d.RasterFallbacks[0].Reason,'modified');}}finally{p.Dispose();f.Dispose();d.Dispose();}
});
test('native diagnostics retain total event counts with bounded storage and independent documents',{skip:!available},()=>{
 const a=S.SKDocument.CreatePdf({DiagnosticsLimit:1}),b=S.SKDocument.CreatePdf({DiagnosticsLimit:0}),p=new S.SKPaint({Color:S.SKColors.Red}),f=S.SKMaskFilter.CreateBlur(S.SKBlurStyle.Normal,2);p.MaskFilter=f;
 try{for(const d of[a,b]){for(let page=0;page<2;page++){const c=d.BeginPage(40,40);for(let i=0;i<5;i++)c.DrawCircle(8+i*3,15,3,p);d.EndPage();}d.Close();}if(available){assert(a.RasterDiagnostics.Total>=10);assert.equal(a.RasterFallbacks.length,1);assert.equal(a.RasterDiagnostics.Dropped,a.RasterDiagnostics.Total-1);assert.equal(b.RasterFallbacks.length,0);assert(b.RasterDiagnostics.Total>=10);assert.equal(b.RasterDiagnostics.Dropped,b.RasterDiagnostics.Total);}}finally{p.Dispose();f.Dispose();a.Dispose();b.Dispose();}
});
test('native strict-vector gate rejects before stream publication and cannot be bypassed by a zero diagnostic budget',()=>{
 if(!available){assert.throws(()=>S.SKDocument.CreatePdf({NativeBackend:true,StrictVector:true}),/compiled PDF/);return;}
 let writes=0;const d=S.SKDocument.CreatePdf({Write(){writes++;return true;}},{NativeBackend:true,StrictVector:true,DiagnosticsLimit:0}),c=d.BeginPage(80,80),f=S.SKImageFilter.CreateBlur(3,3),p=new S.SKPaint({ImageFilter:f,Color:S.SKColors.Red});
 try{c.DrawCircle(40,40,10,p);assert.throws(()=>d.Close(),/raster decision/);assert.equal(writes,0);assert(d.RasterDiagnostics.Total>0);assert.throws(()=>d.ToData(),/raster decision/);}finally{p.Dispose();f.Dispose();d.Dispose();}
});
test('native strict-vector writer retains actual searchable text and no image objects for a vector-only scene',{skip:!available},()=>{
 if(!available)return;
 const d=S.SKDocument.CreatePdf({NativeBackend:true,StrictVector:true}),c=d.BeginPage(120,80),font=new S.SKFont(null,14),p=new S.SKPaint({Color:S.SKColors.Black});
 try{c.DrawRect(2,2,12,12,p);c.DrawText('Searchable vector',5,50,font,p);const report=parse(save('strict-vector.pdf',d));assert.equal(report.images,0);assert.match(report.text,/Searchable vector/);assert.equal(d.RasterDiagnostics.Total,0);}finally{p.Dispose();font.Dispose();d.Dispose();}
});
test('SVG default keeps text nodes and optional flags produce outlines with validated stream lifetime',()=>{
 const font=new S.SKFont(null,20),p=new S.SKPaint({Color:S.SKColors.Red});
 try{for(const flags of[0,1,2,4,7]){if(!available&&flags!==1)continue;const stream=new S.SKDynamicMemoryWStream(),c=S.SKSvgCanvas.Create(S.SKRect.Create(160,80),stream,flags);c.DrawText('SVG text',5,30,font,p);c.Dispose();c.Dispose();const data=stream.DetachAsData(),xml=new TextDecoder().decode(data.AsSpan());data.Dispose();stream.Dispose();if(flags&1){assert(!/<text\b/.test(xml));assert(/<path\b/.test(xml));}else assert(/<text\b/.test(xml));assert.throws(()=>c.DrawText('expired',0,0,font,p),/disposed/);}}
 finally{font.Dispose();p.Dispose();}
});


test('canonical font callbacks preserve native path/matrix decomposition and callback lifetime',{skip:!S.SKFont.HasCanonicalPathCallbacks},()=>{
 const font=new S.SKFont(null,24,1.25,.2);let borrowed,retained;
 try{
  const ids=font.GetGlyphs('A');font.GetGlyphPaths(ids,(path,matrix)=>{
   assert(path);assert(!matrix.IsIdentity);borrowed=path;retained=path.Clone();
   retained.Transform(matrix);const direct=font.GetGlyphPath(ids[0]);
   try{const actual=retained.Points,expected=direct.Points;assert.equal(actual.length,expected.length);actual.forEach((p,i)=>{assert(Math.abs(p.X-expected[i].X)<.0001);assert(Math.abs(p.Y-expected[i].Y)<.0001);});}finally{direct.Dispose();}
  });
  assert(borrowed.IsDisposed);assert(!retained.IsDisposed);
  assert.throws(()=>font.GetGlyphPaths(ids,path=>{borrowed=path;throw Error('consumer');}),/consumer/);assert(borrowed.IsDisposed);
 }finally{retained?.Dispose();font.Dispose();}
});
