# Regions and extended effects

The bundled runtime executes compound path effects, integer path-to-region conversion, specialized color/image effects and additional mask filters inside native Skia. A Float32 software graph remains available for callers supplying stock CanvasKit without the extension. Native code is compiled at Skia revision `f446aec4ce9e0e95e0a504e875955de3eb521f75`; the emitted Wasm is exercised by the included tests.

## Integration and ownership

`regions.js`, `effects.js`, `path-effects.js` and `layer-effects.js` integrate with core paints, paths and canvases. `surface-formats.js`, installed after the conformance layer, supplies accurate raster formats and missing mask-filter factories. The normal `Initialize` entry point installs these components.

Native factories return native effects, so native Skia applies filter bounds, transforms, color-space handling, geometry and stroke-record changes. Paint effect ownership uses `effect._clone()` when available and an owned native clone otherwise. Software descriptors retain an owned graph and are omitted from the native paint setter.

For a software effect, `renderPaintEffects` captures the paint-bearing primitive, image or text draw, evaluates its color and image filters, then composites through the original clip and blend mode. Native child filters execute on real Skia surfaces. `SaveLayer` preserves logical save counts, nested saves, transforms, paint/backdrop effects and initialization from the previous layer. Disposal releases unfinished layers.

## Region behavior and interchange

`SKRegion` uses canonical disjoint integer bands and sorted disjoint x intervals. Boolean operations merge sorted boundaries with exact interval algebra and coalesce adjacent identical bands. Point containment binary-searches bands and spans; immutable band arrays cache bounds. Coordinates, including translations, are checked as signed 32-bit integers.

The APIs include construction, empty/rectangle/complex/bounds properties, containment and intersection overloads, quick tests, replacement, rectangle-array union, clipped path conversion, translation, all six Boolean operations, boundary paths, rectangle/clip/span iterators, cloning and disposal.

The bundled engine converts paths through actual `SkRegion::setPath`, including winding, even-odd and inverse fills. An unextended engine rasterizes bounded Alpha8 strips through Skia's scan converter and reconstructs integer bands; it no longer performs a Wasm containment call for every pixel. Negative-coordinate curve translations in this fallback can differ at a boundary pixel from direct native region conversion.

`Serialize()` emits little-endian native `SkRegion::writeToMemory` bytes, including empty/rectangle variants, complex runs and vertical gaps. `Deserialize()` accepts native data and the prior release's portable `SKRG` data. `SerializePortable()` explicitly emits that older browser format. Malformed lengths, coordinates and noncanonical ordering are rejected.

## Native effects

- Path effects use native composition, summation, trim and `filterPath`. Nested dash, corner, discrete, 1D and 2D effects preserve native geometry and stroke handling.
- Color effects include shared/per-channel tables, HSLA matrices, high contrast, overdraw, composition and interpolation.
- Image effects include crop, tile, arithmetic, convolution, magnification, merge and all six distant/point/spot diffuse/specular lighting filters, in addition to the existing native blur, morphology, transform, shadow, displacement and blend operations.
- Mask effects include table, gamma, clipping and shader coverage, plus the existing blur factories. `SKMaskFilter.TableMaxLength` is 256.

The native bridge is `native/skiasharp_effects.cpp` with initialization in `native/skiasharp_effects.js`.

## Float32 fallback

Software color/image graphs carry normalized unpremultiplied Float32 RGBA through evaluation. Capture surfaces, mixed native/software stages, intermediate images and software layers use actual `RGBA_F32` raster storage. `ApplyFloatPixels` retains Float32 values; `ApplyPixels` converts at the public RGBA8 boundary. A software layer with `F16ColorType` uses Float32 storage to retain at least the requested component precision; the bundled native engine handles its native F16 layer flag.

High contrast uses linear-sRGB conversion. Lighting uses the native 3×3 Sobel normal kernel and spotlight cone transition. Magnification uses native nonlinear inset weighting, pixel-center coordinates and lens output bounds. Crop, tile, magnifier and convolution account for the drawing matrix; native child filters receive that matrix during layer evaluation.

Fallback corner conversion preserves quadratic, conic and cubic verbs. Discrete conversion follows native seeded random generation, normal displacement and contour segmentation. The 1D morph fallback follows native phase direction and quadratic conversion of morphed line segments. Native compiled effects remain the normal bundled path.

Color-filter-only captures are restricted to device clip bounds. A reusable cache retains at most two released Float32 surfaces with a combined 32 MiB limit. Individual effect-surface allocations are limited to 256 MiB. `EffectDiagnostics` reports allocation/reuse and peak capture size; `PurgeEffectCache()` releases retained buffers.

Some fallback behavior has deliberate or measured boundaries: software stages do not implement every arbitrary working color space; perspective/noninvertible transforms and unbounded filter extents need broader conformance; the mathematical high-contrast transfer function can differ from native Skia approximation by one output byte; arbitrary paragraph styles with effects require a paint-bearing draw or an enclosing filtered layer. The 2D geometry fallback limits its lattice to one million cells. These boundaries concern the fallback and do not replace the compiled native factories.

## Raster precision

`SKSurface.Create(info, ...)` honors actual color type, alpha type, color space, row bytes and surface properties. F16 and F32 surfaces retain native floating-point storage. Typed-array destinations use documented copy/flush synchronization, while CanvasKit allocations can be borrowed directly. F32 readback uses precisely sized allocations. Details and examples are in [SURFACE_FORMATS.md](SURFACE_FORMATS.md).

## Verification and measured performance

`tests/regions-effects.test.mjs` passes fourteen groups, including randomized integer Boolean operations checked against an independent grid oracle, serialization validation, curve/inverse coverage, ownership, numeric filter fixtures, native/software graph composition, clipping/blending, compound geometry and nested layers.

`tests/regions-effects-integration.test.mjs` renders the four region/effect gallery scenes and verifies shaped Arabic/Latin text filtering, public scalar image drawing and trimmed path drawing.

`tests/effects-fidelity.test.mjs` adds eleven passing tests: Float32 increments and mixed graphs; linear-light high contrast; float surface reuse; local transforms and bounded captures; 36 independent native-Skia region fixtures with exact serialized bytes; five raw-verb corner references; native/fallback discrete and morph comparisons; and native/fallback magnifier pixels. Fixtures were generated by `skia-python 144.0.post2`; the generator is included. A .NET SkiaSharp 3.119.0 reference also confirms native circle-region bands and high-contrast output.

`tests/surface-formats.test.mjs` adds ten passing native tests for HDR/negative F32 values, exact F16 bits, stride/padding, extended formats, color space and surface properties, safe readback sizes, borrowed/owned buffers, release/snapshot lifetime, raster overloads and all four additional mask factories.

A warmed seven-run CPU benchmark using stock CanvasKit 0.42 measured circle-to-region conversion at 271.637 ms before and 3.499 ms after the fallback changes, and a 1200×800 filtered draw clipped to 20×30 at 24.194 ms before and 0.458 ms after. These are specific workloads, not a general GPU speedup claim. Full methodology, native/fallback precision boundaries and raw results are in [EFFECT_FIDELITY.md](EFFECT_FIDELITY.md) and `effects-benchmark-results.json`.

These suites execute native CPU Skia. The renderer report records browser GPU validation separately; this document does not claim physical GPU validation or an exhaustive .NET differential suite.
