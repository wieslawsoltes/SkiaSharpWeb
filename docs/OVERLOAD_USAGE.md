# JavaScript overload adapters

The overload installer runs once during `Initialize()`. It preserves original class instances and factory return values while adding managed argument forms for geometry, canvas drawing, font spans, text, and pixel destinations.

## ref/out values and spans

Pass a mutable object for a C# `out` or `ref` struct, and a JavaScript array or typed array for a span. Arrays may grow; typed arrays must have enough capacity. Process-address overloads are outside the browser API.

```js
const matrix = SKMatrix.CreateTranslation(12, 16);
const inverse = new SKMatrix();
const invertible = matrix.TryInvert(inverse);
const mapped = [];
matrix.MapPoints(mapped, [new SKPoint(2, 3)]);

const bounds = new SKRect();
const width = font.MeasureText("Text", bounds, paint);
const glyphs = font.GetGlyphs("Text");
const advances = new Float32Array(glyphs.length);
const glyphBounds = [];
font.GetGlyphWidths(glyphs, advances, glyphBounds, paint);
```

`TryInvert()` without an output retains the convenience result `{ Success, Inverse }`. `BreakText(text, width)` returns a primitive count in 0.5. Use `BreakTextDetails(text, width)` for `{ Count, CodepointCount, MeasuredWidth, Text }`. Strings count UTF-16 code units and encoded buffers count bytes. An optional mutable output receives the width; empty input preserves an existing width slot. For example:

```js
const measured = {};
const count = font.BreakText("Fitting text", 100, measured);
// measured.Value, measured.MeasuredWidth, measured.Text
```

`SKFont` accepts explicit `SKTextEncoding.Utf8`, `Utf16`, or `Utf32` on byte buffers. `SKPaint` uses its `TextEncoding` property. UTF-16 and UTF-32 buffers use little endian. `Uint16Array` in glyph-measurement/path methods represents already resolved glyph IDs. Use a string or explicitly encoded bytes when the input represents text.

## Matrices and geometry

`SKMatrix44` supports sixteen scalars, a row-major array, a 3×3 matrix, or a 4×4 matrix as constructor arguments. The default constructor yields `Empty`; use `Identity` or `CreateIdentity()` for identity. Fields follow the pinned System.Numerics row-vector convention, with translation in `M30`, `M31`, and `M32`; the canvas adapter transposes at the rendering boundary. It exposes `M00` through `M33`, `Matrix`, `Get(row, column)`, `Set(row, column, value)`, determinant and inversion, row/column conversion, 2D/3D point mapping, scalar multiplication and matrix arithmetic. `PreConcat`, `PostConcat`, and `Transpose` return new values, following the current immutable .NET signatures. `SKPoint3` represents 3D points.

`SKRotationScaleMatrix` exposes the .NET `SCos`, `SSin`, `TX`, and `TY` fields, with `Tx`/`Ty` aliases for existing JavaScript text-blob code. Its factories accept scale, radians/degrees, translation, and anchor coordinates. Atlas transforms use these values directly.

```js
const transform = SKRotationScaleMatrix.CreateDegrees(
  1.5, 30, 200, 140, 16, 16
);
canvas.DrawAtlas(image, sprites, [transform], paint);
```

Rounded rectangles support copied construction, corner radii/type queries, nine-patch radii, deflation/inflation, and axis-preserving transforms. `TryTransform()` returns false when a skew, perspective, or general rotation cannot remain an axis-aligned rounded rectangle.

## Canvas operations

Added dispatch covers point/pivot scaling and skewing; picture coordinate, point, matrix, and paint forms; surface drawing; color-valued points; vertex arrays; atlas cull rectangles; patch default blend modes; layer records; regions; and image/bitmap lattice and nine-patch forms. These invoke actual Skia drawing operations.

A lattice alternates fixed and stretchable bands. When the destination is smaller than the fixed bands, fixed bands shrink proportionally and stretchable bands collapse. `SKLattice.RectTypes` supports `Default`, `Transparent`, and `FixedColor`, with one type/color per cell in row-major order.

```js
const lattice = new SKLattice(
  [12, image.Width - 12],
  [12, image.Height - 12]
);
canvas.DrawImageLattice(image, lattice, destination, SKFilterMode.Linear, paint);

const layer = new SKCanvasSaveLayerRec(bounds, translucentPaint);
const count = canvas.SaveLayer(layer);
canvas.DrawPicture(picture, new SKPoint(20, 30));
canvas.RestoreToCount(count);
```

## Paths and text

`SKFont.GetTextPath(text, positions)` and `DrawPositionedText` accept one position per glyph. `DrawTextOnPath` accepts legacy paint forms and explicit font/alignment forms, with a `warpGlyphs` Boolean variant. Unwarped text places a rigid glyph outline at each path tangent. Warped text maps glyph contours across the path, adaptively flattening curves with a 0.2 pixel target.

```js
canvas.DrawTextOnPath(
  "Following a curve", baseline, new SKPoint(0, 4),
  true, SKTextAlign.Center, font, paint
);
```

`SKPaint.GetFillPath` produces real filled stroke geometry, including stroke-and-fill union and zero-width hairline behavior. Path-effect geometry is supported when effect metadata is available through the effect extension. Effect-free fast bounds are conservative; paints with effects return false from `GetFastBounds` instead of guessing their expansion.

## Verification and remaining conformance work

The eleven test groups in `overloads.test.mjs` execute against the bundled WASM engine. They check matrix inversion and projection, copied rounded rectangles, anchored sprite transforms, rendered coordinate overloads, exact lattice pixels and cell types, UTF-8/16 glyph consistency, output buffers, glyph positions and widths, actual warped outline rendering, stroke geometry, layer opacity, vertex colors, constructor forms, and padded pixel row strides.

The signature report lists all 3,995 pinned lexical declarations individually. It distinguishes concrete adapters, partial or unverified branches, unavailable signatures, and C#-specific constructs. It does not certify full .NET behavior or SkiaSharp parity. All eight rounded-rectangle start indices and both contour directions are implemented and render matching pixels. Remaining exactness limits include singular current-matrix reset, native clip classification, anisotropic sampling, several historical text return conventions, native warp tolerance, and native pointer integrations.

The pinned source uses exact all-zero rectangle equality for `SKRect.IsEmpty` and `SKRectI.IsEmpty`; use `Width <= 0 || Height <= 0` when testing drawable area. Integer rounding uses midpoint-to-even and checked Int32 conversion. `SKPoint.Reflect` preserves the pinned source behavior, including its squared-point-length expression.
