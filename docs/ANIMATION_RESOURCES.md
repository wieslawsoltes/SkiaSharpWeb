# Skottie, resources and scene graph

`animation.js` implements the public `SkiaSharp.Skottie`, `SkiaSharp.Resources`, and `SkiaSharp.SceneGraph.InvalidationController` families from the pinned upstream inventory, with the qualifications below. Lottie parsing, animation evaluation, compositing, text rendering, property observation, slots, and editing execute in CanvasKit's **native Skottie engine**. No approximate JavaScript Lottie renderer is substituted.

The module is installed after the core, paths, fonts, images and canvas factories:

```js
import { createAnimationAPI } from './animation.js';
Object.assign(api, createAnimationAPI(CanvasKit, api));

const { Skottie, Resources, SceneGraph } = api;
const animation = Skottie.Animation.Parse(json);
animation.SeekFrameTime(0.5);
animation.Render(surface.Canvas, api.SKRect.Create(20, 20, 640, 360));
surface.Flush();
animation.Dispose();
```

The classes are also exported at the API root, so `api.Animation` and `api.Skottie.Animation` are identical. `SKTimeSpan` and `Skottie.TimeSpan` expose `TotalSeconds`, `TotalMilliseconds`, and `Ticks`. A time span also converts numerically to seconds.

## Loading and ownership

`Animation.Parse` accepts a JSON string, a plain Lottie object, or UTF-8 bytes. `Create`, `TryCreate`, and `TryParse` accept `SKData`, `SKStream`, an `ArrayBuffer`, and typed arrays. `TryParse`/`TryCreate` return `{ Success, Animation }`; passing a final output object instead returns a boolean and assigns its `.Animation` property. Malformed JSON or an invalid animation document returns `null`. Null input and unsupported input types throw.

`Animation.CreateBuilder(flags)` supplies the upstream `AnimationBuilder` API: `SetFontManager`, `SetResourceProvider`, `Build`, and `Stats`. A builder snapshots font bytes when a manager is assigned. The default uses the registered `SKFontManager.Default` fonts present when the builder is created. Fonts and image bytes are copied into native animation resources, so disposing the original data, font manager, provider wrapper, or builder does not invalidate an already built animation. Builders also retain the internal resource-provider storage independently of public disposal. Registry changes before a subsequent build are visible to that build; already built animations remain independent.

Browsers cannot synchronously open arbitrary operating-system paths. `Build("scene.json")` resolves a preloaded provider resource. Network files and `Blob`/`File` objects use `BuildAsync` or `Animation.CreateAsync`. Asynchronous file loads preserve the input source; explicit `baseUrl` resolves relative asset references. For a URL passed to `Animation.CreateAsync`, the base URL defaults to its containing directory. Network access obeys browser CORS.

```js
const resources = new Resources.ResourceProvider()
  .Register('images/logo.png', pngBytes)
  .Register('scene.json', jsonBytes);
const cached = new Resources.CachingResourceProvider(resources);
const builder = Skottie.Animation.CreateBuilder()
  .SetFontManager(api.SKFontManager.Default)
  .SetResourceProvider(cached);
const animation = builder.Build('scene.json');
builder.Dispose();
cached.Dispose();
resources.Dispose();
// The animation retains its own native resources.
```

`ResourceProvider.Register` copies bytes. `Load(name)` and `Load(path,name)` return independent `SKData` objects that the caller disposes. `CachingResourceProvider` caches successful loads and coalesces asynchronous requests. `Clear` invalidates its cache. `DataUriResourceProvider` handles both base64 and binary percent-escaped data URIs and optionally delegates to a fallback. `FileResourceProvider` uses a URL base directory and asynchronous fetch; it also resolves explicitly registered files synchronously.

`RegisterUrl(name,url,fetchOptions)` queues a resource. `LoadAsync` loads a single resource; `Preload` fetches all queued URLs. Preload resources that will later be selected by image slots even when the initial document does not reference them.

```js
const resources = new Resources.FileResourceProvider('/animations/');
resources.RegisterUrl('alternate.png', '/media/alternate.png');
await resources.Preload();
const animation = await Skottie.Animation.CreateAsync('/animations/scene.json', {
  resourceProvider: resources,
  fontManager: api.SKFontManager.Default
});
```

