# Compiled native Skia engine

The bundled engine now contains **Graphite/Dawn WebGPU, Ganesh/WebGL and Skia raster rendering in one WASM module**. It was compiled and linked in this project, initialized in Node, and executed through Dawn on the SwiftShader Vulkan software adapter. The normal web surface factory can use native Graphite; its complex drawing operations no longer depend on a complete CPU-rasterized frame upload.

This is a custom CanvasKit build from Skia `f446aec4ce9e0e95e0a504e875955de3eb521f75`, compiled with Emscripten **4.0.8**. The shipped `native-build-manifest.json` identifies the sources and hashes of the actual build. Physical GPU and browser driver behavior still require testing on the target devices; SwiftShader executes real WebGPU shaders but runs on the CPU.

## Included functionality

The build retains the full CanvasKit features: ICU/HarfBuzz paragraph shaping, FreeType/WOFF2 font loading, Skottie and resources, path operations, runtime shaders, pictures/serialization, image codecs, and all three rendering backends. Additional native bindings provide full path-effect composition and filtering, region scan conversion, specialized color/image filters, exact codec/encoder options, text-blob construction, native font metrics/instancing/fallback, PDF/SVG documents, color spaces, shader/runtime child types, and canvas state operations.

Graphite recorders have a native `ImageProvider`: raster and decoded images upload through Skia's GPU transfer tasks. An LRU cache keyed by immutable image identity and mipmap requirements prevents repeated uploads. Each recorder retains at most 256 images and at most one quarter of its GPU budget, capped at 64 MiB. `imageCacheStats()` reports actual uploads, hits, bytes and count; `purgeImageCache()` releases the retained image references. Ordinary rendering keeps the image textures resident on the GPU across frames.

## Rebuild

Requirements: a Linux x64 environment, Python 3, git, tar/xz, internet access for the pinned public dependencies, and sufficient disk/memory for the native compilation. The build script installs its Emscripten SDK into the specified work directory; it does not alter shell profiles or global toolchains.

```sh
python3 native/build_native.py \
  --work-dir /tmp/skiasharp-native \
  --output dist/vendor \
  --jobs 8
```

`build_native.py` checks out the pinned Skia and emsdk revisions, fetches only required dependencies, activates Emscripten 4.0.8, applies the source patches, compiles the combined backend, and emits `canvaskit.js`, `canvaskit.cjs`, `canvaskit.wasm` and `native-build-manifest.json` with SHA-256 hashes. `--build-dir` can select another build output directory relative to the Skia checkout. Repeated builds preserve existing native object files.

For an existing pinned checkout:

```sh
python3 native/prepare_native.py /path/to/skia \
  --emscripten /path/to/emsdk/upstream/emscripten
SKIA_EMSDK_DIR=/path/to/emsdk NATIVE_BUILD_JOBS=8 \
  BUILD_DIR=out/skiasharp_web /path/to/skia/modules/canvaskit/compile.sh webgpu
```

The preparation script is idempotent and checks the Skia revision before applying the patch. All bridge source files are included at the end of CanvasKit's binding translation unit to reuse its registered native object types.

## Why the source patches exist

The inspected upstream CanvasKit `webgpu` build still references the removed Ganesh/Dawn bridge while enabling Graphite. The patch excludes that obsolete bridge and adds Graphite-specific context, recorder, recording, backend texture and surface exports. It retains Ganesh and its WebGL JavaScript bindings alongside Graphite.

The WebAssembly target uses Emscripten's WebGPU C/C++ interface, so the patch removes the unrelated native Dawn CMake library dependency. Emscripten 4.0.8 needs matching C, C++ and JavaScript enum additions for current optional WebGPU features and texture formats used by the pinned Skia. These additions preserve existing ABI numbers. The browser/device's reported feature set still determines availability.

The Emscripten device-import helper is also repaired: an imported `GPUDevice` must retain its default queue handle. Queue references are released when the device wrapper is destroyed. Without that fix the native bridge cannot construct a Graphite context. Two upstream Emscripten-guarded Skia compile issues are patched without changing the desktop code paths.

The build enables native PDF and XML/SVG output, includes its local Expat dependency, and registers JPEG callbacks required by current Skia PDF. It removes Asyncify because the browser bridge uses non-yielding Graphite contexts and explicit asynchronous JavaScript completion. C++ remains optimized at `-O3`; WASM linking uses `-Oz` and preserves the public JavaScript binding names.

## GPU lifetime

A Graphite context borrows the browser `GPUDevice`; imported textures retain their WebGPU handles until their native descriptors are disposed. Dispose surfaces before recorders and recorders before their context. Wait for queue completion before destroying a context with pending work. The normal web component performs that sequencing; manual callers can use `SubmitAsync()` and `DisposeAsync()`.

The low-level Graphite API remains available:

```js
const context = S.SKGraphiteContext.CreateDawn(device);
const recorder = context.CreateRecorder();
const target = S.SKGraphiteBackendTexture.CreateDawn(texture);
const surface = S.SKSurface.CreateGraphite(recorder, target);
surface.Canvas.DrawCircle(80, 80, 32, paint);
surface.Flush();
await context.SubmitAsync();
const pixels = await S.ReadWebGPUTexture(device, texture);
// Dispose pixels, paint, surface and target, then recorder and context.
```

Browser main threads cannot synchronously wait for WebGPU completion. Use asynchronous snapshots/readback on Graphite surfaces. Native readback copies callback results into JavaScript-owned memory before releasing native buffers. Swapchain textures from `getCurrentTexture()` must not be cached across frames; the automatic web surface uses its own persistent texture and presents through WebGPU.

Desktop Metal/Vulkan/Direct3D process-local pointer imports cannot be passed through page JavaScript. Browser graphics access uses WebGPU or WebGL objects. The user agent chooses the physical native graphics API underneath WebGPU.

## Validation and source files

`native-validation.json` records the adapter, native feature probes and pixel assertions. The project verification report additionally records full gallery rendering, texture uploads, image cache behavior, native effects/font/codec checks and document validation. These tests identify software Vulkan execution explicitly.

- `skiasharp_gpu.cpp` and `.js`: combined Graphite/Ganesh interop, native font/resource cache bindings, image provider and asynchronous readback.
- `skiasharp_effects.cpp` and `.js`: native specialized effects, regions and raster-surface bindings.
- `skiasharp_fonts.cpp`: native font metrics, options, HarfBuzz variable instancing and registered-family fallback.
- `skiasharp_documents.cpp`: native PDF/SVG output with metadata and JPEG callbacks.
- `skiasharp_conformance.cpp` and `.js`: exact runtime uniform/child handling, color spaces, native HarfBuzz shaping and remaining native canvas/value operations.
- `skiasharp_encoders.cpp` and `skiasharp_assets.cpp`: encoder options, animated WebP, native codecs, image/text operations and texture conversion.
- `skia-webgpu.patch`: changes against the pinned Skia revision.
- `patch_emscripten_webgpu.py`: matching Emscripten ABI enum and import-lifetime fixes.
- `THIRD_PARTY_LICENSES.txt`: license notices for dependencies compiled into the engine.

Source: https://github.com/google/skia/tree/f446aec4ce9e0e95e0a504e875955de3eb521f75
