/** Real native Graphite cache validation. Requires the optional webgpu package
 * and a Vulkan adapter; no browser or GPU handles are mocked in this script. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = process.env.SKIA_WEB_ROOT || new URL('..', import.meta.url).pathname;
const native = process.env.SKIA_NATIVE_DIR || path.join(root, 'dist/vendor');
const { Initialize } = await import(pathToFileURL(path.join(root, 'dist/lib/index.js')));
const { installGpuRecords } = await import(process.env.SKIA_GPU_RECORDS_MODULE || pathToFileURL(path.join(root, 'dist/lib/gpu-records.js')));
const { create, globals } = await import(process.env.SKIA_WEBGPU_MODULE || 'webgpu');
Object.assign(globalThis, globals);
const gpu = create(['backend=vulkan', 'enable-dawn-features=allow_unsafe_apis']);
const adapter = await gpu.requestAdapter(); assert(adapter, 'Real Dawn Vulkan adapter');
const device = await adapter.requestDevice();
const errors = []; device.addEventListener('uncapturederror', event => errors.push(event.error.message));
const K = await createRequire(import.meta.url)(path.join(native, 'canvaskit.cjs'))({ wasmBinary: fs.readFileSync(path.join(native, 'canvaskit.wasm')) });
const S = await Initialize({ CanvasKit: K, isolated: true, fonts: false }); installGpuRecords(K, S);
const init = new S.SKGraphiteDawnBackendContextInit({ Device: device, Instance: gpu });
const context = S.SKGraphiteContext.CreateDawn(init); assert(context);
const recorder = context.CreateRecorder(), secondRecorder = context.CreateRecorder();
const cache = new S.SKGraphiteImageCache();
const raster = S.SKImage.FromPixels(new S.SKImageInfo(2, 2), new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]));
const first = cache.FindOrCreate(recorder, raster, false);
const again = cache.FindOrCreate(recorder, raster, false);
assert.notEqual(first, again); assert(first._native.isAliasOf(again._native));
first.Dispose(); assert(!again.IsDisposed);
const alias = S.SKImage._fromNative(raster._native.clone());
const fromAlias = cache.FindOrCreate(recorder, alias, false); alias.Dispose();
assert(again._native.isAliasOf(fromAlias._native)); fromAlias.Dispose();
const mips = cache.FindOrCreate(recorder, raster, true);
const second = cache.FindOrCreate(secondRecorder, raster, false);
assert.equal(second._gpuOwner, secondRecorder); second.Dispose();
assert.throws(() => cache.FindOrCreate(secondRecorder, again), /another Graphite recorder/);
const hits = cache.GetStatistics(); assert.equal(hits.Uploads, 3); assert.equal(hits.Hits, 2); assert.equal(hits.Count, 3);
assert.throws(() => recorder.Dispose(), /Dispose Graphite surfaces/);
// Stress eviction with distinct immutable images. Caller wrappers can die while
// queued GPU uploads remain alive; the cache must cap its retained native refs.
for (let i = 0; i < 257; i++) {
  const source = S.SKImage.FromPixels(new S.SKImageInfo(1, 1), new Uint8Array([i % 256, 1, 2, 255]));
  const image = cache.FindOrCreate(recorder, source); source.Dispose(); image.Dispose();
}
assert.equal(cache.GetStatistics().Count, 256); assert.equal(cache.GetStatistics().Evictions, 4);
const statistics = cache.GetStatistics();
const texture = device.createTexture({ size: [8, 4], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST });
const backend = S.SKGraphiteBackendTexture.CreateDawn(texture), surface = S.SKSurface.CreateGraphite(recorder, backend);
raster.Dispose(); cache.Dispose(); cache.Dispose();
assert.equal(cache.GetStatistics().Count, 0);
surface.Canvas.Clear(S.SKColors.Black); surface.Canvas.DrawImage(again, 1, 1); surface.Canvas.DrawImage(mips, 5, 1);
again.Dispose(); mips.Dispose();
surface.Flush(); await context.SubmitAsync();
const result = await S.ReadWebGPUTexture(device, texture), pixels = result.GetData();
const pixel = (x, y) => [...pixels.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)];
for (const x of [1, 5]) {
  assert.deepEqual(pixel(x, 1), [255, 0, 0, 255]); assert.deepEqual(pixel(x + 1, 1), [0, 255, 0, 255]);
  assert.deepEqual(pixel(x, 2), [0, 0, 255, 255]); assert.deepEqual(pixel(x + 1, 2), [255, 255, 0, 255]);
}
const observed = [pixel(1, 1), pixel(2, 1), pixel(1, 2), pixel(2, 2)];
result.Dispose(); surface.Dispose(); backend.Dispose(); recorder.Dispose(); secondRecorder.Dispose(); await context.DisposeAsync(); texture.destroy();
const handles = { devices: Object.keys(K.WebGPU.mgrDevice.objects).length, queues: Object.keys(K.WebGPU.mgrQueue.objects).length, textures: Object.keys(K.WebGPU.mgrTexture.objects).length };
assert.deepEqual(handles, { devices: 0, queues: 0, textures: 0 }); assert.deepEqual(errors, []); device.destroy();
const report = { adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description }, physicalGpu: false, checks: ['browser Dawn initializer creates native Graphite context', 'native image upload and cache hits', 'distinct caller-owned wrappers share native cached image', 'native source aliases reuse upload', 'mipmapped variants and recorder ownership isolation', '256-entry LRU eviction', 'cache and raster source disposal before draw', 'returned image disposal before submit', 'exact RGBA readback', 'zero native handles after cleanup'], statistics, pixels: observed, handles, errors };
fs.writeFileSync(process.env.SKIA_GPU_RECORDS_REPORT || path.join(native, 'gpu-records-validation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2)); process.exit(0);
