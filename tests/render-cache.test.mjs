import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Initialize } from '../dist/lib/index.js';
const K = await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({ wasmBinary: fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm', import.meta.url)) });
const S = await Initialize({ CanvasKit: K, isolated: true, fonts: false });
const bitmap = color => { const b = new S.SKBitmap(8, 8); b.Erase(color); return b; };
function pixel(surface) { const image = surface.Snapshot(); try { return Array.from(image.ReadPixels().subarray(0, 4)); } finally { image.Dispose(); } }
test('Immutable bitmap cache reuses native snapshots and does not own caller images', () => {
  S.SKGraphics.PurgeBitmapCache(); const b = bitmap(S.SKColors.Red), surface = S.SKSurface.Create(new S.SKImageInfo(8, 8)); b.SetImmutable();
  const before = S.SKGraphics.GetBitmapCacheStatistics();
  for (let i = 0; i < 100; i++) surface.Canvas.DrawBitmap(b, 0, 0);
  const after = S.SKGraphics.GetBitmapCacheStatistics();
  assert.equal(after.Misses - before.Misses, 1); assert.equal(after.Hits - before.Hits, 99); assert.deepEqual(pixel(surface), [255, 0, 0, 255]);
  const image = S.SKImage.FromBitmap(b); b.Dispose(); assert.equal(S.SKGraphics.GetBitmapCacheStatistics().EntryCount, 0);
  surface.Canvas.DrawImage(image, 0, 0); image.Dispose(); assert.deepEqual(pixel(surface), [255, 0, 0, 255]); surface.Dispose();
});
test('Mutable bitmap draws remain uncached and reflect changes immediately', () => {
  S.SKGraphics.PurgeBitmapCache(); const b = bitmap(S.SKColors.Red), surface = S.SKSurface.Create(new S.SKImageInfo(8, 8));
  surface.Canvas.DrawBitmap(b, 0, 0); b.Erase(S.SKColors.Blue); surface.Canvas.DrawBitmap(b, 0, 0);
  assert.deepEqual(pixel(surface), [0, 0, 255, 255]); assert.equal(S.SKGraphics.GetBitmapCacheStatistics().EntryCount, 0); b.Dispose(); surface.Dispose();
});
test('Bitmap cache eviction, disable, disposal and resource purges release retained snapshots', () => {
  S.SKGraphics.PurgeBitmapCache(); const old = S.SKGraphics.SetBitmapCacheLimit(256), a = bitmap(S.SKColors.Red), b = bitmap(S.SKColors.Blue), surface = S.SKSurface.Create(new S.SKImageInfo(8, 8)); a.SetImmutable(); b.SetImmutable();
  try { surface.Canvas.DrawBitmap(a, 0, 0); surface.Canvas.DrawBitmap(b, 0, 0); assert.equal(S.SKGraphics.GetBitmapCacheStatistics().EntryCount, 1);
    surface.Canvas.DrawBitmap(a, 0, 0); assert.deepEqual(pixel(surface), [255, 0, 0, 255]);
    S.SKGraphics.PurgeResourceCache(); assert.equal(S.SKGraphics.GetBitmapCacheStatistics().RetainedBytes, 0);
    S.SKGraphics.SetBitmapCacheLimit(0); surface.Canvas.DrawBitmap(a, 0, 0); assert.equal(S.SKGraphics.GetBitmapCacheStatistics().EntryCount, 0);
    assert.throws(() => S.SKGraphics.SetBitmapCacheLimit(-1), RangeError);
  } finally { a.Dispose(); b.Dispose(); surface.Dispose(); S.SKGraphics.SetBitmapCacheLimit(old); }
});
test('Direct pixel notifications invalidate an existing immutable bitmap snapshot', () => {
  const b = bitmap(S.SKColors.Red), surface = S.SKSurface.Create(new S.SKImageInfo(8, 8)); b.SetImmutable(); surface.Canvas.DrawBitmap(b, 0, 0);
  const pixels = b.GetPixels(); for (let i = 0; i < pixels.length; i += 4) { pixels[i] = 0; pixels[i+1] = 255; pixels[i+2] = 0; pixels[i+3] = 255; }
  b.NotifyPixelsChanged(); surface.Canvas.DrawBitmap(b, 0, 0); assert.deepEqual(pixel(surface), [0, 255, 0, 255]); b.Dispose(); surface.Dispose();
});
test('Static bitmap factories release cached images through original base prototypes', () => {
  const a = bitmap(S.SKColors.Red), encoded = a.Encode(S.SKEncodedImageFormat.Png, 100);
  const b = S.SKBitmap.Decode(encoded), copy = b.Copy(); a.Dispose(); encoded.Dispose();
  const surface = S.SKSurface.Create(new S.SKImageInfo(8, 8));
  for (const value of [b, copy]) {
    value.SetImmutable(); surface.Canvas.DrawBitmap(value, 0, 0);
    assert.equal(S.SKGraphics.GetBitmapCacheStatistics().EntryCount, 1);
    value.Dispose(); assert.equal(S.SKGraphics.GetBitmapCacheStatistics().EntryCount, 0);
  }
  surface.Dispose();
});
