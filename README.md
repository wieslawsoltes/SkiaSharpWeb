# SkiaSharp Web 0.4

An unofficial, reusable JavaScript graphics library with a familiar PascalCase `SK*` API, compiled Skia Graphite/Dawn WebGPU, Ganesh WebGL, and a Skia raster Canvas fallback. The project includes 44 interactive graphics scenes and a separate component/performance lab.

**[Graphics Lab](https://wieslawsoltes.github.io/SkiaSharpWeb/) · [Performance Lab](https://wieslawsoltes.github.io/SkiaSharpWeb/performance.html) · [Verification](./docs/VERIFICATION.md) · [Compatibility](./COMPATIBILITY.md)**

The bundled runtime executes native Graphite; it is not a placeholder or a CPU-frame-upload presenter. Complex paths, text, native effects and images run through Skia. An explicitly injected older CanvasKit engine can still use the documented primitive/raster-upload compatibility path.

This is not complete SkiaSharp behavioral parity. The 3,995-entry declaration inventory, remaining overload evidence and browser-specific adaptations are retained explicitly. Desktop driver pointers and CLR/COM lifetime interfaces are not equivalent to browser resources.

## Run

From a repository checkout:

```sh
python3 -m http.server 8080 -d dist
# Open http://localhost:8080/
# Component/performance lab: http://localhost:8080/performance.html
```

No application server, cloud credentials, CDN or npm installation is required to serve the repository's application. WebGPU needs HTTPS or localhost. `auto` falls back to WebGL and Canvas when unavailable. The source-snapshot ZIP excludes font binaries; the deployed gallery and repository checkout retain their font assets. The performance lab uses no font files.

## Browser API

```js
import { Initialize } from './lib/index.js';
const S = await Initialize();
const surface = await S.SKSurface.Create(document.querySelector('canvas'), {
  backend: 'auto'
});
const paint = new S.SKPaint({
  IsAntialias: true, Color: S.SKColor.Parse('#30DEAB')
});
try {
  surface.Canvas.Clear(S.SKColors.White);
  surface.Canvas.DrawCircle(200, 160, 90, paint);
  surface.Canvas.DrawRect(S.SKRect.Create(340, 70, 220, 180), paint);
  surface.Flush();
} finally { paint.Dispose(); }
console.log(surface.Backend, surface.RenderMode, surface.FallbackReasons);
// When removing the owning view:
// await surface.DisposeAsync();
```

Keep `lib/`, `vendor/` and required font assets in the same relative layout. `Initialize()` returns a cached namespace, not individual static ES-module exports. Options include `CanvasKit`, `fonts:false`, `fonts:[{url,family}]`, `fonts:[{data,family}]`, `isolated:true`, `signal`, `scriptUrl` and `wasmBaseUrl`. Font fetches overlap, but registration order remains deterministic.

Offscreen `SKSurface.Create(new SKImageInfo(width,height))` is synchronous. Onscreen creation is asynchronous. Use `FlushAsync()` when completion matters and `SnapshotAsync()` for CPU-readable Graphite exports. `Dispose()` invalidates an onscreen wrapper immediately and schedules GPU cleanup; `DisposeAsync()` also waits for cleanup. `allowFallback:false` requires the selected backend. A fallback may replace the original canvas; use `surface.Element`.

## Reusable component

```js
import { RegisterWebComponent } from './lib/index.js';
const S = await RegisterWebComponent();
const view = document.createElement('skia-canvas');
view.setAttribute('backend', 'auto');
view.style.cssText = 'width:100%;height:320px';
view.addEventListener('paintsurface', ({ detail: { Canvas, Info } }) => {
  const paint = new S.SKPaint({ IsAntialias:true, Color:S.SKColors.Teal });
  try {
    Canvas.Clear(S.SKColors.White);
    Canvas.DrawCircle(Info.Width/2, Info.Height/2, 80, paint);
  } finally { paint.Dispose(); }
});
view.addEventListener('surfaceerror', e => console.error(e.detail));
document.body.append(view);
await view.InvalidateSurface();
```

Invalidations share an animation frame and reuse an unchanged surface. Resize, backend changes, disconnect/reconnect and stale asynchronous initialization are managed by the scheduler. Explicit `width`/`height` attributes specify backing-store pixels; otherwise dimensions follow CSS size and device pixel ratio. `view.Statistics` exposes invalidations, frames, surface creation/reuse, discarded initializations and errors.

## Performance, precision and diagnostics

Immutable bitmap drawing reuses bounded native snapshots:

```js
bitmap.SetImmutable();
S.SKGraphics.SetBitmapCacheLimit(32 * 1024 * 1024);
surface.Canvas.DrawBitmap(bitmap, 20, 20);
console.log(S.SKGraphics.GetBitmapCacheStatistics());
S.SKGraphics.PurgeBitmapCache();
```

Mutable bitmaps remain uncached. Disposal, pixel-change notification and allocation replacement invalidate snapshots; LRU byte budgets bound retention. The separate Graphite image cache uses native image IDs for constant-time alias lookup and accounts for entry/byte limits and mipmaps. Font and effect caches retain their own budgets.

The checked repeated-bitmap benchmark improved from **43.28 ms to 31.43 ms (1.38x)** for 10,000 draws, with identical pixel hashes and snapshot construction reduced from 10,000 to one. This is a specific CPU-raster workload, not GPU throughput or a universal speedup. See [raw results and methodology](./docs/BITMAP-PERFORMANCE.md).

`ReadWebGPUTexture` preserves component bits for supported uncompressed color formats, handles padded rows and mip/array origins, and supports bounded `SKGPUReadbackPool` reuse. `SKImageReadPixelsResult.GetPixelSpan(Float32Array)` exposes F32 data without an RGBA8 conversion. `SKGraphiteContext.RequestReadPixels` preserves native F16/F32/HDR/color-space information. `SubmitAsync` fulfills completion without blocking the browser. Compressed and depth/stencil planes require explicit decoding rather than implicit reinterpretation.

`SKTraceMemoryDump`, `SKMemoryTrace`, `SKGraphics.DumpMemoryStatistics` and `GRContext.DumpMemoryStatistics` call the compiled native tracing interface. Values exceeding JavaScript's safe integer range use `BigInt`. Capability checks distinguish an older injected runtime from the shipped build.

## Delivered feature families

Paths and Boolean geometry; integer regions and native serialization; transforms/clipping/layers; gradients, runtime SkSL and specialized native image/color/path effects; mutable images, pixel formats, codecs and streams; family/style/character font matching; TTF/OTF/WOFF/WOFF2; variable TrueType/CFF2 and color fonts; shaping, bidi, paragraphs, glyph metrics/outlines and text blobs; pictures and drawables; native Skottie/resources and retained scene extensions; native searchable PDF plus managed PDF/XPS with explicit fallback reporting.

CFF2 rendering retains the resolved native hint program. Document CFF1 conversion preserves stem operators, masks, private dictionaries and subroutine semantics. Native compound effects avoid the old sampled JavaScript geometry path; stock-engine software effects use Float32 intermediates. Document formats still cannot represent every raster effect as exact vectors. `StrictVector:true` rejects unrepresentable managed output rather than silently rasterizing it.

## Tests and native build

```sh
npm run check
npm test
npm run coverage
npm run benchmark:bitmaps
```

The integrated source passed **345 Node tests**. Completed browser checks include **132 scene/backend combinations**, actual HTML-canvas presentation, redraw/lifetime behavior, native F16 Graphite-to-F32 readback, exact F32 texture copies and readback-buffer reuse. A seeded independent .NET corpus passed **39,224 numerical/Boolean comparisons against each of two SkiaSharp versions**. Chromium used SwiftShader, not a physical GPU. Counts and artifact provenance are in [the verification report](./docs/VERIFICATION.md).

GitHub Actions runs native builds, .NET reference comparisons, browser tests and Pages deployment. Successful native builds explicitly hand off to Pages, including bot-created runtime commits. Pinned build sources, patches and SHA-256 manifests are in [native/](./native/README.md).

## Detailed guides

[API usage](./docs/API_USAGE.md), [overload conventions](./docs/OVERLOAD_USAGE.md), [declaration audit](./docs/OVERLOAD_CONFORMANCE.md), [architecture](./docs/ARCHITECTURE.md), [fonts](./docs/FONT-FIDELITY.md), [effects](./docs/EFFECT_FIDELITY.md), [documents](./docs/DOCUMENTS.md), [resources and animation](./docs/ANIMATION_RESOURCES.md), [pixels and streams](./docs/ASSETS_STREAMS.md), [surface formats](./docs/SURFACE_FORMATS.md).

For C# ports, replace operators with named methods and `ref`/`out` with documented mutable destinations or result objects. `SKRect` constructors use edges; `SKRect.Create` uses width/height. Hex colors use .NET ARGB ordering. Dispose owned native resources deterministically; borrowed canvas and pixel views must not outlive their owners.

## Attribution

The API inventory is pinned to mono/SkiaSharp `b33cf54f24edc5347567c95b1924c447669c1de8`. The rendering engine uses Skia `f446aec4ce9e0e95e0a504e875955de3eb521f75`, compiled with Emscripten 4.0.8. This separate project is not officially affiliated with SkiaSharp. Preserve the project MIT license, Skia/CanvasKit notices and all font-processing and asset notices when redistributing. See `dist/licenses/`, `dist/vendor/`, and native third-party notices.

## Additional 0.4 precision and audit evidence

[Release details](./docs/RELEASE-0.4.md) include HDR data ownership, cache budgets, native matrix/clip tests, the bitmap benchmark and evidence-specific conformance reviews. Existing verification and provenance above are retained.
