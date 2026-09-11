# API usage

Import `dist/lib/index.js` and call `Initialize()` once. It returns the JavaScript API namespace: constructors, enums, font management, canvas/surface wrappers, image codecs, and document helpers. Method and property names use .NET-style PascalCase. JavaScript adaptations use typed arrays instead of pointers and return result objects where C# uses `out` parameters. This release includes managed overload adapters and expanded font/effect/document/animation APIs. Consult the declaration audit and implementation reports before porting an application; full overload and behavioral parity is not certified.

## Browser initialization and drawing

Serve the project through HTTP or HTTPS. Keep `dist/lib`, `dist/vendor`, and `dist/fonts` together so the default asset URLs resolve.

```html
<canvas id="drawing" width="800" height="440"></canvas>
<script type="module">
  import { Initialize } from './dist/lib/index.js';

  const S = await Initialize();
  const surface = await S.SKSurface.Create(
    document.querySelector('#drawing'),
    { backend: 'auto' }
  );
  const canvas = surface.Canvas;
  const paint = new S.SKPaint({
    Color: S.SKColors.CornflowerBlue,
    IsAntialias: true
  });

  canvas.Clear(S.SKColors.White);
  canvas.DrawRoundRect(S.SKRect.Create(40, 40, 260, 140), 24, 24, paint);
  canvas.DrawCircle(440, 110, 70, paint);
  surface.Flush();
  paint.Dispose();

  console.log(surface.Backend, surface.RenderMode, surface.FallbackReasons);
  window.addEventListener('pagehide', () => surface.Dispose(), { once: true });
</script>
```

`backend` accepts `auto`, `webgpu`, `webgl`, or `canvas`. `auto` attempts them in that order. Set `allowFallback: false` to require the requested backend. WebGL uses native Skia GPU rendering. Canvas uses native Skia software rasterization with Canvas 2D presentation. WebGPU renders eligible simple primitive frames directly; complex drawing uses Skia software rasterization followed by WebGPU presentation. Read `RenderMode` after `Flush()` to see the actual path. WebGPU requires a supported browser and a secure context, including localhost.

A fallback may replace the original HTML canvas because one element cannot host incompatible context types. Use `surface.Element` when attaching input handlers after initialization. Dispose and recreate a surface when changing its pixel dimensions.

## Reusable web component

The optional `<skia-canvas>` element manages initialization, resizing, disposal, and paint events. Register listeners before connecting an element.

```js
import { RegisterWebComponent } from './dist/lib/index.js';

const S = await RegisterWebComponent();
const view = document.createElement('skia-canvas');
view.setAttribute('backend', 'auto');
view.style.cssText = 'display:block;width:640px;height:320px';
view.addEventListener('paintsurface', ({ detail: { Canvas, Info } }) => {
  const paint = new S.SKPaint({ Color: S.SKColors.Teal, IsAntialias: true });
  try {
    Canvas.Clear(S.SKColors.White);
    Canvas.DrawCircle(Info.Width / 2, Info.Height / 2, 80, paint);
  } finally {
    paint.Dispose();
  }
});
view.addEventListener('surfaceerror', event => console.error(event.detail));
document.body.append(view);
// Call view.InvalidateSurface() when application state changes.
```

The event's `Info` contains physical pixel dimensions. The component flushes after the synchronous paint listener returns. Store application state separately and redraw on each event; resizing recreates the surface.

## Node and headless raster output

Use an ESM script beside `dist`. Node receives an explicitly initialized CanvasKit instance and font bytes, avoiding browser asset loading. The distributed `canvaskit.cjs` is the same engine in a CommonJS-compatible filename.

