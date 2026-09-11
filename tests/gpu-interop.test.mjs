import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createGpuAPI } from '../dist/lib/gpu.js';
const root = process.env.SKIA_WEB_ROOT || new URL('..', import.meta.url).pathname;
const require = createRequire(import.meta.url);
const init = require(root + '/dist/vendor/canvaskit.cjs');
const K = await init({ wasmBinary: fs.readFileSync(root + '/dist/vendor/canvaskit.wasm') });
const { Initialize } = await import(pathToFileURL(root + '/dist/lib/index.js'));
const S = await Initialize({ CanvasKit: K, fonts: false, isolated: true });
// Controlled legacy-engine contract tests deliberately omit the native bridge;
// a JavaScript mock must never be passed as an embind GrDirectContext pointer.
const legacyK=Object.fromEntries(Object.entries(K).filter(([name])=>!name.startsWith('SkiaSharp')));
const legacy=createGpuAPI(legacyK,{...S,SKSurface:null,SKImage:null});
if (process.env.SKIA_GPU_MODULE || !S.GRContext) { const { createGpuAPI } = await import(process.env.SKIA_GPU_MODULE || '../dist/lib/gpu.js'); Object.assign(S, createGpuAPI(K, S)); }

test('GPU capability probes distinguish the bundled Graphite engine from stock CanvasKit', () => {
  assert.equal(S.NativeGpuCapabilities.GaneshWebGL, true);
  assert.equal(S.NativeGpuCapabilities.GraphiteDawn, true);
  assert.equal(S.SKGraphiteContext.IsBackendAvailable(S.SKGraphiteBackend.Dawn), true);
  assert.equal(legacy.NativeGpuCapabilities.GraphiteDawn,false);
  assert.throws(() => legacy.SKGraphiteContext.CreateDawn({ queue: {} }), /native Graphite bridge/);
  assert.throws(() => S.GRContext.CreateVulkan({}), /process-local native/);
});
test('GPU factories preserve actual raster drawing and backend reporting', () => {
  const surface = S.SKSurface.Create(new S.SKImageInfo(6, 4));
  surface.Canvas.Clear(S.SKColors.Red); surface.Flush();
  assert.equal(surface.Context, null);
  const image = surface.Snapshot(); assert.equal(image.ReadPixels()[0], 255); image.Dispose(); surface.Dispose();
});
test('GL descriptors retain object identities, size and destruction semantics', () => {
  const texture = {}, info = new S.GRGlTextureInfo(0x0de1, texture, 0x8058);
  const target = new S.GRBackendTexture(40, 20, true, info);
  assert.equal(target.IsValid, true); assert.equal(target.Width, 40); assert.equal(target.Height, 20);
  assert.equal(target.HasMipMaps, true); assert.equal(target.GetGlTextureInfo().Id, texture);
  assert.ok(target.GetGlTextureInfo().Equals(info)); const out = {}; assert.ok(target.GetGlTextureInfo(out)); assert.equal(out.Id, texture);
  target.Dispose(); assert.equal(target.IsValid, false); assert.throws(() => target.GetGlTextureInfo(), /disposed/);
  assert.throws(() => new S.GRBackendRenderTarget(0, 10), /positive integer/);
});
test('default framebuffer zero remains a valid backend descriptor', () => {
  const info = new S.GRGlFramebufferInfo(0, 0x8058), target = new S.GRBackendRenderTarget(100, 80, 0, 8, info);
  assert.equal(target.IsValid, true); assert.equal(target.Backend, S.GRBackend.OpenGL);
  assert.equal(target.StencilBits, 8); assert.equal(target.GetGlFramebufferInfo().FramebufferObjectId, 0); target.Dispose();
});
test('controlled Ganesh cache contract fixes CanvasKit getter wrapper lost returns', () => {
  let limit = 4096, current = false, disposed = 0, abandoned = false;
  const native = { getResourceCacheLimitBytes() { current = true; }, _getResourceCacheLimitBytes() { assert.ok(current); return limit; }, _getResourceCacheUsageBytes() { assert.ok(current); return 312; }, setResourceCacheLimitBytes(value) { limit = value; }, releaseResourcesAndAbandonContext() { abandoned = true; }, delete() { disposed++; } };
  const context = new legacy.GRContext(native, new legacy.GRGlInterface(1));
  assert.equal(context.GetResourceCacheLimit(), 4096); context.SetResourceCacheLimit(8192); assert.equal(context.GetResourceCacheLimit(), 8192);
  assert.deepEqual(context.GetResourceCacheUsage(), { ResourceCount: null, ResourceBytes: 312, ResourceCountAvailable: false });
  context.PurgeResources(); assert.equal(limit, 8192); assert.throws(() => context.PurgeUnusedResources(100), /native Ganesh extension/);
  assert.throws(() => context.SetResourceCacheLimit(-1), /non-negative/);
  assert.throws(() => context.ResetContext(), /native Ganesh extension/);
  context.AbandonContext(true); assert.equal(abandoned, true); assert.equal(context.IsAbandoned, true);
  assert.throws(() => context.GetResourceCacheLimit(), /abandoned/); context.Dispose(); assert.equal(disposed, 1); context.Dispose(); assert.equal(disposed, 1);
});
test('controlled WebGPU readback removes row padding and swizzles BGRA', async () => {
  const mapped = new Uint8Array(512); mapped.set([3, 2, 1, 255, 6, 5, 4, 255]); mapped.set([9, 8, 7, 255, 12, 11, 10, 255], 256);
  let destroyed = false, unmapped = false, descriptor;
  const buffer = { async mapAsync() {}, getMappedRange() { return mapped.buffer; }, unmap() { unmapped = true; }, destroy() { destroyed = true; } };
  const device = { createBuffer(d) { descriptor = d; return buffer; }, createCommandEncoder() { return { copyTextureToBuffer(src, dst, size) { assert.equal(dst.bytesPerRow, 256); assert.equal(size.height, 2); }, finish() { return {}; } }; }, queue: { submit() {} } };
  const result = await S.ReadWebGPUTexture(device, { width: 2, height: 2, format: 'bgra8unorm' });
  assert.equal(descriptor.size, 512); assert.equal(result.RowBytes, 8);
  assert.deepEqual(Array.from(result.GetData()), [1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255]);
  assert.ok(destroyed && unmapped); result.Dispose(); assert.throws(() => result.GetData(), /disposed/);
});
test('controlled WebGPU readback cleans resources after failed mapping', async () => {
  let destroyed = false;
  const device = { createBuffer() { return { async mapAsync() { throw Error('device lost'); }, unmap() {}, destroy() { destroyed = true; } }; }, createCommandEncoder() { return { copyTextureToBuffer() {}, finish() { return {}; } }; }, queue: { submit() {} } };
  await assert.rejects(S.ReadWebGPUTexture(device, { width: 2, height: 2, format: 'rgba8unorm' }), /device lost/);
  assert.ok(destroyed);
  await assert.rejects(S.ReadWebGPUTexture(device, { width: 2, height: 2, format: 'rgba16float' }), /RGBA8/);
});
