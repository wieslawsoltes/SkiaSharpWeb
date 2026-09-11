import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Initialize } from '../dist/lib/index.js';
const K = await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({
  wasmBinary: readFileSync(new URL('../dist/vendor/canvaskit.wasm', import.meta.url))
});
const S = await Initialize({ CanvasKit: K, isolated: true, fonts: false });

test('release runtime includes compiled tracing and native image identity, without mocks', () => {
  for (const name of ['SkiaSharpGraphicsDumpMemoryStatistics', 'SkiaSharpGaneshDumpMemoryStatistics', 'SkiaSharpImageUniqueID']) {
    assert.equal(typeof K[name], 'function', `The bundled engine must export ${name}`);
  }
  assert.equal(S.SKGraphics.GetCapabilities().NativeMemoryDump, true);
  assert.equal(S.SKGraphics.GetCapabilities().GaneshMemoryDump, true);
});

test('actual Skia memory callbacks return numeric, unit-bearing cache statistics', () => {
  class Capture extends S.SKTraceMemoryDump {
    constructor() { super(true, true); this.rows = []; }
    OnDumpNumericValue(name, key, units, value) { this.rows.push({ name, key, units, value }); }
  }
  const capture = new Capture(), aggregate = new S.SKMemoryTrace();
  try {
    S.SKGraphics.DumpMemoryStatistics(capture);
    assert(capture.rows.length > 0, 'Native cache statistics must be observable');
    for (const row of capture.rows) {
      assert.equal(typeof row.name, 'string'); assert.equal(typeof row.units, 'string');
      assert(typeof row.value === 'bigint' || Number.isSafeInteger(row.value));
      assert(row.value >= 0);
    }
    S.SKGraphics.DumpMemoryStatistics(aggregate);
    assert(aggregate.Entries.some(row => row.Name.includes('sk_glyph_cache')));
    const detached = aggregate.Entries; detached[0].Values = {};
    assert(Object.keys(aggregate.Entries[0].Values).length > 0);
    assert.doesNotThrow(() => JSON.parse(aggregate.ToJson()));
  } finally { capture.Dispose(); aggregate.Dispose(); }
  assert.throws(() => S.SKGraphics.DumpMemoryStatistics(capture), /disposed/i);
});

test('native image IDs identify aliases and distinguish independent pixel images', () => {
  const info = new S.SKImageInfo(4, 4), pixels = new Uint8Array(64).fill(255);
  const image = S.SKImage.FromPixels(info, pixels, 16), other = S.SKImage.FromPixels(info, pixels, 16);
  const alias = image._native.clone();
  try {
    const id = K.SkiaSharpImageUniqueID(image._native);
    assert(Number.isInteger(id) && id > 0);
    assert.equal(K.SkiaSharpImageUniqueID(alias), id);
    assert.notEqual(K.SkiaSharpImageUniqueID(other._native), id);
    image.Dispose();
    assert.equal(K.SkiaSharpImageUniqueID(alias), id);
  } finally { alias.delete(); image.Dispose(); other.Dispose(); }
});
