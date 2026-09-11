# SkiaSharp Web 0.4 — verification and performance

This release extends the already compiled Graphite/Ganesh/raster engine with native memory tracing, precision-preserving GPU readback, bounded image/bitmap caches, frame-coalesced component rendering, and live browser/.NET verification. It does **not** claim exhaustive SkiaSharp parity or physical-GPU certification.

## Delivered runtime

The compiled WASM is committed under `dist/vendor/`. `native/build_native.py` builds the combined Skia Graphite/Dawn, Ganesh/WebGL and raster backend from pinned sources. The native build workflow completed compilation and its native-symbol/integration checks, then committed the actual binaries; these are not uncompiled bridge examples. The manifest records all output hashes and includes `skiasharp_memory.cpp`.

`SKTraceMemoryDump` and `SKMemoryTrace` receive native numeric/string/backing callbacks. `SKGraphics.DumpMemoryStatistics` and `GRContext.DumpMemoryStatistics` use the actual native engine. Counters above JavaScript's safe integer range use `BigInt`; `ToJson()` serializes them as decimal strings. Cache storage estimates are labeled separately from native memory statistics.

`SKGraphiteContext.RequestReadPixels` accepts both callback signatures, validates ownership and dimensions, dispatches rescale gamma/mode, preserves native pixel strides and color/alpha/color-space, and holds the context/color-space until readback completes. `SubmitAsync({ Sync: true })` now waits asynchronously without mutating the supplied record. Synchronous UI-thread waits remain unsupported.

`ReadWebGPUTexture` supports uncompressed color texture copies without reducing F16/F32 or integer components to RGBA8. Mip levels, array layers, copy usage, row padding and format identity are checked. `GetPixelSpan(Float32Array)` exposes a typed view; raw formats without an exact image-info mapping cannot masquerade as RGBA images. Compressed/depth/stencil decoding is not included. Optional device format features remain required by WebGPU.

```js
const pool = new S.SKGPUReadbackPool(device, {
  MaxBytes: 32 * 1024 * 1024,
  Capacity: 4
});
try {
  const result = await S.ReadWebGPUTexture(device, texture, { pool });
  try {
    const floats = result.GetPixelSpan(Float32Array); // rgba32float texture
    console.log(floats[0], result.RowBytes);
  } finally { result.Dispose(); }
} finally { pool.Dispose(); }
```

## Performance changes

`<skia-canvas>` now coalesces invalidations into animation frames and reuses its surface while dimensions/backend remain unchanged. Creation is single-flight; obsolete asynchronous surfaces are disposed rather than adopted. Disconnect/reconnect, resize, fallback canvas adoption, device loss, error handling and device-pixel-ratio changes have explicit lifetime handling. `InvalidateSurface()` returns an awaitable result; `RecreateSurface()` forces resource replacement. The paint event remains synchronous.

Immutable bitmap snapshots use a byte-bounded LRU cache, invalidated on disposal or pixel notification. Mutable bitmaps retain uncached semantics. `SKGraphiteImageCache` additionally uses native image IDs for constant-time alias lookup, recorder-specific ownership, count/byte budgets and independent returned image ownership. Oversized textures bypass retention. Staging buffers are reusable through `SKGPUReadbackPool`; its byte/count budgets bound idle storage, not all simultaneous caller allocations.

A repeated-bitmap benchmark, run with the shipped WASM on Node 22.16.0, alternates cache-off/on for 21 measured rounds after warmup: 10,000 draws of a 24 × 24 bitmap onto a 512 × 512 raster surface. Median time was **42.56 ms uncached versus 30.38 ms cached (1.40×)**. Snapshot constructions fell from 10,000 to 1 per measured round. Both paths produced SHA-256 `2ad1467807f46de1d3857fb9bdeab5d83873791ba00f257030d1c754694789bc`. This measures that CPU raster workload, not general application or hardware GPU speed. Raw results are in `BITMAP-PERFORMANCE-0.4.json`; the separate baseline benchmark report records another interleaved run.

