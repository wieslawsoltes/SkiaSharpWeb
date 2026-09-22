/** Native code preparation only. Importing this module does no I/O and allocates
 * no native heap. Compiled modules may be cloned to workers; instances may not. */
const modules = new Map();
const capacity = 4;

export function CompileWasmAsync(url, options = {}) {
  try {
    if (!options || typeof options !== 'object') throw new TypeError('WASM options must be an object.');
    options.signal?.throwIfAborted();
    const key = new URL(url, globalThis.document?.baseURI ?? import.meta.url).href;
    // A caller-owned abort signal must not cancel another caller's shared load.
    const cache = options.cache !== false && !options.signal;
    if (cache && modules.has(key)) {
      const pending = modules.get(key);
      modules.delete(key); modules.set(key, pending);
      return pending;
    }
    const pending = (async () => {
      const response = await fetch(key, { signal: options.signal });
      if (!response.ok) throw new Error(`Could not load the Skia WASM engine (${response.status}): ${key}`);
      // Some static servers use application/octet-stream. Consume the same
      // response once, not a second network request on streaming failure.
      const streaming = typeof WebAssembly.compileStreaming === 'function'
        && response.headers.get('content-type')?.trim().toLowerCase() === 'application/wasm';
      const module = streaming
        ? await WebAssembly.compileStreaming(response)
        : await WebAssembly.compile(await response.arrayBuffer());
      options.signal?.throwIfAborted();
      return module;
    })();
    if (cache) {
      modules.set(key, pending);
      while (modules.size > capacity) modules.delete(modules.keys().next().value);
      pending.catch(() => { if (modules.get(key) === pending) modules.delete(key); });
    }
    return pending;
  } catch (error) { return Promise.reject(error); }
}

/** Drop this realm's references. Existing consumers and in-flight requests are
 * unaffected. No persistent cache or Service Worker is installed. */
export function ClearWasmModuleCache() { modules.clear(); }

/** Use the prepared native loader's wasmModule option (or Emscripten's hook for
 * compatible external factories). Every call constructs a new
 * instance with the factory's own imports/memory. Hook failures reject the outer
 * promise, including failures Emscripten itself otherwise only logs. */
export function InstantiateWasmAsync(factory, module, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof factory !== 'function') throw new TypeError('A CanvasKit initialization factory is required.');
      WebAssembly.Module.exports(module); // Also accepts modules cloned from another realm.
      if (!options || typeof options !== 'object') throw new TypeError('Module options must be an object.');
      if (options.instantiateWasm !== undefined) throw new TypeError('Do not combine wasmModule with a custom instantiateWasm hook.');
      const configured = { ...options, wasmModule: module,
        instantiateWasm(imports, receive) {
          WebAssembly.instantiate(module, imports).then(instance => {
            try { receive(instance, module); } catch (error) { reject(error); }
          }, reject);
          return {};
        },
        onAbort(reason) {
          try { options.onAbort?.(reason); }
          catch (error) { reject(error); return; }
          reject(reason instanceof Error ? reason : new Error(`CanvasKit initialization aborted: ${String(reason)}`));
        }
      };
      Promise.resolve(factory(configured)).then(resolve, reject);
    } catch (error) { reject(error); }
  });
}
