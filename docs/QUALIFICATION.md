# Qualification and conformance additions

## Native PDF decision reporting

The native extension instruments actual PDF backend branches, not a count of image objects in the final document. `doc.RasterDiagnostics` returns `Events`, `Total`, `Dropped`, `Limit`, and `Source`. Events retain `Page`, `Reason`, `Bounds`, `CoordinateSpace` and `Stage`. `doc.RasterFallbacks` returns the event array. Set `DiagnosticsLimit` (0–65536) to bound event storage; dropped events remain in the total.

Reported native sites include filtered layers, mask filters, transformed images, color-filtered images, raster-device composites and unsupported shaders. Events are decision-site observations, not a deduplicated list of draw operations or proof that every possible future backend branch has been instrumented. An already-raster input image does not itself count as a newly generated raster fallback.

`SKDocument.CreatePdf({NativeBackend:true, StrictVector:true})` rejects a known raster decision before publishing bytes to a caller stream. A zero event-storage limit does not bypass the gate. Aborted documents and rejected writes are terminal. The managed PDF/XPS strict-vector path remains available. XPS/PDF cannot represent every image filter as a native vector primitive; preservation and explicit rejection are separate policies.

The pinned native PDF device omits vertex drawing. The JavaScript adapter preserves `DrawVertices`, `DrawPatch`, and unknown/deserialized pictures using explicit native raster layers rather than silently dropping content. These adapter decisions are identified separately from native events. Captured vector-only pictures retain their vector route.

## Canonical glyph paths and SVG

`SKFont.GetGlyphPaths(glyphs, callback)` now uses the compiled `SkFont::getPaths` callback path and its separate transform. Callback paths are borrowed for that synchronous invocation: call `Clone()` to retain one. Exceptions release temporary paths. `SKFont.HasCanonicalPathCallbacks` distinguishes an older injected engine.

The SVG canvas supports `SKSvgCanvasFlags.None`, `ConvertTextToPaths`, `NoPrettyXML`, and `RelativePathEncoding`. The default native output preserves text elements; explicit conversion retains outlined output. This does not imply searchable text in every SVG consumer or complete font embedding.

## Portable value and path contracts

Vulkan/YCbCr/Graphite descriptor values retain UInt64 precision with BigInt, nested struct copies, default zero fields, equality and JSON round trips. They are value descriptors only; they cannot dereference another process's GPU driver pointers.

Path-measure convenience failures return empty values. Out destinations remain unchanged on failure. Infinite distances clamp to endpoints. `GetSegment` replaces an SKPath destination, while an SKPathBuilder destination appends according to `startWithMoveTo`, matching the pinned .NET 4.x API.

Raw pixmap alpha inspection no longer trusts an `Opaque` metadata label or allocates a color object per pixel. All pixel formats use their packed storage. The 840-case independent .NET corpus includes padded rows, floating-point HDR/NaN values and all three alpha labels. Native ARGB4444 low-nibble ordering and the native XR unsigned-underflow edge behavior are retained rather than silently normalized.

## Reproduce finite resource testing

```
node --expose-gc scripts/soak-runtime.mjs 100000 test-output/soak/runtime.json
node scripts/benchmark-alpha.mjs test-output/soak/alpha-benchmark.json
```

The soak repeatedly creates/disposes surfaces, paints, paths, shaders, snapshots, PNG encoders/decoders, pictures, PDF documents and Skottie animations. It records native memory-trace rows, Embind handle counts, WASM capacity and post-GC JavaScript heap samples. Checks require zero tracked resources after each cycle, stable Embind counts, purged bitmap caches and a bounded post-warmup heap/capacity plateau. WASM capacity is a high-water mark, not a measurement of every live native allocation. A finite passing soak is not indefinite production-memory certification.

## Browser qualification

Serve `dist/qualification.html` over HTTPS or localhost. The reusable `RunQualification` function in `lib/qualification.js` runs deterministic drawing fixtures through Canvas, WebGL and native Graphite and compares readback pixels. The page also exercises native PDF diagnostics and local font-path inspection. It records adapter identity and rejects software/unidentified adapters when physical hardware is required. No report or uploaded font is sent to a server.

A software CI run cannot establish physical vendor-driver qualification. The report states the tested workload and actual adapter. Wall-clock frame measurements include CPU work and queue completion; they are not GPU timestamp-query measurements.

## Native artifact qualification

`Qualify and publish native runtime` verifies compiled artifact hashes against the checked-in native source and pinned Skia/toolchain revisions, then runs integration tests, independent .NET contracts, a 100,000-cycle soak, the new browser page and the existing three-backend browser lifecycle suite. The runtime is committed only after those checks pass. Failed builds preserve artifacts rather than replacing a verified runtime. Concurrent source edits prevent automatic publication until requalified.
