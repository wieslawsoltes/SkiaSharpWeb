import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ClearWasmModuleCache } from '../dist/lib/wasm.js';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;ClearWasmModuleCache();});

test('browser initialization starts native I/O before the loader script completes', async () => {
  const {Initialize}=await import('../dist/lib/index.js?startup-waterfall-test');
  const nativeBytes=await readFile(new URL('../dist/vendor/canvaskit.wasm',import.meta.url));
  const documentOriginal=globalThis.document, factoryOriginal=globalThis.CanvasKitInit;
  let script,requests=0;
  globalThis.document={createElement:()=>({remove(){}}),head:{append:value=>script=value}};
  delete globalThis.CanvasKitInit;
  globalThis.fetch=async()=>{requests++;return new Response(nativeBytes,{headers:{'content-type':'application/wasm'}});};
  try {
    const pending=Initialize({isolated:true,fonts:false,scriptUrl:'https://example.test/loader.js',wasmUrl:'https://example.test/native.wasm'});
    assert.ok(script,'Loader insertion must begin immediately.');
    assert.equal(requests,1,'WASM fetch must not wait for script.onload.');
    globalThis.CanvasKitInit=createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs');
    script.onload();
    const api=await pending;
    assert.ok(api.SKSurface);assert.equal(requests,1,'Prepared code must prevent a second native fetch.');
  } finally {
    if(documentOriginal===undefined)delete globalThis.document;else globalThis.document=documentOriginal;
    if(factoryOriginal===undefined)delete globalThis.CanvasKitInit;else globalThis.CanvasKitInit=factoryOriginal;
  }
});
test('browser initialization accepts an existing compiled module without fetching WASM', async () => {
  const {Initialize}=await import('../dist/lib/index.js?startup-injection-test');
  const module=await WebAssembly.compile(await readFile(new URL('../dist/vendor/canvaskit.wasm',import.meta.url)));
  const original=globalThis.CanvasKitInit;let requests=0;
  globalThis.CanvasKitInit=createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs');
  globalThis.fetch=async()=>{requests++;throw new Error('Unexpected native fetch');};
  try {assert.ok((await Initialize({fonts:false,isolated:true,wasmModule:module})).SKSurface);assert.equal(requests,0);}
  finally{if(original===undefined)delete globalThis.CanvasKitInit;else globalThis.CanvasKitInit=original;}
});