Image resources are given unique native resource names during build, preserving distinct files that share a basename in different directories. Embedded image data URIs and registered font resources are resolved before native compilation. External precomposition resources available in the registry are passed through to CanvasKit's `__` precomposition interception mechanism. The parser retains diagnostic warnings and errors in `animation.Diagnostics`.

## Timeline, properties and slots

`Duration`, `Fps`, `InPoint`, `OutPoint`, `Version` and `Size` expose animation metadata. `Seek(percent)` uses a normalized 0–1 fraction; `SeekFrame(frame)` is relative to the animation's in point; `SeekFrameTime(secondsOrTimeSpan)` converts seconds to frames. Fractional frames are supported. Timeline positions are clamped to the animation duration. Seeking returns the native invalidation rectangle and can accumulate it into an `InvalidationController`. `Markers` exposes name, normalized start/end and relative frame start/end.

```js
const damage = new SceneGraph.InvalidationController();
animation.SeekFrame(36.5, damage);
console.log(damage.Bounds, animation.Markers);
damage.Reset();
damage.Dispose();
```

The following web additions wrap native managed-Skottie features:

| API | Behavior |
| --- | --- |
| `GetColorProperties`, `SetColor` | Named RGBA property inspection and override. |
| `GetOpacityProperties`, `SetOpacity` | Named opacity on a 0–100 scale. |
| `GetTextProperties`, `SetText` | Replace text and size while native Skottie retains the other text settings. |
| `GetTransformProperties`, `SetTransform` | Anchor, position, percentage scale, rotation, skew and skew axis. |
| `GetSlotInfo` | Enumerate color, scalar, vector, image and text slots. |
| `SetColorSlot` / `GetColorSlot` | Native color slot values. |
| `SetScalarSlot` / `GetScalarSlot` | Native scalar slot values. |
| `SetVectorSlot` / `GetVectorSlot` | Native 2D vector slot values. |
| `SetImageSlot` | Select a resource previously registered under the supplied name. |
| `SetTextSlot` / `GetTextSlot` | Native slottable text style/value fields. |
| `AttachEditor`, `EnableEditor` | Attach native text editing to a named text property and occurrence. |
| `DispatchEditorKey`, `DispatchEditorPointer` | Forward keyboard/pointer input to the native editor. |
| `SetEditorCursorWeight` | Adjust native text-editor cursor width. |
| `AnimationBuilder.SetSoundMap` | Supply `getPlayer(id)` objects with `seek(seconds)` callbacks. Playback is the caller's responsibility. |
| `AnimationBuilder.SetPropertyPrefix` | Restrict property observation to the supplied native property prefix. |

**Apply overrides after seeking.** Animated native properties can overwrite previously assigned values on the next seek. This preserves CanvasKit's behavior and makes frame evaluation predictable:

```js
animation.SeekFrameTime(elapsed);
animation.SetColor('Accent', api.SKColors.Cyan);
animation.SetTransform('Mover', {
  Anchor: [0, 0], Position: [160, 90], Scale: [120, 80],
  Rotation: 30, Skew: 0, SkewAxis: 0
});
animation.Render(surface.Canvas);
```

After `AttachEditor` and `EnableEditor(true)`, render one frame before dispatching keyboard or pointer events; native editing obtains its glyph hit geometry during rendering.

Text-slot field names follow CanvasKit's text structure with optional leading PascalCase: `Text`, `Typeface`, `TextSize`, `MinTextSize`, `MaxTextSize`, `StrokeWidth`, `LineHeight`, `LineShift`, `Ascent`, `MaxLines`, `HorizAlign`, `VertAlign`, `StrokeJoin`, `Direction`, `Linebreak`, `Resize`, `BoundingBox`, `FillColor`, and `StrokeColor`. Enum values use the CanvasKit enum objects already supplied by this runtime. Typeface handles returned from native slot inspection are native reference-counted handles; dispose those with `.delete()` when finished.

## Scene graph

The pinned upstream .NET `SkiaSharp.SceneGraph` public inventory contains `InvalidationController` only. Its `Invalidate`, `Bounds`, `Begin`, `End`, and `Reset` operations are implemented. `Invalidate` maps a rectangle through a matrix and unions it into the dirty region. `Begin`/`End` correspond to the native iterator accessors and **do not reset** accumulated damage. `Rectangles` and JavaScript iteration return independent rectangle values.