```js
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { Initialize } from './dist/lib/index.js';

const require = createRequire(import.meta.url);
const CanvasKitInit = require('./dist/vendor/canvaskit.cjs');
const CanvasKit = await CanvasKitInit({
  wasmBinary: readFileSync(new URL('./dist/vendor/canvaskit.wasm', import.meta.url))
});
const S = await Initialize({ CanvasKit, fonts: false });
const registered = S.SKFontManager.Default.RegisterFont(
  readFileSync(new URL('./dist/fonts/DejaVuSans.ttf', import.meta.url))
);
registered.Dispose();

const surface = S.SKSurface.Create(new S.SKImageInfo(640, 240));
const paint = new S.SKPaint({ Color: S.SKColors.DarkSlateBlue, IsAntialias: true });
const face = S.SKFontManager.Default.MatchFamily('DejaVu Sans');
const font = new S.SKFont(face, 36);
face.Dispose();
try {
  surface.Canvas.Clear(S.SKColors.White);
  surface.Canvas.DrawText('Hello from Skia', 28, 92, font, paint);
  surface.Flush();
  const image = surface.Snapshot();
  try {
    const png = image.Encode(S.SKEncodedImageFormat.Png, 100);
    try { writeFileSync('drawing.png', png.AsSpan()); }
    finally { png.Dispose(); }
  } finally { image.Dispose(); }
} finally {
  font.Dispose();
  paint.Dispose();
  surface.Dispose();
}
```

`SKSurface.Create(SKImageInfo)` is synchronous and creates a software raster surface. `SKSurface.Create(HTMLCanvasElement, options)` is asynchronous. `Initialize({ isolated: true, ... })` creates a separate wrapper namespace; normal initialization reuses the first namespace, so configure fonts and assets on the first call.

## Fonts, shaping, and paragraphs

Browser initialization registers the bundled DejaVu Sans, Serif, and Sans Mono fonts by default. Custom font registration accepts byte arrays. A manager owns its registered face independently of the wrapper returned by registration.

```js
const registered = await S.SKFontManager.Default.RegisterFontFromUrl('./my-font.ttf');
console.log(registered.FamilyName, registered.GlyphCount, registered.UnitsPerEm);
registered.Dispose();

const face = S.SKFontManager.Default.MatchFamily('DejaVu Sans', S.SKFontStyle.Normal);
const font = new S.SKFont(face, 28);
face.Dispose();
const paint = new S.SKPaint({ Color: S.SKColors.Black, IsAntialias: true });
try {
  canvas.DrawText('Simple text', 20, 45, font, paint);
  canvas.DrawShapedText('office العربية שלום', 20, 95, font, paint);
} finally {
  font.Dispose();
  paint.Dispose();
}
```

Use `DrawShapedText`, `SKShaper`, or `SKParagraphBuilder` for ligatures, bidirectional text, and complex scripts. `DrawText` is the direct text-drawing API. `SKFont.GetGlyphs()` maps Unicode to glyph IDs and does not perform shaping.

```js
const builder = new S.SKParagraphBuilder({
  TextStyle: {
    FontFamilies: ['DejaVu Sans'],
    FontSize: 24,
    Color: S.SKColors.Black
  }
});
builder.AddText('A paragraph can wrap and shape العربية and שלום.');
const paragraph = builder.Build();
builder.Dispose();
try {
  paragraph.Layout(360);
  canvas.DrawParagraph(paragraph, 20, 130);
  console.log(paragraph.Height, paragraph.GetLineMetrics());
  console.log(paragraph.GetGlyphPositionAtCoordinate(50, 12));
} finally {
  paragraph.Dispose();
}
surface.Flush();
```

`SKFontManager.Default.MatchCharacter(family, style, languages, codepoint)` searches registered faces for a supported character. Font tables, glyph metrics, TrueType/CFF/CFF2 outlines, collections, variable-design arguments, color-font resources and palette operations have explicit APIs. Registered fonts determine glyph availability; the browser's installed fonts are not automatically enumerated. Local-font access, where available, requires the browser's permission flow. The delivered instancing engines and exact font-format qualifications are maintained in [FONT-IMPLEMENTATION.md](./FONT-IMPLEMENTATION.md).

## Images, bitmap pixels, and animation

```js
const image = await S.SKImage.FromEncodedDataAsync('./photo.webp');
if (!image) throw new Error('Image bytes could not be decoded.');
try {
  canvas.DrawImage(image, S.SKRect.Create(20, 20, 320, 200));
  const png = image.Encode(S.SKEncodedImageFormat.Png, 100);
  try {
    const blob = png.ToBlob('image/png');
    // Use blob with your download, upload, or persistence code.
  } finally { png.Dispose(); }
} finally { image.Dispose(); }
surface.Flush();
```

`SKImage.FromEncodedData(bytes)` is synchronous for `Uint8Array`, `ArrayBuffer`, `SKData`, or `SKStream` inputs. `FromEncodedDataAsync` also accepts URLs and `Blob`. PNG, JPEG, and WebP encoding are implemented with native codecs; other encoding formats fail explicitly. `Encode` returns an owned `SKData`.

