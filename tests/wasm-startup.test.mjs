import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { CompileWasmAsync, ClearWasmModuleCache, InstantiateWasmAsync } from '../dist/lib/wasm.js';

const originalFetch = globalThis.fetch;
const empty = new Uint8Array([0,97,115,109,1,0,0,0]);
afterEach(() => { globalThis.fetch = originalFetch; ClearWasmModuleCache(); });
function serve(type = 'application/wasm') {
  let count = 0;
  globalThis.fetch = async () => { count++; return new Response(empty, {headers:{'content-type':type}}); };
  return () => count;
}
test('concurrent and resolved requests reuse one compiled module and one fetch', async () => {
  const count = serve(), a = CompileWasmAsync('https://example.test/skia.wasm');
  assert.equal(a, CompileWasmAsync('https://example.test/skia.wasm'));
  const module = await a;
  assert.equal(await CompileWasmAsync('https://example.test/skia.wasm'), module);
  assert.equal(count(), 1);
});
for (const type of ['application/octet-stream', 'text/plain', 'application/wasm; charset=utf-8']) {
  test(`a non-streaming MIME (${type}) consumes the same response once`, async () => {
    const count = serve(type);
    assert.ok(await CompileWasmAsync('https://example.test/mime.wasm') instanceof WebAssembly.Module);
    assert.equal(count(), 1);
  });
}
test('HTTP failures are actionable and evicted so an explicit retry succeeds', async () => {
  globalThis.fetch = async () => new Response('missing', {status:404});
  await assert.rejects(CompileWasmAsync('https://example.test/missing.wasm'), /404.*missing.wasm/);
  const count = serve();
  await CompileWasmAsync('https://example.test/missing.wasm');
  assert.equal(count(), 1);
});
test('corrupt binaries fail without refetching and do not poison retries', async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(new Uint8Array([1]), {headers:{'content-type':'application/wasm'}}); };
  await assert.rejects(CompileWasmAsync('https://example.test/corrupt.wasm'), WebAssembly.CompileError);
  assert.equal(requests, 1);
  serve();
  await CompileWasmAsync('https://example.test/corrupt.wasm');
});
test('cache bypass and LRU bounds are explicit', async () => {
  const count = serve();
  for (let i=0;i<5;i++) await CompileWasmAsync(`https://example.test/${i}.wasm`);
  await CompileWasmAsync('https://example.test/0.wasm');
  await CompileWasmAsync('https://example.test/0.wasm', {cache:false});
  assert.equal(count(), 7);
  ClearWasmModuleCache();
  await CompileWasmAsync('https://example.test/0.wasm');
  assert.equal(count(), 8);
});
test('clearing a pending entry cannot let its failure delete a newer successful entry', async () => {
  let fail;
  globalThis.fetch = () => new Promise((_, reject) => { fail = reject; });
  const old = CompileWasmAsync('https://example.test/race.wasm');
  ClearWasmModuleCache();
  const count = serve();
  const replacement = await CompileWasmAsync('https://example.test/race.wasm');
  fail(new Error('old request failed'));
  await assert.rejects(old);
  assert.equal(await CompileWasmAsync('https://example.test/race.wasm'), replacement);
  assert.equal(count(), 1);
});
test('aborted calls do not start I/O or cancel a shared consumer', async () => {
  const count = serve(), abort = new AbortController();
  const shared = CompileWasmAsync('https://example.test/abort.wasm');
  abort.abort();
  await assert.rejects(CompileWasmAsync('https://example.test/abort.wasm', {signal:abort.signal}), {name:'AbortError'});
  assert.ok(await shared instanceof WebAssembly.Module);
  assert.equal(count(), 1);
});
test('signaled requests are independently fetched', async () => {
  const count = serve(), controller = new AbortController();
  await Promise.all([CompileWasmAsync('https://example.test/signal.wasm'),
    CompileWasmAsync('https://example.test/signal.wasm', {signal:controller.signal})]);
  assert.equal(count(), 2);
});
test('bad options and module/factory arguments reject as promises', async () => {
  await assert.rejects(CompileWasmAsync('bad', null), TypeError);
  await assert.rejects(InstantiateWasmAsync(null, new WebAssembly.Module(empty)), TypeError);
  await assert.rejects(InstantiateWasmAsync(() => {}, {}), TypeError);
  await assert.rejects(InstantiateWasmAsync(() => {}, new WebAssembly.Module(empty), {instantiateWasm(){}}), /custom/);
});
test('asynchronous receive exceptions reject instead of hanging initialization', async () => {
  const factory = options => {
    options.instantiateWasm({}, () => { throw new Error('receive failed'); });
    return new Promise(() => {});
  };
  await assert.rejects(InstantiateWasmAsync(factory, new WebAssembly.Module(empty)), /receive failed/);
});
test('asynchronous link errors reject instead of hanging initialization', async () => {
  const module = new WebAssembly.Module(empty);
  const original = WebAssembly.instantiate;
  WebAssembly.instantiate = async () => { throw new WebAssembly.LinkError('link failed'); };
  try {
    await assert.rejects(InstantiateWasmAsync(o => {
      o.instantiateWasm({}, () => {}); return new Promise(() => {});
    }, module), /link failed/);
  } finally { WebAssembly.instantiate = original; }
});
test('factory throw, rejection and Emscripten abort propagate', async () => {
  const module = new WebAssembly.Module(empty);
  await assert.rejects(InstantiateWasmAsync(() => {throw new Error('sync');}, module), /sync/);
  await assert.rejects(InstantiateWasmAsync(async () => {throw new Error('async');}, module), /async/);
  let notification;
  await assert.rejects(InstantiateWasmAsync(o => {o.onAbort('native abort');return new Promise(() => {});},
    module, {onAbort:reason=>notification=reason}), /native abort/);
  assert.equal(notification,'native abort');
});
test('real CanvasKit instances share compiled code, never mutable native heaps', async () => {
  const factory = createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs');
  const module = await WebAssembly.compile(await readFile(new URL('../dist/vendor/canvaskit.wasm', import.meta.url)));
  const originalInstantiate = WebAssembly.instantiate;
  let moduleCalls=0, byteCalls=0;
  WebAssembly.instantiate = function(input, ...args) {
    if (input instanceof WebAssembly.Module) moduleCalls++; else byteCalls++;
    return originalInstantiate.call(WebAssembly,input,...args);
  };
  let a,b;
  try { [a,b] = await Promise.all([InstantiateWasmAsync(factory,module), InstantiateWasmAsync(factory,structuredClone(module))]); }
  finally { WebAssembly.instantiate = originalInstantiate; }
  assert.equal(moduleCalls,2); assert.equal(byteCalls,0,'The native loader must not silently ignore precompiled code.');
  assert.notEqual(a,b); assert.notEqual(a.HEAPU8.buffer,b.HEAPU8.buffer);
  const sa=a.MakeSurface(16,16),sb=b.MakeSurface(16,16);
  try {
    sa.getCanvas().clear(a.Color(255,0,0,1));sb.getCanvas().clear(b.Color(0,0,255,1));
    const ia=sa.makeImageSnapshot(),ib=sb.makeImageSnapshot();
    try {
      assert.notDeepEqual(ia.encodeToBytes(),ib.encodeToBytes());
      assert.ok(ia.encodeToBytes().length>0);
    } finally {ia.delete();ib.delete();}
  } finally {sa.delete();sb.delete();}
});

test('incompatible precompiled native module rejects without an unhandled ready promise', async () => {
  const factory=createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs');
  await assert.rejects(InstantiateWasmAsync(factory,new WebAssembly.Module(empty)));
});
