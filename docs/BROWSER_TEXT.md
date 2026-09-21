# Browser-system-font raster planning

`@wieslawsoltes/skiasharpweb/browser-text` exports five framework-independent,
PascalCase helpers extracted from the AvaloniaWeb Skia adapter. They neither load
Skia nor download fonts. This is an explicit web extension, not a claim of new
.NET SkiaSharp methods or a replacement for native SKParagraph shaping.

```js
import { ConfigureCanvasText, GetDeviceTextGeometry, CreateTextRasterPlan }
  from '@wieslawsoltes/skiasharpweb/browser-text';

const face = { FontFamily: 'system-ui', Style: 'Normal', Weight: 400, Stretch: 5 };
ConfigureCanvasText(measureContext, face, 14, { LetterSpacing: 0 });
const geometry = GetDeviceTextGeometry(canvas.TotalMatrix, x, baseline, deviceScale);
const plan = CreateTextRasterPlan(measureContext.measureText(text), 14, geometry);
for (const tile of plan.Tiles()) {
  // Allocate tile.PixelWidth x tile.PixelHeight pixels, not the full text width.
  const element = new OffscreenCanvas(tile.PixelWidth, tile.PixelHeight);
  const ctx = element.getContext('2d');
  ConfigureCanvasText(ctx, face, 14);
  ctx.setTransform(plan.ScaleX, 0, 0, plan.ScaleY,
    plan.PhaseX - tile.Left, plan.PhaseY - tile.Top);
  ctx.fillStyle = '#202020';
  ctx.fillText(text, 0, 0);
  // Upload getImageData(...).data as RGBA8888 / Unpremul using SKImage.FromPixels.
  // Draw into the original Skia logical coordinate system at:
  // (x - tile.OffsetX, baseline - tile.Baseline, tile.Width, tile.Height).
  // Dispose the image, or retain it in a caller-owned, byte-bounded cache.
}
```

The plan retains glyph ink overhangs and tall combining marks. A two-device-pixel
margin protects antialiasing. Positive axis-aligned transforms preserve fractional
origin phase so tiles map back to the original physical pixel grid. Rotation,
shear and reflections use the largest singular value to avoid undersampling;
they are not guaranteed pixel-equivalent. Perspective is rejected explicitly.

`Tiles({Left, Top, Right, Bottom})` skips directly to intersecting tiles in the
plan's device-pixel coordinate system. It returns **whole tiles**, not cropped
images. For a logical clip, transform its bounds with:
`(clip.Left - x) * ScaleX + PhaseX` and
`(clip.Top - baseline) * ScaleY + PhaseY` (likewise Right and Bottom).
Apply the actual clip in Skia when drawing. Complexity is proportional to visited
tiles, not to every tile in a long offscreen line. The immutable plan has no image
allocations and callers retain explicit control of cache memory and ownership.

`TextRasterSignature` returns an array of all configured typography fields. Include
text, color, device scale, phase and a font-registration generation in your full
cache key. `CanvasFont` formats the CSS font shorthand. Spacing that the browser
cannot represent fails explicitly; no guessed glyph spacing is substituted.

Tests cover module import without DOM/WASM, typography reset, native TextMetrics,
ink bounds, fractional phase, exact coverage, numerical validation, affine scale,
and clipped enumeration on a billion-pixel line. They do not certify screen font
availability, every browser's shaping, native paragraph equivalence, or GPU output.
The consuming AvaloniaWeb pixel suite remains the browser-to-Skia transport test.