```js
const bitmap = new S.SKBitmap(128, 128);
try {
  bitmap.Erase(S.SKColors.White);
  bitmap.SetPixel(10, 20, S.SKColors.Red);
  console.log(bitmap.GetPixel(10, 20));

  // A mutable bitmap can be a drawing target.
  const bitmapCanvas = new S.SKCanvas(bitmap);
  const paint = new S.SKPaint({ Color: S.SKColors.Blue, IsAntialias: true });
  try { bitmapCanvas.DrawCircle(64, 64, 30, paint); }
  finally { paint.Dispose(); bitmapCanvas.Dispose(); }

  const snapshot = S.SKImage.FromBitmap(bitmap);
  try { canvas.DrawImage(snapshot, 400, 20); }
  finally { snapshot.Dispose(); }
} finally { bitmap.Dispose(); }
```

`GetPixels()`/`GetPixelSpan()` return borrowed WASM byte views. Their layout follows `Info` and `RowBytes`, including premultiplied alpha where selected. Call `NotifyPixelsChanged()` after direct byte edits, and obtain a fresh view after an allocation that may grow WASM memory. `SKImage.ReadPixels()` without arguments instead returns a copied RGBA8888, unpremultiplied buffer. `SKImage.FromBitmap()` produces an independent snapshot.

For animation, call `const codec = S.SKCodec.Create(bytes)`, inspect `FrameCount`, `RepetitionCount`, and `FrameInfo`, and obtain each composited frame with `codec.GetImage(index)`. Frame durations are in milliseconds. Dispose each returned `SKImage` and the codec. Frame dependency and completeness metadata are unavailable and are returned as `null`.

## Vector PDF and XPS documents

`SKDocument.CreatePdf()` writes vector-capable multipage PDF files with embedded fonts and Unicode text maps. `CreateXps()` writes OPC XPS with FixedPage paths, glyphs, embedded fonts and images. Page dimensions are points. `RasterDpi` defaults to 144 and controls fallback patch resolution rather than converting every page to an image.

```js
const output = new S.SKDynamicMemoryWStream();
const document = S.SKDocument.CreatePdf(output, {
  Title: 'Drawing report', Author: 'Application user', RasterDpi: 144
});
const paint = new S.SKPaint({ Color: S.SKColors.Teal, IsAntialias: true });
const font = new S.SKFont(null, 28);
try {
  const page = document.BeginPage(595, 842);
  page.Clear(S.SKColors.White);
  page.DrawText('Searchable graphics — café Ω', 36, 70, font, paint);
  page.DrawRoundRect(S.SKRect.Create(36, 105, 523, 180), 16, 16, paint);
  document.EndPage();
  document.Close();

  const data = output.DetachAsData();
  try {
    const pdfBlob = data.ToBlob('application/pdf');
    // Node: writeFileSync('report.pdf', data.AsSpan());
  } finally { data.Dispose(); }
  console.log(document.RasterFallbacks);
} finally {
  font.Dispose(); paint.Dispose(); document.Dispose(); output.Dispose();
}
```

Create XPS using `S.SKDocument.CreateXps(output, 144)` or `S.SKDocument.CreateXps({Title:'Drawing report'})`; the page drawing API is the same. Its MIME type is `application/vnd.ms-xpsdocument`. Without an output stream, `document.ToData()` closes the document and returns owned bytes synchronously.

Each page canvas becomes invalid after `EndPage()`. Finish with `Close()` or `ToData()`; disposing an unfinished document aborts it. Output stream and returned data remain caller-owned.

With the managed PDF writer (`NativeBackend: false`) or XPS, unsupported operations become bounded raster patches and appear in `RasterFallbacks` with the page, operation, reason and pixel bounds. The default native PDF backend reports `RasterFallbacks = null` because Skia does not expose this telemetry. Rich paragraphs/effected text can retain a searchable glyph overlay. For an external renderer that bypasses public drawing methods:

```js
page.DrawNative(
  nativeCanvas => externalRenderer.Draw(nativeCanvas),
  'External native renderer'
);
```

