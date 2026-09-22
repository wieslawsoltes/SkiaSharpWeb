# Native engine startup

Version 0.5.1 preserves the qualified native WASM binary and all rendering paths.
It removes the browser loader -> WASM fetch waterfall: JavaScript loading and
streaming compilation now begin together. Existing initialized CanvasKit injection
and default/isolated runtime behavior are retained. `wasmUrl` selects an exact
native asset; `wasmModule` supplies precompiled code.

The standalone, side-effect-free `@wieslawsoltes/skiasharpweb/wasm` entry exports
`CompileWasmAsync(url, { cache, signal })`, `ClearWasmModuleCache()`, and
`InstantiateWasmAsync(factory, module, moduleOptions)`. It does not import the
graphics API, initialize a native runtime, allocate a native heap, or fetch fonts.

Compilation has a four-entry realm-local LRU of promises. Concurrent requests
share work. Rejected entries are evicted. `cache:false` bypasses it, and requests
with an AbortSignal remain independent to prevent one consumer aborting another.
Non-WASM server MIME types use buffered compilation of the same response.
Streaming compilation errors do not trigger a second request.

## Worker ownership

A WebAssembly.Module contains compiled code, not mutable instance state. Post it
as a structured-clone value, NOT in a transfer list. Instantiate independently
inside each worker. The native heaps, handles, surfaces and caches stay isolated;
this optimization does not reduce the memory needed for those independent heaps.
No SharedArrayBuffer, cross-origin isolation headers, eval or runtime source
rewriting is required. Browsers may restrict module cloning across agent clusters;
applications should handle messageerror by compiling inside the receiving worker.

```js
import { CompileWasmAsync } from '@wieslawsoltes/skiasharpweb/wasm';
const module = await CompileWasmAsync(new URL('./skia/canvaskit.wasm', import.meta.url));
worker.postMessage({ module }); // Do not put module in the transfer list.
```

A browser application can use `Initialize({ wasmModule: module, assetBaseUrl })`.
Manual worker integration can call `InstantiateWasmAsync(CanvasKitInit, module)`
and pass its initialized result into `Initialize({ CanvasKit })`.

## Qualified binary versus JavaScript glue

The bundled Emscripten 4.0.8 loader did not include `instantiateWasm` in its
incoming module API. A hook alone was silently ignored and fetched/compiled the
engine again. `scripts/packaging/prepare-wasm.mjs` applies one deterministic
JavaScript-only post-link transformation to accept `wasmModule`, and observes the
internal ready-promise rejection on failed instantiation. It records both original
and generated loader hashes in the native manifest. The 10,448,489-byte WASM
binary retains SHA-256 `698921da1c2d684dc52b9607cb2031aee9d9f4ddb06a6dca107265d684a73505`.
The transform validates all existing artifacts first and fails closed on an
unknown loader shape. No native C++ code or shader quality settings are changed.

The helper also supports the standard instantiateWasm hook for compatible external
Emscripten factories. Factory/link/receive/abort failures reject rather than leaving
the application's initialization promise pending.

## Validation

`node --test tests/wasm-startup.test.mjs` tests caching, failures, MIME fallback,
abort isolation and independent native instances. The real-loader test counts
WebAssembly.Module instantiations and requires ZERO byte instantiations; merely
checking that two surfaces rendered would miss an ignored hook.
The ordinary package/native/browser gates still apply. Performance depends on
network, browser code cache, backend and hardware; no universal timing is claimed.

References:
- https://emscripten.org/docs/api_reference/module.html
- https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Module
