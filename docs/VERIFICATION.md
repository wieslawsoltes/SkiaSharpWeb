# Verification — SkiaSharp Web 0.3

Verified 2026-09-11 with Node 24.19.0 and the custom compiled Skia engine pinned in native/native-build-manifest.json. This report distinguishes API adapters, output tests, native build evidence, real software GPU execution and untested physical/browser behavior.

## Automated integration suite

The final `npm test` run reports **302 passed, 0 failed, 0 skipped**. Tests use the shipped WASM, including actual native rendering. Legacy file-level assertion groups are not added to the Node test-runner total and no test count is presented as an API-completion percentage.

| Area | Evidence |
| --- | --- |
| Complete sample app |44 scenes render, preserve matrix/save state, contain visible graphics, and export to PDF and XPS. The gallery produces88 document exports, PNGs and selected documents under test-output/gallery. |
| Native Graphite | All 44 scenes execute through native Skia Graphite on Dawn/SwiftShader and compare with raster images. No validation errors and no CPU-frame presentation uploads. Exact results and per-scene error metrics: GRAPHITE-VALIDATION.json. |
| Primitive presenter | Real Dawn WGSL execution checks primitive interiors and an odd-width upload. Baseline/current image comparison has 0 changed components. This tests the compatibility presenter independently of Graphite. |
| Graphite cache/records | Four record/value tests and ten actual Dawn checks cover alias cache hits, independent wrappers, mipmaps, recorder isolation, 256-entry LRU eviction, disposal before submission and exact pixels. See gpu-records-validation.json. |
| GPU images and lifetime | Native texture conversion with/without mipmaps, source disposal before drawing, image disposal before submission, recorder guards and exact RGBA readback. Native handle counters return to 0; no GPU errors. |
| Surface formats | F32 HDR pixels retain values above 1, F16 strides and sized readbacks, additional native formats, linear spaces, surface props, buffer ownership/synchronization and snapshot lifetime. Native mask factories execute. |
| Fonts | 47 font test entries plus original internal groups cover variable metrics/layout/color, native flags/fallback, hints, caches and formats. CFF2 and hint-preserving CFF1 pixels match independent fontTools fixtures at 3 weights × 7 sizes; removing hints changes pixels. |
| .NET text/font references | Actual SkiaSharp 3.119 and 4.154 font metrics, IDs, advances and bounds match tested fixtures. Native HarfBuzz shaping matches .NET ligatures, Arabic, combining marks and non-BMP byte clusters/positions; 12 DrawShapedText overloads dispatch equivalently. |
| .NET value references | 104 HSL/HSV samples, all 256 alpha premultiplication cases, named colors and transfer-function samples compare with executed .NET references. Native ICC, runtime uniforms/children and annotations have output/ownership assertions. |
| Regions and effects | 36 native region geometry/serialized-byte fixtures and 5 corner raw-Bézier references match. Compound effects use native Skia; mixed graphs, Float32 intermediates, CTM, clipping/layers and cache behavior have regression checks. |
| Images, streams and codecs | Native JPEG chroma/alpha options, PNG filters, lossless/animated WebP, codec frames/scanline/incremental/subset APIs, typed pixel spans, streams, image filters/readback and clustered text blobs. |
| SVG sample export | All 44 scenes serialize through native SVG. Independent XML parsing and MuPDF rendering validate a dedicated vector/text fixture; SVG text is outlined. See SVG-VALIDATION.json. |
| Documents | Independent Poppler/PyMuPDF parsing, rendering and text extraction for native/managed PDF and XPS; metadata, dates, PDF/A metadata/output-intents, glyphs, layers, gradients, clips, pictures and fallback behavior. PDF/A metadata checks are not formal standard certification. |
| Animation/resources/scenes | Native Skottie frame/property/slot/resource behavior, registered fonts, embedded/external images, ownership, text editing, audio seek callbacks and retained invalidation remain covered. |
| Browser app control logic | Timeline duration/end position, asynchronous export naming, back-forward cache lifetime and page teardown are checked in an isolated DOM harness. This is not a live browser graphics test. |

## Native build and GPU evidence

The delivered native/build_native.py ran successfully against pinned Skia f446aec4ce9e0e95e0a504e875955de3eb521f75 with Emscripten 4.0.8. It built the combined Graphite/Dawn, Ganesh/WebGL and raster WASM. Exact source hashes and output hashes are in native/native-build-manifest.json. This is an operational bundled extension, beyond source preparation.

Native Graphite was initialized through an imported GPUDevice and executed real draws on Dawn's Vulkan backend using SwiftShader driver 5.0.0. A native image provider uploads and caches raster images. Pixel assertions, repeat-image cache reuse, purge and teardown counters passed. The [44-scene output contact sheet](./gallery-preview.png) was visually inspected, including images/pixels, advanced fonts and the new asset scenes.

The adapter explicitly reports `isFallbackAdapter: true`; reports set `physicalGPU: false`. No physical GPU or live WebGL/browser graphics session was performed. Ganesh texture adoption compiled and its JavaScript argument/ownership adapters were tested, but that native WebGL operation was not exercised against a live GL device.

## Reproducing checks

```sh
npm run check
npm test
npm run coverage
node scripts/benchmark.mjs
```

Install Poppler command-line tools and PyMuPDF 1.26.6 plus Pillow 11.3.0 to run independent PDF/XPS parsing/rendering checks. Native tests do not need a GPU unless explicitly invoked. See PERFORMANCE.md and native/README.md for separate Dawn verifier and full build commands. Differential C# source and pinned reference JSON are distributed with the tests; the routine suite consumes recorded independently generated fixtures.

## Remaining verification boundaries

The declaration audit preserves all 3995 pinned entries and separates implemented, partial/unverified, missing and not-applicable declarations. Some reported improvement comes from correcting inventory initializer parsing; these corrections are identified separately. A declaration marked implemented has the evidence stated in the audit, without implying exhaustive argument-space equivalence.

There is no exhaustive .NET-versus-JavaScript differential suite, complete OpenType/COLRv1/effect/Lottie corpus, physical GPU/browser matrix, production memory soak or full document-standards certification. Managed PDF/XPS operations outside their vector support still rasterize or reject under StrictVector. Native Skia PDF does not report individual raster decisions; its RasterFallbacks value is null. JavaScript and browser pointer/thread/UI semantics retain explicit adaptations.

Performance figures describe the documented workloads and measurement environment. Sample draw timing and CPU preparation benchmarks are not GPU timing. Raw evidence and precise reproduction commands are in PERFORMANCE.md and associated JSON reports.
