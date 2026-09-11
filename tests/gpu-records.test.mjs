import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = process.env.SKIA_WEB_ROOT || new URL('..', import.meta.url).pathname;
const native = process.env.SKIA_NATIVE_DIR || path.join(root, 'dist/vendor');
const { Initialize } = await import(pathToFileURL(path.join(root, 'dist/lib/index.js')));
const { installGpuRecords } = await import(process.env.SKIA_GPU_RECORDS_MODULE || pathToFileURL(path.join(root, 'dist/lib/gpu-records.js')));
const K = await createRequire(import.meta.url)(path.join(native, 'canvaskit.cjs'))({ wasmBinary: fs.readFileSync(path.join(native, 'canvaskit.wasm')) });
const S = await Initialize({ CanvasKit: K, isolated: true, fonts: false });
installGpuRecords(K, S);

test('Graphite option records compare every field and preserve equal-value hashes', () => {
  for (const [Type, values] of [
    [S.SKGraphiteContextOptions, { DisableDriverCorrectnessWorkarounds: true, InternalMultisampleCount: 8, GpuBudgetInBytes: 1024, RequireOrderedRecordings: true, SetBackendLabels: true }],
    [S.SKGraphiteSubmitInfo, { Sync: true, MarkBoundary: true, FrameID: 123456789n }],
  ]) {
    const a = new Type(values), b = new Type(values);
    assert(a.Equals(b)); assert.equal(a.GetHashCode(), b.GetHashCode());
    assert(!a.Equals(null)); assert(!a.Equals({ ...values }));
    for (const [key, value] of Object.entries(values)) {
      const c = new Type(values); c[key] = typeof value === 'boolean' ? !value : typeof value === 'bigint' ? value + 1n : value + 1;
      assert(!a.Equals(c), key);
    }
  }
});
test('recording records compare clips by value and native resource wrappers by identity', () => {
  const recording = {}, surface = {};
  const a = new S.SKGraphiteInsertRecordingInfo(recording, { TargetSurface: surface, TargetTranslationX: 2, TargetTranslationY: 3, TargetClip: new S.SKRectI(1, 2, 30, 40) });
  const b = new S.SKGraphiteInsertRecordingInfo(recording, { ...a, TargetClip: new S.SKRectI(1, 2, 30, 40) });
  assert(a.Equals(b)); assert.equal(a.GetHashCode(), b.GetHashCode());
  b.TargetClip.Right++; assert(!a.Equals(b)); b.TargetClip.Right--;
  b.Recording = {}; assert(!a.Equals(b));
  const c = new S.SKGraphiteInsertRecordingInfo(null), d = new S.SKGraphiteInsertRecordingInfo(null, { TargetClip: new S.SKRectI() });
  assert(c.Equals(d)); assert.equal(c.GetHashCode(), d.GetHashCode());
});
test('Dawn initializer fields retain browser handle identity and reject process addresses', () => {
  const queue = { submit() {} }, device = { queue, createCommandEncoder() {} }, instance = { requestAdapter() {} };
  const a = new S.SKGraphiteDawnBackendContextInit({ Device: device, Instance: instance });
  const b = new S.SKGraphiteDawnBackendContextInit({ Device: device, Instance: instance, Queue: queue });
  assert(a.Equals(b)); assert.equal(a.GetHashCode(), b.GetHashCode());
  assert.equal(a.WgpuDevice, device); assert.equal(a.Queue, queue); assert.equal(a.NonYielding, true);
  for (const key of ['Device', 'Queue', 'Instance']) assert.throws(() => { b[key] = 1234; }, /native pointer/);
  b.NonYielding = false; assert(!a.Equals(b)); assert.throws(() => b.WgpuDevice, /NonYielding/);
  b.NonYielding = true; b.Queue = { submit() {} }; assert.throws(() => b.WgpuDevice, /selected GPUDevice/);
});
test('native cache rejects invalid owners and has idempotent empty disposal', () => {
  const cache = new S.SKGraphiteImageCache();
  assert.throws(() => cache.FindOrCreate(null, null), /recorder/);
  assert.equal(cache.GetStatistics().Count, 0); cache.Dispose(); cache.Dispose();
});
