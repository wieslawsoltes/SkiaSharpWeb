# SkiaSharp Web 0.3

SkiaSharp Web is an unofficial JavaScript graphics library with a familiar `SK*` API, a compiled Skia runtime with Graphite/Dawn WebGPU, Ganesh WebGL, and a raster Canvas fallback. It includes a reusable `<skia-canvas>` web component and a static Graphics Lab with 44 interactive examples.

This release ships the native Graphite extension as part of the bundled runtime, native region and compound path effects, Float32 effect intermediates, hint-preserving CFF document fonts, expanded native codecs and overload adapters, and native vector/searchable PDF. It also reduces primitive submission allocations and adds bounded font and GPU image caches. **Complete SkiaSharp API and behavioral parity is still not certified.** The pinned declaration audit, test evidence, and browser adaptations are documented in [COMPATIBILITY.md](./COMPATIBILITY.md) and [VERIFICATION.md](./docs/VERIFICATION.md).

## Run the sample app

The app and its rendering engine are bundled in `dist/`. No package installation, build step, external CDN, server application, or cloud credentials are required to serve it.

From the project directory:

```sh
python3 -m http.server 8080 -d dist
```

Open [http://localhost:8080](http://localhost:8080). `npm run serve` runs the same command. Use a current browser with WebAssembly and ES modules. HTTPS or localhost is required for the browser's WebGPU API. The renderer can fall back when WebGPU or WebGL is unavailable.

The sample app provides scene search, renderer selection, animation controls, custom text, effect intensity, adjustable primitive workloads, font uploads, variable-font/palette controls, PNG/PDF/XPS/SVG export, source snippets, and light/dark themes. Its timing display measures CPU-side drawing and submission time, including synchronous work; it is not a GPU execution-time measurement.

| Area | Included scenes |
| --- | --- |
| Drawing | Primitive geometry; Bézier paths; path Boolean operations and measurement; indexed vertices |
| Paint and effects | Gradients; strokes; image filters; blending; runtime SkSL; color matrices; extended pixel/path effects |
| Fonts and text | Typography; shaping; font manager; outlines; paragraphs; variable fonts; color palettes; CFF/CFF2 and table metadata |
| Canvas and resources | Transforms; clipping/layers; images; pixels; pictures; regions; drawables and canvas forwarding |
| Animation and scenes | Native Skottie animation; editable properties; resource providers; retained scenes and invalidation |
| Documents | Vector/searchable PDF and XPS; mixed vector and filtered graphics |
| GPU and performance | Adjustable primitive workload; live backend/capability diagnostics |

The scenes illustrate implemented features. They do not exercise every public method or every SkiaSharp feature.

## Use the library in a browser

Copy `dist/lib/`, `dist/vendor/`, and `dist/fonts/` into the same parent directory on your server, preserving their relative layout. Import the ES module and initialize the engine once:

```html
<canvas id="drawing" width="800" height="400"></canvas>
<script type="module">
  import { Initialize } from './lib/index.js';

  const S = await Initialize();
  const surface = await S.SKSurface.Create(
    document.querySelector('#drawing'),
    { backend: 'auto' }
  );
  const paint = new S.SKPaint({
    IsAntialias: true,
    Color: S.SKColor.Parse('#30DEAB')
  });

  try {
    surface.Canvas.Clear(S.SKColors.White);
    surface.Canvas.DrawCircle(200, 200, 100, paint);
    surface.Canvas.DrawRect(S.SKRect.Create(350, 100, 260, 200), paint);
    surface.Flush();
  } finally {
    paint.Dispose();
  }

  console.log(surface.Backend, surface.RenderMode, surface.FallbackReasons);
  window.addEventListener('pagehide', () => surface.Dispose(), { once: true });
</script>
```

`Initialize()` loads the bundled CanvasKit script, WASM, and fonts. It returns a cached namespace for subsequent calls. Use `isolated: true` when you need an independent namespace and font registry. Drawing types are properties of this returned namespace; they are not individual static ES-module exports.

Initialization options include:

| Option | Purpose |
| --- | --- |
| `CanvasKit` | Supply an already initialized CanvasKit instance, including in Node |
| `fonts: false` | Skip the bundled font loading step |
| `fonts: [{ url, family }]` | Load specified font files |
| `fonts: [{ data, family }]` | Register byte arrays already in memory |
| `scriptUrl` | Override the URL of the CanvasKit JavaScript loader |
| `wasmBaseUrl` | Override the base URL used to resolve the WASM asset |
| `isolated: true` | Create a separate API namespace instead of using the default cache |

Serve the WASM and font files as static assets. If loading them from another origin, that server must permit the browser's requests. The default paths work when the bundled directory layout is preserved.

## Choose a rendering backend

Onscreen creation is asynchronous:

```js
const surface = await S.SKSurface.Create(canvasElement, {
  backend: 'webgl',       // 'auto', 'webgpu', 'webgl', or 'canvas'
  allowFallback: false   // Require this backend, or report an error
});
```

With the default `allowFallback: true`, `auto` tries WebGPU, WebGL, then Canvas. An explicit `webgpu` request can fall back to WebGL and Canvas; `webgl` can fall back to Canvas. Inspect `surface.Backend` and `surface.FallbackReasons` to see the selected result. A fallback can replace the canvas DOM node; use `surface.Element` for the active onscreen element.

| Backend | Rendering work |
| --- | --- |
| WebGPU, `skia-graphite-webgpu` | The bundled Skia Graphite/Dawn engine renders geometry, text, images and native effects directly into a GPU texture. Presentation samples that texture without a CPU upload. |
| WebGPU, `native-primitives` / `skia-raster-upload` | Compatibility route for an injected engine without the native Graphite bindings. Eligible primitives use instanced WGSL; complex scenes use Skia raster upload. |
| WebGL | Skia Ganesh renders on a WebGL context. |
| Canvas | Skia rasterizes in WASM and presents through Canvas 2D. |
| Offscreen `raster` | `SKSurface.Create(SKImageInfo)` creates a synchronous software surface with the requested supported pixel format, color space, alpha type and stride. |

`S.NativeGpuCapabilities` and `S.SKGraphiteContext.IsBackendAvailable(...)` report the actual loaded bindings. The compiled runtime and reproducible native sources are described in [native/README.md](./native/README.md). Desktop driver pointers remain distinct from browser GPU handles.

On Graphite surfaces, use `await surface.FlushAsync()` when GPU completion matters and `await surface.SnapshotAsync()` for CPU-readable image exports. `surface.Flush()` submits without waiting. `surface.Dispose()` invalidates the wrapper immediately and schedules owned GPU cleanup after queued work; `await surface.DisposeAsync()` waits for that cleanup. Ordinary raster snapshots remain synchronous.

The Graphite gallery has been exercised through a real Dawn device using the SwiftShader software Vulkan adapter and compared with raster output. Physical GPU and browser-driver coverage are separate verification tasks; see [VERIFICATION.md](./docs/VERIFICATION.md).

For device-loss handling, onscreen creation accepts an `onDeviceLost` callback. The sample recreates its surface in this callback. Library consumers should similarly recreate surfaces and redraw their scene.

## Use the web component

`RegisterWebComponent()` registers `<skia-canvas>` and returns the initialized API. Set the element's CSS size, listen for `paintsurface`, then attach it:

```js
import { RegisterWebComponent } from './lib/index.js';

const S = await RegisterWebComponent();
const view = document.createElement('skia-canvas');
view.setAttribute('backend', 'auto');
view.style.cssText = 'width:100%;height:320px';
view.addEventListener('paintsurface', event => {
  const { Canvas, Info } = event.detail;
  const paint = new S.SKPaint({
    IsAntialias: true,
    Color: S.SKColors.CornflowerBlue
  });
  try {
    Canvas.Clear(S.SKColors.White);
    Canvas.DrawCircle(Info.Width / 2, Info.Height / 2, 80, paint);
  } finally {
    paint.Dispose();
  }
});
view.addEventListener('surfaceerror', event => console.error(event.detail));
document.body.append(view);
```

The component creates and flushes its surface, observes resize, and disposes the surface when disconnected. `backend`, `width`, and `height` attributes trigger recreation. Without explicit width/height attributes, backing dimensions follow CSS size and device pixel ratio. Event coordinates and `Info` dimensions are backing-store pixels. Call `view.InvalidateSurface()` to recreate and repaint after state changes; this is a surface recreation operation, not a retained-scene invalidation scheduler.

## Fonts and shaped text

Initialization registers bundled DejaVu font families. Load additional fonts from bytes, URLs, or user-selected files:

```js
const face = S.SKFontManager.Default.RegisterFont(
  new Uint8Array(await file.arrayBuffer())
);
const font = new S.SKFont(face, 38);
const paint = new S.SKPaint({ Color: S.SKColors.Black, IsAntialias: true });

try {
  surface.Canvas.DrawText('Measured text', 40, 70, font, paint);
  surface.Canvas.DrawShapedText(
    'Hello · مرحبا · שלום', 40, 145, font, paint,
    { Width: 720 }
  );
  surface.Flush();
} finally {
  paint.Dispose();
  font.Dispose();
  face.Dispose();
}
```

`DrawText` performs direct font drawing. Use `DrawShapedText`, `SKShaper`, or the `SKParagraphBuilder`/`SKParagraph` API for complex scripts, bidirectional text, ligatures, and wrapping. Shape results include glyph IDs, positions, clusters, and width, adapted from native SkParagraph output. Exact overload and indexing compatibility with `SkiaSharp.HarfBuzz` is not certified.

The font manager supports explicit registries, family/style sets, native style matching, glyph-coverage fallback, collection selection and font-table access. Advanced APIs include TTF/OTF/WOFF/WOFF2 processing, variable-design and palette arguments, TrueType/CFF/CFF2 glyph paths, color-font resources and table replacement. Static instances retain CFF2 for native rendering; document conversion preserves CFF stem hints and hint masks. The bounded font cache reuses normalization and instance work. See [FONT-FIDELITY.md](./docs/FONT-FIDELITY.md) for differential evidence and remaining qualifications.

Browsers do not automatically expose every installed OS font. `SKFontManager.CanAccessLocalFonts` reports the optional Local Font Access API, and `ImportLocalFonts()` can use it where the browser permits a user-initiated request. Uploaded and URL fonts remain the portable option. Detailed limits are in [COMPATIBILITY.md](./COMPATIBILITY.md#fonts-and-text).

## Export PDF and XPS

The document canvas uses the regular drawing API. Supported geometry and text remain vector, fonts are embedded, and PDF text includes searchable Unicode mappings. XPS produces an OPC package with vector Path/Glyphs content and embedded font/image resources.

```js
const document = S.SKDocument.CreatePdf({
  Title: 'Graphics report', RasterDpi: 144
});
const paint = new S.SKPaint({ Color: S.SKColors.Teal, IsAntialias: true });
const font = new S.SKFont(null, 28);
try {
  const page = document.BeginPage(595, 842);
  page.DrawText('Searchable drawing — café Ω', 36, 70, font, paint);
  page.DrawRoundRect(S.SKRect.Create(36, 105, 300, 160), 18, 18, paint);
  document.EndPage();
  const data = document.ToData();
  try {
    const pdfBlob = data.ToBlob('application/pdf');
    // Pass pdfBlob to your download or storage code.
  } finally { data.Dispose(); }
  console.log(document.RasterFallbacks);
} finally {
  font.Dispose(); paint.Dispose(); document.Dispose();
}
// S.SKDocument.CreateXps({ Title: 'Graphics report' }) uses the same canvas API.
```

The bundled engine uses native Skia PDF by default. It embeds supported text and vector content and handles filters according to the native PDF backend. Native Skia does not expose per-operation rasterization telemetry: `RasterFallbacks` is `null` and `RasterFallbackReporting` is `"UnavailableNative"`. The managed PDF writer (`NativeBackend: false`) and XPS writer report unsupported-operation raster patches; `StrictVector: true` rejects those operations. Native PDF/A metadata and output intents are available, but independent PDF/A certification is not claimed. See [document details](./docs/DOCUMENTS.md).

## Native animations and reusable scenes

Native Skottie evaluates Lottie content, including supported image/font resources, editable properties, slots, markers and timeline operations. Resource providers handle registered bytes, caching, data URIs and asynchronous URLs. The retained node hierarchy adds web-oriented scene composition, hit testing and conservative invalidation.

```js
const animation = await S.Skottie.Animation.CreateAsync('./animation.json');
if (!animation) throw new Error('Could not create animation.');
try {
  animation.SeekFrameTime(0.5);
  animation.Render(surface.Canvas, S.SKRect.Create(20, 20, 640, 360));
  surface.Flush();
} finally { animation.Dispose(); }
```

`Skottie`, `Resources` and `SceneGraph` are namespace properties of the initialized API. Unavailable native flags fail explicitly; retained scene nodes are documented web extensions rather than upstream .NET classes. See [animation/resource usage and ownership](./docs/ANIMATION_RESOURCES.md).

## Render from Node

Node needs an explicitly initialized CanvasKit instance because browser script injection is unavailable. Run this ES module from the project root:

```js
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Initialize } from './dist/lib/index.js';

const require = createRequire(import.meta.url);
const CanvasKitInit = require('./dist/vendor/canvaskit.cjs');
const CanvasKit = await CanvasKitInit({
  wasmBinary: fs.readFileSync(new URL('./dist/vendor/canvaskit.wasm', import.meta.url))
});
const S = await Initialize({ CanvasKit, fonts: false });
const face = S.SKFontManager.Default.RegisterFont(
  fs.readFileSync(new URL('./dist/fonts/DejaVuSans.ttf', import.meta.url)),
  'DejaVu Sans'
);
face.Dispose();

const surface = S.SKSurface.Create(new S.SKImageInfo(640, 320));
const paint = new S.SKPaint({ Color: S.SKColors.Teal, IsAntialias: true });
let image, data;
try {
  surface.Canvas.Clear(S.SKColors.White);
  surface.Canvas.DrawCircle(320, 160, 110, paint);
  image = surface.Snapshot();
  data = image.Encode(S.SKEncodedImageFormat.Png, 100);
  fs.writeFileSync('drawing.png', data.ToArray());
} finally {
  data?.Dispose();
  image?.Dispose();
  paint.Dispose();
  surface.Dispose();
}
```

`fonts: false` avoids default font URL loading in Node. Register bytes as shown, or pass `fonts: [{ data, family }]`. The bundled `.cjs` loader provides the CommonJS entry point within this ES-module project.

## Lifetime and porting conventions

The public names deliberately use PascalCase: `SKSurface.Create`, `surface.Canvas`, `paint.Color`, `DrawPath`, `MeasureText`, and `Dispose`. JavaScript still has different language and browser semantics:

- Use `await` for initialization, URL loading, and onscreen surface creation. Offscreen creation from `SKImageInfo` is synchronous.
- Replace C# object initializers with constructor options where accepted or ordinary assignments.
- Replace operators with explicit methods such as `Equals`, `SKPoint.Add`, and `SKMatrix.Concat`.
- Inspect returned objects for adapted `out` results; for example, `matrix.TryInvert()` returns `{ Success, Inverse }`.
- `new SKRect(left, top, right, bottom)` uses edges. `SKRect.Create(x, y, width, height)` uses a size.
- `SKColor.Parse` uses .NET hexadecimal forms, including `#AARRGGBB`; eight-digit input is not CSS `#RRGGBBAA`.
- Use the exported enum values. Native CanvasKit enum objects are not interchangeable with every numeric C# enum value.

Dispose native-backed resources deterministically. Paints, paths, fonts, images, effects, pictures, codecs, documents, and surfaces can retain WASM or GPU memory that JavaScript garbage collection does not release for you. `try/finally` works in both browser and Node code. `Dispose()` is idempotent and supported methods reject disposed resources.

Paint assignment retains shader/filter/path-effect references, font objects retain their typefaces, and snapshots own references independent of their source surface. Dispose the returned objects you own. A surface's `Canvas` is a borrowed view tied to that surface, and a picture recording canvas is invalid after recording ends. Borrowed bitmap/pixmap pixel views must not outlive their owner; copy bytes with `slice()` when they need an independent lifetime.

## Project layout and validation

| Path | Purpose |
| --- | --- |
| `dist/lib/index.js` | Initialization and web component |
| `dist/lib/core.js`, `paths.js`, `canvas.js`, `images.js` | Values, native drawing, geometry, surfaces, pixels and codecs |
| `dist/lib/fonts.js`, `font-engine.js` | Font registry/processing, glyphs, blobs and paragraphs |
| `dist/lib/regions.js`, `effects.js`, `path-effects.js` | Region geometry and extended effect graphs |
| `dist/lib/overloads.js`, `canvas-effects.js`, `layer-effects.js` | Argument adapters and integrated effect execution |
| `dist/lib/animation.js`, `specialized.js` | Skottie, resource providers, scenes, drawables and forwarding canvases |
| `dist/lib/documents.js` | Native PDF, managed PDF/XPS and explicit fallback recording |
| `dist/lib/gpu.js`, `webgpu.js` | GPU adapters, capability detection, custom WGSL rendering/presentation |
| `dist/*samples*.js` | Reusable definitions for the 44 showcase scenes |
| `dist/vendor/`, `dist/fonts/` | Bundled runtime/processing engines, fonts and their notices |
| `native/` | Exact compiled extension sources, pinned revisions, patches, build script, artifact hashes and notices |
| `tests/` | Engine, adapter, document, font, animation, effect and resource checks |
| `docs/` | Architecture, usage, declaration audit and verification reports |

Run `npm test` for automated checks and `npm run check` for syntax, imports and entry assets. `npm run benchmark` measures CPU rendering/submission preparation; optional `npm run verify:graphite` and `npm run verify:webgpu` exercise a supplied Node WebGPU runtime. See [PERFORMANCE.md](./docs/PERFORMANCE.md) for reproducible commands and measurement limits. The integration suite renders each sample through the actual software Skia engine and writes PNGs under `test-output/`. Software rendering checks do not establish WebGPU or WebGL behavior on a physical device. Backend-specific browser results and exact pass counts should be taken from the accompanying verification report when present.

## Upstream references and licensing

The API research is pinned to [mono/SkiaSharp commit `b33cf54f24edc5347567c95b1924c447669c1de8`](https://github.com/mono/SkiaSharp/tree/b33cf54f24edc5347567c95b1924c447669c1de8), dated 2026-09-08. The [pinned declaration inventory](./docs/UPSTREAM_API_INVENTORY.md) and [overload audit](./docs/OVERLOAD_CONFORMANCE.md) track upstream signatures, adaptation choices and remaining rows. Inventory totals describe upstream source, not implemented or verified API counts.

The JavaScript adaptation is a separate project; SkiaSharp names describe its compatibility goal and do not imply official affiliation. The bundled runtime is [CanvasKit](https://github.com/google/skia/tree/main/modules/canvaskit), Skia compiled to WebAssembly. It is a real external rendering dependency, shipped with the distribution. Preserve the project license, CanvasKit/Skia notices, bundled font licenses and all font-processing dependency notices when redistributing. Refer to the delivered vendor/license files and [font implementation report](./docs/FONT-IMPLEMENTATION.md) for those dependencies.
