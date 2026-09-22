# SkiaSharp Web 0.5.1

Browser startup now loads JavaScript and compiles WASM concurrently. The new side-effect-free `@wieslawsoltes/skiasharpweb/wasm` entry supports bounded, retry-safe compilation and sharing compiled code between workers while retaining independent native instances and heaps. `Initialize({ wasmModule, wasmUrl })` accepts precompiled code and exact asset URLs.

A deterministic JavaScript-only post-link correction makes the bundled loader honor precompiled modules and propagates instantiation failures without an unhandled internal ready promise. Original/generated loader hashes are recorded. The qualified native WASM binary, native rendering paths, shaders, text shaping, and raster quality settings are unchanged.

Regression tests count real compiled-module versus byte instantiations, verify independent native surfaces, cache bounds, MIME fallback, cancellation isolation, and error propagation. Existing cross-platform package, native/.NET, installed-browser and publication gates remain required. See `docs/STARTUP.md` for ownership and compatibility details. No universal startup-time or physical-GPU qualification claim is made.
