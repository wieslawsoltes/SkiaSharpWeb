# Compatibility and implementation boundaries

SkiaSharp Web 0.3 provides a PascalCase JavaScript graphics API, a reusable web component, and a bundled native Skia engine with Graphite/WebGPU, Ganesh/WebGL, and software Canvas rendering. Graphite is compiled and operational in this release. Complete SkiaSharp overload and behavioral parity is still not established; the declaration audit preserves the unresolved entries instead of equating matching names with conformance.

The API inventory remains pinned to [mono/SkiaSharp b33cf54f24edc5347567c95b1924c447669c1de8](https://github.com/mono/SkiaSharp/tree/b33cf54f24edc5347567c95b1924c447669c1de8). The native engine is built from [Skia f446aec4ce9e0e95e0a504e875955de3eb521f75](https://github.com/google/skia/tree/f446aec4ce9e0e95e0a504e875955de3eb521f75) with the extension sources under `native/`. The 3,995-entry inventory is a lexical source inventory, including overloads, enum values, obsolete forms and conditional declarations. Its counts are not feature percentages.

## Capability map

| Family | Delivered implementation | Practical qualification |
| --- | --- | --- |
| Values and geometry | Colors and PM colors, points/sizes/rectangles, rounded rectangles, 3×3/4×4 matrices, transforms, color-space transfer functions, primaries/XYZ/ICC, enums and mutable outputs | Operators, spans and `ref`/`out` use explicit JavaScript conventions. The audit tracks overload evidence separately. |
| Canvas and drawing | Native Skia shapes, paths, images, vertices/atlas/patches, text/glyphs/paragraphs, pictures, transforms, clipping and layers | GPU readback is asynchronous on WebGPU. Direct `_native` access bypasses managed ownership and document tracking. |
| Paths and regions | Native Boolean paths and path effects; integer region algebra, iterators and boundary paths; native `SkRegion::setPath` and native region serialization | Legacy web SKRG data remains readable. An independently supplied unextended CanvasKit uses the documented portable fallback. |
| Paint, shaders and effects | Native gradients, color-space conversion, SkSL shader/filter/blender children and raw uniforms; native specialized color/image/path effects | Rendering follows the pinned Skia implementation. Unsupported bindings in an injected older engine are capability checked. |
| Software effects | Float32 capture, mixed native/software graphs, Float32 filtered layers, clip-bounded work and reusable buffers | Public RGBA8 output quantizes at that explicit boundary. Scalar fallback rounding can differ from native Skia. |
| Fonts | Registered family/style/coverage matching, font collections and tables, TTF/OTF/WOFF/WOFF2, variable TrueType/CFF2, color-font data, palettes, glyph geometry and native metrics | Browser registries contain supplied fonts; browser security does not expose the complete installed OS font collection automatically. |
| Font instancing | HarfBuzz axis instancing, variable metrics/layout/color corrections, retained static CFF2 for rendering and hint-preserving CFF1 for documents | Tests include independent static references and a negative control with hints removed. They are not an exhaustive OpenType font corpus. |
| Text | Native shaping, bidi/layout, paragraphs, glyph metrics/paths, UTF8/UTF16 and positioned/cluster text blobs | Complex shaping uses the registered fonts. Text selection and extraction can vary between document readers. |
| Images and streams | Pixel views/strides, bitmap/pixmap operations, native codecs, scanline/incremental interfaces, detailed PNG/JPEG/WebP encoding and memory/mounted file streams | A format must support the requested native codec operation. Browser file paths refer to the explicit mounted file registry. |
| PDF | Native Skia PDF by default, fonts/searchable text, pictures, paragraphs, gradients, images and native effects | Native Skia can internally rasterize operations PDF cannot represent. Its internal fallback list is unavailable. |
| Managed PDF and XPS | Embedded vector paths/glyphs/images/fonts, gradients, transformed/repeated brushes, rich text, layer compositing and tracked bounded raster patches | `StrictVector:true` rejects operations the managed writer cannot represent. PDF/XPS cannot express every Skia raster effect as an exact finite vector description. |
| Skottie/resources/scenes | Native Skottie parsing, rendering, properties/slots, resources, registered fonts, invalidation and retained scene nodes | Native Skottie determines Lottie feature support. The retained node hierarchy is a documented web extension. |
| Ganesh/WebGL | Compiled native Ganesh renderer and extended context, target, texture and cache controls | Physical WebGL devices and target browsers have not been certified in this environment. |
| Graphite/WebGPU | Compiled native Graphite/Dawn context, recorder, textures, full-scene drawing and GPU texture presentation | Executed with Dawn/SwiftShader Vulkan. This is actual shader execution on a software adapter, not physical GPU validation. |
| Platform interop | WebGL objects and WebGPU devices/textures | Desktop Metal/Vulkan/Direct3D process pointers and native UI controls are not browser resources. |

Details: [API usage](./docs/API_USAGE.md), [overload audit](./docs/OVERLOAD_CONFORMANCE.md), [font fidelity](./docs/FONT-FIDELITY.md), [effects](./docs/EFFECT_FIDELITY.md), [documents](./docs/DOCUMENTS.md), [animation/resources](./docs/ANIMATION_RESOURCES.md), and [native build](./native/README.md).

## Rendering backends

| Backend / render mode | Actual work |
| --- | --- |
| WebGPU / `skia-graphite-webgpu` | Native Skia Graphite records and renders into a persistent GPU texture; presentation samples that texture without reading a CPU frame. |
| WebGL | Native Skia Ganesh renders through WebGL. |
| Canvas | Native Skia rasterizes in WASM and presents through Canvas 2D. |
| Offscreen `raster` | Native Skia raster surface without an HTML canvas. |
| WebGPU / `native-primitives` | Compatibility route for an injected engine without Graphite: an instanced WGSL primitive renderer. |
| WebGPU / `skia-raster-upload` | Compatibility route for an injected engine without Graphite: complex scenes use Skia software rendering and texture upload. |

`backend:'auto'` tries WebGPU, WebGL, then Canvas. `allowFallback:false` requires the selected backend. Inspect `surface.Backend`, `RenderMode` and `FallbackReasons`. If a context attempt locks a canvas to an incompatible API, the returned `surface.Element` can be a replacement canvas.

Graphite's recorder owns a bounded image conversion cache, so raster images and bitmaps become reusable GPU textures. `GetImageCacheStatistics()` reports actual hits, uploads, bytes and budget; `PurgeImageCache()` releases retained cache entries. Auto-created surfaces submit ordered recordings. Manual contexts keep the upstream configurable ordering behavior.

Use `await surface.FlushAsync()` when completion matters and `await surface.SnapshotAsync()` when CPU-accessible image bytes are required from an onscreen Graphite surface. A GPU-backed snapshot is a different resource from a CPU-readable snapshot. `Dispose()` invalidates the surface immediately and schedules GPU cleanup; `DisposeAsync()` also waits for that cleanup. A synchronous browser main-thread API cannot wait for mapped WebGPU data.

The custom primitive compatibility route uses 52 bytes per instance instead of 264 bytes of repeated vertices. Its edge antialiasing is distinct from native Skia. CPU submission times displayed in the app do not measure GPU execution time.

## Documents

`SKDocument.CreatePdf()` selects the native Skia PDF backend when its binding is present. `document.Backend` reports `NativeSkia`. `RasterFallbackReporting` is `UnavailableNative` and `RasterFallbacks` is `null`; a null value must not be interpreted as zero rasterization. Font embedding and supported vector content are handled by native Skia.

Use `NativeBackend:false` or `Backend:'JavaScript'` for the managed PDF writer. XPS uses that writer's OPC/FixedPage implementation. Managed documents report `RasterFallbackReporting:'PerOperation'` with a fallback array. Supported rich paragraphs, pictures and layer groups remain vector; unsupported effects produce bounded raster patches. A destination-dependent patch may flatten earlier vectors within its rectangle.

`StrictVector:true` uses managed recording without a page-sized pixel allocation and throws on unrepresentable drawing. Sweep/conical or unusual shaders, some blend/effect combinations and native callbacks can require fallback. This option gives callers an explicit guarantee that successful managed output did not silently rasterize unsupported operations; it does not make the file formats support new drawing primitives.

PDF and XPS text extraction has reader-specific behavior. Native PDF can preserve a ligature code point such as U+FB03; Unicode normalization gives the logical letters. PDF/XPS conic approximations and managed vector decompositions have documented tolerances. Full document standards conformance is not certified by the sample exports.

## JavaScript adaptations

| C# pattern | JavaScript equivalent |
| --- | --- |
| Namespace access | `const S = await Initialize(); new S.SKPaint()` |
| Object initializers | Constructor options or property assignments |
| `using` | `try/finally` and `Dispose()`; await `DisposeAsync()` for GPU completion |
| Value operators | Named `Equals`, arithmetic, mapping and concatenation methods |
| `ref` / `out` | Mutable output objects or documented convenience return objects |
| Spans and buffers | Arrays and typed arrays with explicit offset/length rules |
| Onscreen creation | `await SKSurface.Create(canvas, options)` |
| WebGPU CPU readback | Async snapshot/readback methods |
| Desktop file paths | Mounted file streams, selected file bytes or explicit URL loading |
| ARGB text | `#AARRGGBB`, rather than CSS's eight-digit ordering |
| Native UI controls | `<skia-canvas>` and browser lifecycle events |

## Verification limits

The [verification report](./docs/VERIFICATION.md) records the executed tests, reference runtimes, GPU adapter and results. The [performance report](./docs/PERFORMANCE.md) includes reproducible workloads and measured limits. Tests cover native pixels, .NET reference values, font hints/layout, region bytes, document readers, shader execution and resource lifetime.

The remaining audit rows are retained explicitly. There is no claim of an exhaustive .NET differential suite, full platform UI/native-pointer equivalence, every valid font/document/Lottie input, a production memory soak, or physical GPU/browser certification. Matching declarations and passing sample scenes do not establish those broader claims.