Additional retained graph classes are explicitly **web extensions**, not invented .NET API parity:

- `SceneNode`: matrix, visibility, opacity, generation, parent invalidation, rendering and hit testing.
- `GroupNode`: ordered children, add/remove/clear, cycle detection and reverse-order hit testing.
- `GeometryNode.Rectangle`, `.Ellipse`, `.Path`: snapshots of geometry and paint.
- `ImageNode`: an independently retained native image and destination rectangle.
- `TextNode`: copied font/paint state, text and baseline origin.
- `ClipNode`: a retained rectangle/path clip around child nodes.
- `DrawableNode`: a callback or object with `Draw(canvas)` plus declared bounds.
- `AnimationNode`: render a separately owned Skottie animation as a retained node.
- `Scene`: root traversal, damage accumulation and hit testing.

Geometry, image and text leaves retain their resources. Group membership and `Scene.Root` reference existing node objects without taking disposal ownership. Dispose those node objects explicitly when finished. `AnimationNode` similarly references a separately owned animation. Callback resources belong to the callback's owner. Fill hit testing respects path, ellipse and transformed rectangle geometry; stroke hit testing currently uses conservative stroke bounds. Scene damage is conservative at the root level. Native filters that expand outside geometric bounds require a `DrawableNode` with explicitly expanded bounds for accurate damage accounting. The supplied scene renders the full traversal; damage reporting does not impose partial repaint clipping or automatic culling.

## Exact compatibility qualifications

| Upstream API detail | Current implementation |
| --- | --- |
| Normal `Animation.Render(canvas,dst)` | Native Skottie rendering. |
| `AnimationRenderFlags.SkipTopLevelIsolation` and `.DisableTopLevelClipping` | Enum values exist. The bundled CanvasKit native render binding does not expose these flags; nonzero flags throw `SKNotSupportedError`. They are not silently ignored. |
| `AnimationBuilderFlags.DeferImageLoading` | Defers the native animation compilation and image decode to first seek, property inspection, or render. Unlike the native .NET flag, this defers the whole scene compilation. |
| `AnimationBuilderFlags.PreferEmbeddedFonts` | Avoids injecting registered manager fonts for families represented by embedded Lottie glyph shapes. This is a browser adaptation; the native builder flag itself is not exposed by CanvasKit. |
| Builder timing statistics | Actual wrapper JSON parse, scene compile and total build elapsed times. Deferred compilation occurs later and is excluded from initial build time. |
| `AnimationBuilderStats.AnimatorCount` | `null`: native animator statistics are not exported. `JsonAnimatedPropertyCount` separately reports the counted animated JSON properties and is not misrepresented as native animator count. |
| Resource-provider `preDecode` option | Preserved metadata. CanvasKit's managed resource provider performs native predecode; a separate per-provider native decode strategy is not exported. |
| Native rendering destination | A real `SKCanvas` backed by CanvasKit is required. Document adapters may rasterize the animation explicitly, but cannot obtain vector Lottie output through this binding. |
| Lottie feature coverage | The shipped CanvasKit Skottie build determines support. This includes its native limitations and is not a claim of complete After Effects feature compatibility. |
| Native scene internals and raw pointers | Retained native Skottie internals remain in WASM; arbitrary private C++ scene nodes and native pointers are not exposed. |

## Verification

`tests/animation.test.mjs` executes the actual bundled CanvasKit WASM. Fourteen grouped tests verify native moving-frame pixels, timing and markers, property colors/transforms/opacity, deferred construction, malformed inputs, bytes and streams, provider caching/ownership, async/data-URI resources, embedded/external PNG rendering, registered-font text replacement and native editor key input, native audio seek callbacks, native color/scalar/vector slots, invalidation, retained scene resource ownership and hit testing, clip/image/text nodes, and all four showcase scenes.

The tests also verify that unsupported render flags fail explicitly. Audio output, physical input devices, and all possible Lottie format features are not exhaustively validated by these fixtures.

Sources: the repository's pinned `docs/upstream-public-api.json`, the bundled `vendor/package/types/index.d.ts`, [Skia's managed Skottie bindings](https://github.com/google/skia/blob/main/modules/canvaskit/skottie_bindings.cpp), and [SkSG invalidation controller](https://github.com/google/skia/blob/main/modules/sksg/include/SkSGInvalidationController.h).
