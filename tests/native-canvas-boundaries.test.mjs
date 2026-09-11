import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Initialize} from '../dist/lib/index.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
test('native SetMatrix/ResetMatrix recover singular 3x3 and 4x4 transforms without losing clips',()=>{
 const surface=S.SKSurface.Create(new S.SKImageInfo(80,80)),c=surface.Canvas;
 try{
  c.ClipRect(new S.SKRect(2,3,60,70));const clip=c.DeviceClipBounds.ToArray();
  for(const singular of [S.SKMatrix.CreateScale(0,0),S.SKMatrix44.CreateScale(0,0,0)]){
   c.SetMatrix(singular);c.ResetMatrix();assert(c.TotalMatrix.IsIdentity);assert.deepEqual(c.DeviceClipBounds.ToArray(),clip);
   c.SetMatrix(singular);const m=S.SKMatrix44.CreateTranslation(12,19,0);c.SetMatrix(m);
   assert.deepEqual(c.TotalMatrix44.ToRowMajor(),m.ToRowMajor());assert.deepEqual(c.TotalMatrix.ToArray(),S.SKMatrix.CreateTranslation(12,19).ToArray());
  }
  c.ResetMatrix();const saved=c.Save();c.Translate(6,8);const m=c.TotalMatrix44;c.Scale(0,0);c.SetMatrix(m);assert.equal(c.TotalMatrix.TransX,6);assert.equal(c.TotalMatrix.TransY,8);c.RestoreToCount(saved);assert(c.TotalMatrix.IsIdentity);
 }finally{surface.Dispose();}
});
test('native local clip bounds and classification survive transformed, circular and empty clips',()=>{
 const surface=S.SKSurface.Create(new S.SKImageInfo(80,80)),c=surface.Canvas,path=new S.SKPath();
 try{
  assert(c.IsClipRect);c.ClipRect(new S.SKRect(10,12,50,60));c.Translate(2,4);c.Scale(2,2);
  const expected=new S.SKRect(...K.SkiaSharpNative.Canvas.LocalClipBounds(c._native)),out=new S.SKRect();
  assert(c.LocalClipBounds.Equals(expected));assert(c.GetLocalClipBounds(out));assert(out.Equals(expected));
  const saved=c.Save();path.AddCircle(15,15,8);c.ClipPath(path);assert.equal(c.IsClipRect,false);c.RestoreToCount(saved);assert(c.IsClipRect);
  c.ClipRect(new S.SKRect(200,200,201,201));assert.equal(c.GetLocalClipBounds(out),false);assert.equal(c.IsClipRect,false);
 }finally{path.Dispose();surface.Dispose();}
});