The [performance/component sample](https://wieslawsoltes.github.io/SkiaSharpWeb/performance.html) provides backend switching, cache toggling, animation, batched invalidation, native memory diagnostics and PNG export.

## Executed verification

The assembled integration suite has **345 tests, zero failures, zero skips**, including native rendering and independent document/font checks. This includes the native memory-symbol/callback tests and two singular matrix/clip boundary tests. Some error/lifecycle tests use controlled mocks; they are separate from real-runtime and browser checks.

Actual Chromium 140.0.7339.16 ran all **44 scenes on each of Canvas, WebGL and native Graphite/WebGPU**. Renderer selection, theme, text controls, animation, search, PNG export and reusable-component lifecycle were exercised. Graphite's presentation path reported zero CPU-frame upload bytes. SwiftShader was the adapter: this is real WebGPU/GL/native-Skia execution on a software adapter, **not a physical GPU measurement**.

The browser also verified native F16 rendering with F32 readback. The input sRGB red value 2 becomes linear red 4.953125, matching the color-managed raster reference; HDR is not clipped to 1.0. Raw F32 texture copies preserved values above 1, negative values, fractions and alpha exactly. Eight sequential reads used one staging allocation and seven reuses. Ten aliases of one source image used one native texture upload and nine hits without linear alias scans. Native memory callbacks produced 133 graphics rows and 75 Ganesh rows in this workload. A 10,000-invalidation burst generated one repaint without reallocating the surface.

Fresh .NET 8 jobs build/run real SkiaSharp **3.119.0** and **4.154.0-preview.1.26454.9** references. The independent seeded geometry harness uses 512 matrices and 320 path operations with 39,224 comparisons per package; both passed. Separate live reference checks cover colors, transfer functions, text/font metrics and shaping. These finite corpora are not an exhaustive test of all overloads or arguments.

Evidence:
- Native build: [Actions run 34606055284](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/runs/34606055284).
- 44-scene browser/GL/GPU checks: [run 34610179958](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/runs/34610179958).
- Browser lifecycle, HDR, caches, native tracing and live text/value references: [run 34611102168](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/runs/34611102168).
- Independent two-version .NET differential tests: [run 34610179918](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/runs/34610179918).

Reports are retained as workflow artifacts with their producing commit SHA. Unit, browser and differential sources are part of the repository. `scripts/verify-browser-lifecycle.py --physical` requires a positively identified physical adapter and must not be represented as passed until actually run on such hardware.

## Remaining boundaries

The pinned 3,995-declaration audit retains **1,936 implemented, 1,042 partial/unverified, 873 browser-inapplicable and 144 missing** rows. The missing rows are 130 desktop Vulkan/Metal/Direct3D interop declarations and 14 CLR native-object/locking/COM declarations. Native Ganesh memory tracing is no longer missing. The native matrix/clip and HDR readback certificates are narrowly scoped to the tests recorded in `review04`; method-name presence alone never upgrades a row.

The remaining partial rows include historical return-shape adaptations, hash algorithms, native glyph path/transform decomposition, warped glyph tolerances, some font flags, uncommon ICC/Lottie/effect cases, unverified overload argument branches and platform integration. Native Skia compound effects and font hints are implemented in the bundled engine; an injected unextended engine retains narrower fallback paths. CFF2 conversion preserves available stem hints/hint masks, but it does not invent absent hints or prove an exhaustive font corpus.

Native PDF emits searchable text and vectors when representable and may rasterize effects as Skia's PDF backend requires. Its internal per-operation raster decisions are unavailable. Managed PDF/XPS report raster patches or reject unsupported operations with `StrictVector:true`. Neither vector-only representation of every raster effect nor formal PDF/A/XPS certification is claimed. Physical GPU/browser matrices, exhaustive .NET/OpenType/Lottie differential corpora and production memory soaks remain unverified.

## Reproduce

```sh
npm run check
npm test
npm run coverage
node scripts/benchmark-bitmaps.mjs --output bitmap-performance.json
python scripts/verify-browser-lifecycle.py
```

Browser tests require the pinned Playwright/Chromium environment specified in the workflow. Independent document checks require Poppler, PyMuPDF and Pillow. The static sample needs only `python3 -m http.server 8080 -d dist`; the repository contains its runtime and sample assets.
