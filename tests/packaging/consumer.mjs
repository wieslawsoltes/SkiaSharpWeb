import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Initialize, Version, GetAssetUrls } from 'skiasharp-web';
import { Initialize as BrowserInitialize } from 'skiasharp-web/browser';
import { Initialize as CoreInitialize } from 'skiasharp-web/core';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),cjs=require('skiasharp-web');
assert.equal(cjs.Version,Version);
const [S,other]=await Promise.all([Initialize(),cjs.Initialize()]);assert.equal(S,other);
assert.equal(S.Version,Version);assert.equal(S.SKFontManager.Default.FontFamilies.length,0);
assert.equal((await BrowserInitialize({CanvasKit:S.CanvasKit})),S);
assert.equal((await CoreInitialize({CanvasKit:S.CanvasKit,fonts:false})),S);
assert.equal(require.resolve('skiasharp-web/canvaskit.wasm').endsWith('canvaskit.wasm'),true);
assert.equal((await readFile(new URL(GetAssetUrls().wasmUrl))).length>1000000,true);
const paint=new S.SKPaint({Color:S.SKColors.Red}),surface=S.SKSurface.Create(new S.SKImageInfo(16,16));
try {
  surface.Canvas.Clear(S.SKColors.White);surface.Canvas.DrawRect(0,0,8,16,paint);
  const image=surface.Snapshot();
  try {
    const px=image.ReadPixels();assert.deepEqual([...px.slice(0,4)],[255,0,0,255]);assert.deepEqual([...px.slice(12*4,13*4)],[255,255,255,255]);
    const encoded=image.Encode(S.SKEncodedImageFormat.Png,100);try {assert.deepEqual([...encoded.ToArray().slice(0,8)],[137,80,78,71,13,10,26,10]);}finally{encoded.Dispose();}
  }finally{image.Dispose();}
  const document=S.SKDocument.CreatePdf({NativeBackend:true,StrictVector:true});
  try {document.BeginPage(16,16).DrawRect(0,0,8,16,paint);const bytes=document.ToData();try{assert.equal(new TextDecoder().decode(bytes.ToArray().slice(0,5)),'%PDF-');}finally{bytes.Dispose();}}finally{document.Dispose();}
}finally{paint.Dispose();surface.Dispose();}
const abort=new AbortController();abort.abort();await assert.rejects(Initialize({signal:abort.signal}),{name:'AbortError'});
await assert.rejects(Initialize({fonts:true}),TypeError);
await assert.rejects(cjs.RegisterWebComponent(),/browser/);
console.log('Clean installed ESM/CJS consumers: native drawing, PNG, PDF, exports, initialization and cancellation passed.');
