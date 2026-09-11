# Raster formats, pixel ownership and mask filters

`SKSurface.Create(SKImageInfo)` creates native raster storage matching the requested `ColorType`, `AlphaType` and `ColorSpace`. It also honors `rowBytes` and `SKSurfaceProperties`. The bundled native extension uses `SkSurfaces::WrapPixels` and actual `SkSurfaceProps`; it does not convert requested F16/F32 surfaces to RGBA8. Native Skia determines which format/alpha combinations are drawable and normalizes alpha types where required by the format.

The separate `installSurfaceFormats(CanvasKit, api)` installer runs after `installConformance`. Canvas, Ganesh and Graphite overloads continue through the existing `SKSurface.Create` dispatcher. The bundled runtime includes the native format and mask-filter bindings in `native/skiasharp_effects.cpp` and `native/skiasharp_effects.js`.

## Raster overloads

Supported forms include:

```js
SKSurface.Create(info);
SKSurface.Create(info, rowBytes);
SKSurface.Create(info, properties);
SKSurface.Create(info, rowBytes, properties);
SKSurface.Create(info, pixels, properties);
SKSurface.Create(info, pixels, rowBytes, properties);
SKSurface.Create(info, pixels, rowBytes, releaseProc, context, properties);
SKSurface.Create(pixmap, properties);
```

Optional trailing arguments may be omitted. An explicit options object is also accepted:

```js
const surface = SKSurface.Create(info, {
  pixels: destination,
  rowBytes: stride,
  surfaceProperties: properties,
  releaseProc: (pixels, context) => { /* caller cleanup */ },
  context: owner
});
```

The integer immediately after `info` means `rowBytes`. Represent an existing WebAssembly address as `{ Pointer: address }` to distinguish it from row bytes; a browser JavaScript number cannot provide C#'s overload distinction between `int` and `IntPtr`.

Dimensions and strides are validated before allocation. Row bytes must fit the full pixel row and be a multiple of the format's bytes per pixel. A raster surface allocation is limited to 512 MiB. An otherwise valid combination that native Skia cannot draw returns `null`.

## Storage and lifetime

`surface.PixelStorage` describes pixel ownership:

| Value | Backing storage | Synchronization and disposal |
|---|---|---|
| `owned-wasm-buffer` | Allocated by the surface | Native draws write directly; surface disposal frees storage. |
| `borrowed-wasm-buffer` | Caller-supplied CanvasKit allocation, live Wasm typed-array view or explicit pointer | Native draws write directly; caller keeps memory alive and frees it after surface disposal. |
| `copied-js-buffer` | Separate JavaScript ArrayBuffer or typed array, copied to owned Wasm storage | Initial pixels copy inward; `Flush` and disposal copy outward; `NotifyPixelsChanged` copies caller edits inward. |

External JavaScript buffers cannot become native Wasm pointers. This implementation makes the copy boundary explicit. Padding bytes within rows are preserved, and bytes beyond the surface allocation remain untouched. Use a `CanvasKit.Malloc` allocation when direct shared pixel storage is required.

```js
const info = new SKImageInfo(2, 1, SKColorType.RgbaF32, SKAlphaType.Premul);
const pixels = new Float32Array(12); // two RGBA pixels plus row padding
const surface = SKSurface.Create(info, pixels, 48);
surface.Canvas.Clear(new SKColorF(2.125, -0.25, 0.123456, 0.5));
surface.Flush(); // exposes premultiplied HDR values in pixels
pixels.set([0, 1, 0, 1]);
surface.NotifyPixelsChanged(); // native Skia sees this edit; snapshots remain coherent
surface.Dispose();
```

`GetPixels()` returns a fresh view of live Wasm storage. Reacquire this view after Wasm memory growth. `PeekPixels()` returns an owner-bound borrowed `SKPixmap` with the actual format and stride; pixel access fails after surface disposal. Surfaces retain their color-space reference independently of the caller's wrapper. Snapshot images remain valid after surface disposal. Release callbacks run exactly once, after the native surface and any owned allocation have been released.

`surface.Info`, `RowBytes` and `SurfaceProperties` expose actual raster metadata. `SyncPixelsFromBuffer` aliases `NotifyPixelsChanged`. `ReadPixels(info, destination, rowBytes, x, y)` preserves destination row padding. The convenience `ReadPixels(info, x, y)` returns `Float32Array` for F32 and raw `Uint8Array` for other formats. Readback always supplies an exactly sized native allocation, avoiding the unallocated CanvasKit F32 path's byte-count/float-count overread.

## Mask filters

The bundled native engine implements `SKMaskFilter.CreateTable(byte[256])`, `CreateGamma(float)`, `CreateClip(byte, byte)` and `CreateShader(SKShader)` through real Skia mask filters. `TableMaxLength` is 256. Existing blur factories and blur-radius conversions remain available. Mask filtering changes shape coverage independently of the paint's color filter.

A caller-supplied unextended CanvasKit can create its exposed default-property raster formats through its existing direct-raster API. Nondefault surface properties and the four additional mask factories require the native extension and report `SKNotSupportedError` if it is absent.

## Verification

`tests/surface-formats.test.mjs` contains ten passing tests against the compiled bundled engine:

- Exact F32 HDR/negative/sub-byte values, premultiplied and unpremultiplied readback, and correct typed-array lengths.
- Actual F16 half-float bit patterns and padded rows.
- External synchronization, oversized destination buffers, one-shot release callbacks, owner-bound pixmaps and snapshots after surface disposal.
- Borrowed Wasm storage remaining caller-owned.
- Native surface flags, pixel geometry and linear-sRGB conversion after original metadata wrappers are disposed.
- Actual Alpha8, RGB565, Alpha16, AlphaF16, R8Unorm, Rg1616 and Rgba16161616 storage descriptors.
- Padded readback, validation failures, raster overload dispatch and all four mask factories affecting native raster coverage.

These are native CPU rendering and ownership tests. They do not establish physical GPU behavior or complete .NET overload equivalence across platform-specific GPU handles.