The callback receives an unproxied SKCanvas, must complete synchronously and should preserve canvas state. Native Skottie uses this route when drawn into a document. See [DOCUMENTS.md](./DOCUMENTS.md) for conic approximations, unsupported vector effects, XPS reader differences and PDF/A/tagging limitations.

## Regions, effects and specialized canvases

Regions use integer coordinates and exact band/interval Boolean algebra. Mutating operations update the receiver; snapshots such as a returned boundary path have their own lifetime.

```js
const region = new S.SKRegion();
region.SetRects([
  new S.SKRectI(20, 20, 180, 100),
  new S.SKRectI(100, 60, 260, 180)
]);
const boundary = region.GetBoundaryPath();
try {
  const saved = canvas.Save();
  try {
    canvas.ClipRegion(region);
    canvas.DrawPath(boundary, paint);
  } finally { canvas.RestoreToCount(saved); }
} finally { boundary.Dispose(); region.Dispose(); }
```

Extended effects share the normal paint properties. Native effects continue through Skia; missing native factories create owned software descriptors that participate in real drawing, clipping, composition and layers.

```js
const table = Uint8Array.from({ length: 256 }, (_, i) => 255 - i);
const filter = S.SKColorFilter.CreateTable(null, table, null, null);
paint.ColorFilter = filter;
filter.Dispose(); // Paint retains its own effect.
canvas.DrawCircle(160, 120, 70, paint);
paint.ColorFilter = null;
```

`SKPathEffect.CreateCompose`, `CreateSum`, and `CreateTrim` extend reusable path effects. Software pixel stages and some compound geometry effects have numerical/coordinate qualifications; see [REGIONS_AND_EFFECTS.md](./REGIONS_AND_EFFECTS.md).

`SKDrawable` accepts a drawing callback and declared bounds. `SKNoDrawCanvas` tracks state without drawing; `SKNWayCanvas` forwards drawing and state to caller-owned targets.

```js
const drawable = new S.SKDrawable(
  target => target.DrawCircle(50, 50, 40, paint),
  S.SKRect.Create(0, 0, 100, 100)
);
const forwarding = new S.SKNWayCanvas(800, 440);
try {
  forwarding.AddCanvas(canvas);
  forwarding.DrawDrawable(drawable, 120, 80);
  const picture = drawable.Snapshot();
  try { canvas.DrawPicture(picture, new S.SKPoint(300, 80)); }
  finally { picture.Dispose(); }
} finally { forwarding.Dispose(); drawable.Dispose(); }
```

Forwarding does not transfer ownership of target canvases. Drawable callback resources, including the paint in this example, remain the callback owner's responsibility.

## Skottie animation and resource providers

Use `S.Skottie.Animation` for native Lottie evaluation/rendering. Bytes and registered resources can load synchronously; URLs use asynchronous APIs and browser CORS.

```js
const animation = await S.Skottie.Animation.CreateAsync('./animation.json', {
  fontManager: S.SKFontManager.Default
});
if (!animation) throw new Error('Animation could not be parsed.');
try {
  animation.SeekFrameTime(0.75);
  animation.Render(canvas, S.SKRect.Create(20, 20, 640, 360));
  surface.Flush();
  console.log(animation.Duration, animation.Fps, animation.Markers);
} finally { animation.Dispose(); }
```

`Seek` takes a normalized fraction; `SeekFrame` takes a frame relative to the in point; `SeekFrameTime` accepts seconds or `SKTimeSpan`. Apply property/slot overrides after seeking because animated properties can overwrite earlier values. Providers can preload image/font resources for synchronous builds and later image-slot changes.

```js
const resources = new S.Resources.ResourceProvider()
  .Register('images/logo.png', pngBytes)
  .Register('scene.json', jsonBytes);
const builder = S.Skottie.Animation.CreateBuilder()
  .SetFontManager(S.SKFontManager.Default)
  .SetResourceProvider(resources);
const animation = builder.Build('scene.json');
builder.Dispose(); resources.Dispose();
// The built animation retains its native resources; dispose it when finished.
```

`S.SceneGraph` includes upstream invalidation tracking and web-extension retained nodes for geometry, groups, images, text, clips, drawables and animation. Group membership and scene roots do not transfer disposal ownership. See [ANIMATION_RESOURCES.md](./ANIMATION_RESOURCES.md) for exact flags, editing, slots, hit testing and lifecycle behavior.

## GPU interop and capability inspection

