# Effects and regions: native completion and Float32 fallback

The bundled extended CanvasKit engine now executes the following operations inside native Skia:

- Path-effect composition, summation, trimming and `filterPath`; nested corner, discrete, dash, 1D and 2D effects use Skia's own geometry and stroke-record handling during drawing.
- Integer path-to-region scan conversion through `SkRegion::setPath`.
- Table/ARGB, HSLA, high-contrast and overdraw color filters.
- Convolution, arithmetic, crop, tile, magnification, merge, and all six distant/point/spot diffuse/specular lighting filters.

The bridge is in `native/skiasharp_effects.cpp` and `native/skiasharp_effects.js`. These sources compiled and linked against pinned Skia `f446aec4ce9e0e95e0a504e875955de3eb521f75`; their actual emitted WebAssembly was executed by the verification suite. `CanvasKit.SkiaSharpNative.Effects.Version === 1` identifies the extension.

Native filters remain native when assigned to `SKPaint`, so Skia controls transforms, filter bounds, float working formats, clipping and effect composition. Native path factories also preserve the stroke/fill changes that individual effects require.

## Stock-engine compatibility

A caller can still supply an unextended CanvasKit instance. Software effects then use Float32 RGBA through the entire evaluation graph. Capture, mixed native/software nodes, intermediate images and software layers use actual `RGBA_F32` raster surfaces. `ApplyPixels` is the RGBA8 boundary; `ApplyFloatPixels` accepts/returns Float32 RGBA without introducing an RGBA8 intermediate.

```js
const filter = S.SKColorFilter.CreateHighContrast(
  false, S.SKHighContrastConfigInvertStyle.InvertBrightness, 0
);
const rgba = filter.ApplyFloatPixels(Float32Array.of(0.1, 0.4, 0.8, 1));
filter.Dispose();
```

High contrast converts sRGB to linear light before applying grayscale, inversion and contrast, then converts back to sRGB. Software lighting uses the native 3×3 Sobel normal kernel and spotlight cone transition. Magnification uses the native nonlinear inset weighting, pixel-center coordinates and lens output bounds. Discrete-path fallback follows Skia's linear-congruential random sequence, normal-direction displacement, contour handling and segment count; 1D stamps follow its phase direction and quadratic conversion of morphed line segments. Corner conversion preserves the original quadratic, conic and cubic verbs.

Software crop, tile, magnifier and convolution operations now account for the drawing matrix. Native child image filters receive that matrix through their layer evaluation. Color-filter-only captures are restricted to device clip bounds. Two released float surfaces can be cached up to a combined 32 MiB; `S.PurgeEffectCache()` releases this cache. Individual float-surface allocation is bounded to 256 MiB. `S.EffectDiagnostics` reports allocations, reuse and peak capture pixels for measurement.

A software layer requested with `F16ColorType` uses Float32 storage, preserving at least the requested component precision. This is not a claim that its bit pattern matches an F16 intermediate. The bundled native engine handles the actual native layer flag.

## Region interchange and performance

`SKRegion.Serialize()` now emits little-endian native `SkRegion::writeToMemory` bytes, including the empty/rect variants and complex run-length encoding with vertical gaps. `SKRegion.Deserialize()` accepts this native format and the previous release's `SKRG` format. `SerializePortable()` retains explicit access to the older browser format.

Rectangle Boolean operations continue to use exact signed integer bands. Interval combination now merges sorted endpoints linearly. Point containment binary-searches bands and spans; bounds are cached for each immutable band array. In an unextended runtime, region conversion draws bounded alpha strips through Skia's native scan converter instead of crossing into WebAssembly for every pixel. Negative-coordinate curve translation can still differ by a boundary pixel from native `SkRegion`; the bundled region bridge avoids that fallback.

A warmed seven-run Node v24.19.0 benchmark of the **stock CanvasKit 0.42 fallback** measured:

| Workload | Previous implementation | Updated fallback | Ratio |
|---|---:|---:|---:|
| 1024 × 1024 circle converted to region | 271.637 ms | 3.499 ms | 77.6× |
| 1200 × 800 color-filter draw clipped to 20 × 30 | 24.194 ms | 0.458 ms | 52.9× |

These are workload-specific CPU timings, not general GPU or application speedup claims. Raw results accompany this report in `docs/effects-benchmark-results.json`.

## Verification

`tests/effects-fidelity.test.mjs` adds eleven tests, including:

- Sub-byte increments across a twenty-filter chain and mixed native/software Float32 evaluation.
- Independent sRGB transfer-function calculations for high contrast.
- Float32 software layers, reuse, transformed crop bounds and bounded color capture.
- Thirty-six independent native-Skia region fixtures covering cubics, polygons, circles, winding/even-odd/inverse fills, negative coordinates and exact native serialized bytes.
- Five independent native corner-path fixtures with preserved raw Bézier verbs.
- Native-versus-fallback discrete and morphed stamp geometry, including positive/negative phase and deterministic seed behavior.
- Native-versus-fallback magnifier pixels.

The independent fixtures were generated by `skia-python 144.0.post2`; their generator is included. A separate .NET SkiaSharp 3.119.0 reference confirmed the circle region rectangles and native high-contrast pixel `[255, 246, 101, 255]`. The scalar software high-contrast implementation differs from that pixel by one blue-channel byte because its sRGB conversion uses the mathematical transfer function rather than Skia's approximating transfer pipeline.

All eleven new tests, all fourteen pre-existing effects/region groups and the effects gallery integration passed against the compiled bundled engine. This verification exercises native CPU rendering; physical GPU validation belongs to the renderer verification report.

Source references: Skia `SkRegion.cpp`, `SkCornerPathEffect.cpp`, `SkDiscretePathEffect.cpp`, `Sk1DPathEffect.cpp`, `SkHighContrastFilter.cpp`, `SkLightingImageFilter.cpp`, `SkMagnifierImageFilter.cpp` and `src/sksl/sksl_rt_shader.sksl`, at the pinned commit above. Native-compatible geometry algorithms retain the Skia BSD license attribution in `path-effects.js` and `dist/vendor/LICENSE-canvaskit`.
