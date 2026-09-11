# Verification — SkiaSharp Web 0.4

This report records executed checks, not full-parity certification. The integration includes the native runtime published by build run 34606055284, the rendering/cache work and the precision-preserving GPU readback changes through `d8a7e2ac827c3837ecc9ce750b9ef76a16593e02`. The source API target is SkiaSharp `b33cf54f24edc5347567c95b1924c447669c1de8`; the runtime is Skia `f446aec4ce9e0e95e0a504e875955de3eb521f75`, Emscripten 4.0.8.

## Compiled runtime

The native build completed and its resulting WebAssembly was loaded and executed. The shipped WASM SHA-256 is:

```
01f467be89998f0c57857dbc47a1aef1a360e5f5076fcbbed254e54939c416f6
```

The engine contains Graphite/Dawn/WebGPU, Ganesh/WebGL, raster Skia, specialized native effects, document/font extensions, memory tracing and native image identity. `tests/native-memory.test.mjs` requires the actual exported tracing/identity functions and exercises real callback values and image-alias identities. It does not pass by substituting mocks or ignoring absent bindings.

Build provenance: [native build](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/runs/34606055284), [runtime commit](https://github.com/wieslawsoltes/SkiaSharpWeb/commit/a99d6095dfe998f9abf0c9fe58527c98ca0c067d), `native/native-build-manifest.json`.

## Local integration

**343 tests passed, 0 failed, 0 skipped**, using Node 22.16.0 and the WASM above. JavaScript syntax, relative imports and HTML entry assets also passed `npm run check`. The suite covers drawing, regions, path/effect geometry, font metrics/shaping/hints, codecs/streams, vector documents and independent readers, animation/resources, overload adapters, ownership, caches, scheduler behavior and GPU readback validation. Some error/lifecycle tests use controlled mocks; these are separate from real-runtime tests and live browser checks.

```sh
npm run check
npm test
npm run coverage
```

The earlier integrated baseline passed 332 tests; the precision readback additions increased this to 343. No assertion was removed to obtain this count.

## Actual Chromium rendering and presentation

[Browser run 34609790052](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/runs/34609790052) used Chromium **143.0.7499.4**, with a Google **SwiftShader software Vulkan adapter**. It passed:

- **132 scene/backend combinations:** every one of 44 scenes on native Graphite/WebGPU, Ganesh/WebGL and Canvas.
- Snapshot size/content checks and CPU-reference comparisons. Maximum scene-level mean absolute component errors were 0.82193 (WebGPU), 2.22776 (WebGL) and 0.07762 (Canvas), on an RGBA8 0–255 scale. The acceptance threshold was 12; visible-content checks separately rejected gross loss.
- Actual HTML presentation: screenshots showed exact red and white pixels at independently sampled positions for each backend, not just successful offscreen snapshots.
- Zero per-frame CPU texture-upload bytes on native Graphite; no uncaptured GPU errors.
- Theme, search, timeline and animation controls.
- The performance lab's real custom element: 100 simultaneous invalidations produced one additional frame and no extra surface creation. The cached workload recorded 3,999 hits, one miss and 2,304 retained pixel bytes.

A separate browser workflow using Chromium **140.0.7339.16** passed the same 44-scene/three-backend coverage plus backend switching, PNG download and component resize/disconnect/reconnect. Its 10,000-invalidation batch produced one frame. The [latest precision/lifecycle run](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/runs/34611102168) also exercised the additional checks below.

Both are software-adapter tests. **Physical GPU hardware and vendor drivers were not tested.** `--require-physical-gpu` in the new runner and `--physical` in the lifecycle runner reject software-adapter evidence when hardware qualification is requested. CPU/submission/completion times from SwiftShader are not hardware GPU performance measurements.

```sh
python -m pip install playwright==1.57.0 Pillow==11.3.0
python -m playwright install --with-deps chromium
python scripts/verify-browser.py --output test-output/browser
```

On Linux CI, the supplied workflow uses Xvfb and `--headed`. Full raw reports and screenshots are retained as Actions artifacts.

## HDR, readback and native identity

The completed precision/lifecycle browser run tested native `rgba16float` Graphite rendering and F32 readback against a color-managed F16 raster reference. Its first pixel was `[4.953125, 0.01435089111328125, 0.2139892578125, 1]`, versus raster `[4.953125, 0.01434326171875, 0.2139892578125, 1]`. The HDR component stayed above 1; all channels met the 0.002 tolerance. This explicitly tests sRGB-to-linear conversion, not an incorrect expectation that linear output equals the original sRGB components.

Raw `rgba32float` texture copies retained the exact Float32 values, including negative and above-one components. Eight readbacks used **one staging allocation and seven reuses**; the pool finished with zero active leases and 512 idle bytes. Ten native aliases of the same image required **one upload and nine cache hits**, with **zero alias scans** when native identity was available. Native memory diagnostics returned 133 entries. Async `Sync:true` submission left the caller's options unchanged. No GPU validation errors were recorded.

Unit tests separately cover row alignment, mip/layer bounds, bit preservation, buffer budgets, disposal, color metadata ownership, callbacks and invalid options. Compressed/depth/stencil formats remain explicitly unsupported by this raw color readback helper.

## Independently executed .NET comparisons

[Run 34609429738](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/runs/34609429738) executed the C# generator against **SkiaSharp 3.119.0** and **4.154.0-preview.1.26454.9**. Each corpus contains 512 matrix/rectangle cases and 320 path Boolean cases using a documented fixed LCG seed. Expected results come from native .NET SkiaSharp, not JavaScript-generated fixtures.

For each version, **39,224 numerical/Boolean comparisons passed, zero failures**. Float tolerance is `0.0002 + abs(expected) * 0.001`; Boolean and structural results are exact. Cases include singular and perspective matrices, inverses, vector/point/rectangle/radius mapping, pre/post concatenation, rectangle predicates, all five path Boolean operations, bounds and point containment. Both independent corpora were replayed locally against the rebuilt WASM with zero failures.

The existing live .NET workflow separately regenerates color, matrix, font, glyph and region fixtures with the exact repository font asset. Independent fontTools/Skia fixtures, hint-removal negative controls and PDF/XPS reader checks remain part of integration tests. These focused corpora are **not an exhaustive .NET differential suite for all 3,995 declarations**.

## Performance

The actual-Skia repeated-bitmap benchmark used 10,000 draws of a 24×24 immutable sprite on a 512×512 raster surface, five warmup rounds and 21 interleaved measured rounds. Median time changed from **43.2813 ms to 31.4288 ms (1.3771x)**. Snapshot construction changed from **10,000 to one**. Cached and uncached outputs have the identical SHA-256:

```
2ad1467807f46de1d3857fb9bdeab5d83873791ba00f257030d1c754694789bc
```

See `docs/BITMAP-PERFORMANCE.json` and `scripts/benchmark-bitmaps.mjs`. This measures a repeat-image CPU workload, not a universal application speedup. Cache tests cover mutable images, base-class codec instances, eviction, disposal, explicit notifications and resource purges.

## Remaining unsupported or unproven behavior

The regenerated audit classifies 1,932 declarations as implemented, 1,046 partial/unverified, 873 not applicable and 144 missing. These are declaration counts rather than feature percentages. Remaining native platform pointer/CLR/COM surfaces are not browser equivalents. An exhaustive overload proof, every valid font/document/Lottie input, a production memory soak, physical GPU coverage and document standards certification have not been completed.

Native PDF may internally rasterize operations its file format cannot represent; the internal fallback list is unavailable. Managed PDF/XPS report bounded patches or reject unsupported output in strict-vector mode. Injected stock-engine fallback paths retain documented geometric/rounding qualifications. See [COMPATIBILITY.md](../COMPATIBILITY.md), the detailed font/effect/document reports, and the reproducible declaration audit rather than interpreting successful scenes as universal parity.