```js
console.log(S.NativeGpuCapabilities);
console.log(surface.Backend, surface.RenderMode);
const context = surface.Context;
if (context) console.log(context.GetResourceCacheUsage());
const graphiteAvailable = S.SKGraphiteContext.IsBackendAvailable(
  S.SKGraphiteBackend.Dawn
);
```

Stock WebGL/Ganesh supports normal rendering and browser context/resource adapters. An exported method that needs missing native bindings throws instead of silently ignoring the request. Dispose surfaces before their owning GPU context.

The bundled runtime includes compiled Graphite/Dawn bindings and the sample selects that route when WebGPU is available. Native GPU execution has been verified using Dawn with SwiftShader; physical GPU validation remains separate. Exact build sources and asynchronous lifetime requirements are in [native/README.md](../native/README.md). Use `await surface.FlushAsync()` for completion, `await surface.SnapshotAsync()` for CPU-readable snapshots, and `await surface.DisposeAsync()` when cleanup must finish before the device is reused. The custom primitive/raster presenter remains available for injected engines without Graphite.

## Porting and ownership

| C# pattern | JavaScript pattern |
| --- | --- |
| `new SKPaint { Color = SKColors.Red }` | `new S.SKPaint({ Color: S.SKColors.Red })` |
| `using var image = ...` | `try { ... } finally { image.Dispose(); }` |
| `SKMatrix.TryInvert(out inverse)` | `const { Success, Inverse } = matrix.TryInvert()` or pass an output matrix |
| `SKFont.BreakText(...)` with output arguments | Read the returned result object's text/measurement fields |
| Native pixel pointer | Borrowed typed-array view with documented ownership |
| File/stream decoding | Byte arrays, `SKData`, `SKMemoryStream`, or explicit async URL/Blob methods |

Dispose native-backed resources explicitly: surfaces, paints, effects, paths, images, bitmaps, codecs, fonts, text blobs, paragraphs, and documents. Value types such as `SKColor`, `SKRect`, `SKPoint`, and `SKMatrix` do not require disposal. Objects returned by factories generally belong to the caller; resource-owning wrappers such as paint and font retain their native dependencies.

Run the portable module tests from the repository root with `node --test tests/*.test.mjs`. They load the bundled engine and fonts; no system font installation or workspace-specific path is required. Independent document checks use Poppler and PyMuPDF where available; optional tooling is reported through explicit skips. Use [VERIFICATION.md](./VERIFICATION.md) for current counts and backend execution evidence.


## Managed overload forms

Many C# argument forms are adapted explicitly. Use mutable objects for output structs and arrays/typed arrays for spans. Typed arrays must have enough capacity; text bytes need an explicit encoding when the overload requires it.

```js
const inverse = new S.SKMatrix();
const success = matrix.TryInvert(inverse);
const bounds = new S.SKRect();
const width = font.MeasureText('Text', bounds, paint);
const glyphs = font.GetGlyphs('Text');
const widths = new Float32Array(glyphs.length);
const glyphBounds = [];
font.GetGlyphWidths(glyphs, widths, glyphBounds, paint);
```

Convenience calls remain available: `TryInvert()` returns `{Success,Inverse}`; `BreakText(text,width)` returns its measurement object, while an explicit mutable output supports the count-return form. UTF-16/UTF-32 byte buffers use little-endian encoding. In glyph APIs, `Uint16Array` represents glyph IDs rather than Unicode text. See [OVERLOAD_USAGE.md](./OVERLOAD_USAGE.md) and the per-signature [declaration audit](./OVERLOAD_CONFORMANCE.md).


## Graphite image cache and records

`SKGraphiteImageCache.FindOrCreate(recorder, image, mipmapped)` creates or reuses a native texture image for the selected recorder. Each result is independently owned and must be disposed. The cache retains at most 256 entries; `Dispose()` releases cached references while caller-owned results and submitted recordings retain theirs. Dispose cached images before their recorder. `GetStatistics()` reports hits, uploads, evictions and retained count.

`SKGraphiteDawnBackendContextInit` accepts browser GPU objects for Instance, Device and Queue. The queue must be the device's queue and browser contexts require NonYielding. Integer process pointers are rejected. Graphite option/submit/recording records provide value equality and deterministic JavaScript hashes; hash values are not .NET randomized hash codes.
