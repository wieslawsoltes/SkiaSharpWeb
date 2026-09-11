# PDF, XPS, and SVG documents

`SKDocument.CreatePdf()` uses the bundled native Skia PDF backend by default. It records directly into Skia's document canvas, embeds/subsets fonts, preserves native glyph shaping and color management, supports native picture replay, and delegates filters and compositing to Skia's PDF implementation. `SKDocument.CreateXps()` uses the JavaScript XPS writer. `SKSvgCanvas.Create(bounds, stream)` uses the bundled native SVG canvas.

A native PDF is not necessarily entirely vector. Skia rasterizes operations that PDF cannot represent. The qualified 0.5 runtime instruments native SkPDF raster-decision sites. `RasterFallbacks` contains the recorded events, `RasterFallbackReporting` is "NativeDecisionSites", and `RasterDiagnostics` includes total/dropped counts and the bounded event list. This reports native decision sites rather than promising one event for every public draw call. Older injected engines without these bindings still report null/unavailable and cannot enable native strict-vector publication.

## Normal PDF usage

```js
const metadata = new SKDocumentPdfMetadata(144, 101);
metadata.Title = 'Graphics report';
metadata.Author = 'Application';
metadata.Creation = new Date('2026-01-01T12:00:00Z');

const document = SKDocument.CreatePdf(metadata);
const canvas = document.BeginPage(600, 840);
canvas.DrawText('Searchable text', 32, 64, font, paint);
canvas.DrawPicture(picture);
document.EndPage();
const data = document.ToData();
// Copy/download data.AsSpan(), then dispose both objects.
data.Dispose();
document.Dispose();
```

The `SKWStream`/compatible writable-stream overload writes on close and preserves caller stream ownership. A string filename uses an owned `SKFileWStream` in the mounted browser file system and flushes it on close; it does not grant access to arbitrary operating-system paths.

`DefaultRasterDpi` is **72**, matching the pinned .NET declaration. Explicit `RasterDpi` controls rasterization resolution. Native metadata supports title, author, subject, keywords, creator, producer, UTC creation/modification dates, raster DPI, encoding quality and `PdfA`.

`PdfA: true` maps to native Skia's PDF/A-2b option. Tests verify the resulting PDF/A identification XMP, dates, output intent and searchable font output. These checks are not a complete PDF/A certification run.

## Audited vector capture

```js
const document = SKDocument.CreatePdf({
  NativeBackend: false,
  StrictVector: true,
  SubsetFonts: true
});
// Equivalent engine selection: Backend: 'JavaScript'.
```

`StrictVector: true` selects the JavaScript writer and rejects operations requiring fallback rasterization. Explicitly supplied bitmap/image resources remain image resources; the option prevents silently rasterizing other drawing commands. It uses a native recording canvas for validation/state and allocates no page-sized raster backing surface. Large vector pages therefore avoid raster memory proportional to page area.

Without `StrictVector`, this writer retains a raster backing surface and reports bounded fallback patches in `RasterFallbacks`. Every entry includes the page, operation, reason, page-space bounds and pixel dimensions. The native PDF backend is preferable for general fidelity and speed; the JavaScript writer provides inspectable commands and explicit fallback accounting.

Represented operations include:

- Paths, affine transforms, clipping, stroked geometry, and path effects that can be converted to geometry.
- Axial/radial gradients with local transforms, alpha stops, repeat/mirror/decal behavior, and gradient strokes converted to fill outlines.
- Two-circle conical gradients in PDF. XPS supports increasing radii with the focus inside the outer circle; other conical geometries are explicit fallback/error cases.
- PDF isolated transparency groups and supported PDF blend modes. XPS opaque/solid-color isolated groups are partitioned using Skia Boolean path operations before opacity is applied, preserving overlap compositing rather than multiplying opacity independently on each child.
- Positioned, rotated/scaled, shaped and ordinary glyph runs with embedded fonts and Unicode mappings. Gradient and stroked glyphs use vector outlines plus a searchable text layer.
- Rich paragraph foreground colors, backgrounds, zero-blur shadows and positioned shaped glyphs. Paragraph decoration and blurred-shadow cases require native rendering or an explicitly reported fallback.
- Pictures recorded through this API, whose command descriptions are retained independently of disposed source paints/fonts. Deserialized native-only pictures use the native PDF backend or an explicit fallback in the JavaScript writer.
- Image resources, URL annotations, named destinations, cross-page links, and multipage output.

PDF uses `ActualText` for logical text where available. Native Skia can encode ligature Unicode such as U+FB03; normalization with NFKC expands these to the equivalent letter sequence. Native and custom writers do not promise identical byte sequences or text-extractor whitespace.

The JavaScript writer explicitly reports unsupported runtime shaders, sweep gradients, non-sRGB gradient interpolation spaces, color-font paint graphs, perspective operations and other unrepresented drawing operations. These are not silently converted into different gradients or colors. Images are converted to sRGB for consistent PDF DeviceRGB and XPS PNG resources. Native PDF retains Skia's native color-managed rendering behavior.

Rational quadratic paths use adaptive cubic Hermite conversion, checking quarter/midpoint error against **0.001 page units** with a bounded recursion depth. This is a documented approximation required by the target path primitives, not an assertion of exact rational-curve representation.

## Fonts and resource reuse

The JavaScript writers perform sparse TrueType subsetting while retaining glyph IDs, composite dependencies, hint instructions and required SFNT data. They rebuild `glyf`/`loca`, checksums and `head.checkSumAdjustment`. CFF/CFF2 document data comes from `SKTypeface.GetDocumentFontData()`, which preserves resolved Type 2 programs and hint data. The custom writer currently retains full CFF font programs; native PDF performs its own native subsetting.

Immutable font-byte snapshots are cached with weak keys. Repeated draws of an immutable image share its encoded resource across pages. Ordinary PDF text runs use compact `Tj`/`TJ` sequences with advance corrections instead of a matrix and operator for each glyph; positioned/rotated runs retain independent transforms.

A reproducible CPU benchmark is supplied as `scripts/document-benchmark.mjs`. On this session's runtime, six pages with 480 text draws had these median times after one warmup (three measured repetitions):

| Backend | Median export time | PDF size |
| --- | ---: | ---: |
| Native Skia PDF | 11.05 ms | 17,953 bytes |
| Strict JavaScript vector capture | 34.89 ms | 448,060 bytes |
| JavaScript vector capture with fallback backing | 90.72 ms | 448,060 bytes |

These are measured workload results, not general throughput guarantees or GPU measurements.

## Metadata value records

`SKDocumentPdfMetadata` exposes the pinned metadata fields, constructors, constants, `Default`, value equality and hashing. Parameterless construction preserves .NET struct zero defaults (`RasterDpi = 0`, `EncodingQuality = 0`); `SKDocumentPdfMetadata.Default` returns the useful 72-DPI/101-quality defaults.

JavaScript has no separate `float` and `int` numeric types. A single integral constructor argument selects the .NET encoding-quality overload; a nonintegral number selects raster DPI. Use `new SKDocumentPdfMetadata(144, 101)`, `SKDocumentPdfMetadata.FromRasterDpi(144)`, or `{ RasterDpi: 144 }` when an integral DPI is intended. `Equals`, `op_Equality` and `op_Inequality` replace C# operator syntax; JavaScript `===` remains reference equality.

`SKDocumentXpsOptions` exposes `Dpi`, `AllowNoPngs`, equality and hashing with the same zero defaults. This runtime includes PNG encoding, so `AllowNoPngs` does not suppress images. Document creation requires a positive DPI.

## Native SVG

```js
const stream = new SKDynamicMemoryWStream();
const svgCanvas = SKSvgCanvas.Create(new SKRect(0, 0, 600, 400), stream);
svgCanvas.DrawPath(path, paint);
svgCanvas.DrawText('Portable outlines', 24, 60, font, paint);
svgCanvas.Dispose(); // Finalizes SVG into the borrowed stream.
const svg = stream.DetachAsData();
```

The native SVG bridge currently outlines text for portability, so SVG text is vector geometry and is not a searchable text node. The two writable-stream overloads share this implementation. Bounds establish the drawing viewport; stream ownership remains with the caller. Native Skia's SVG backend determines which drawing operations can be represented.

## Verification

The document suites contain **25 JavaScript writer tests and 4 native document/SVG tests**. They exercise independent Poppler and MuPDF parsing/rendering, searchable Unicode, rich runs, transformed/repeated/translucent gradients, conical/decal gradients, nested transparency, glyph outlines, resource deduplication, font subsets, metadata, annotations, file-stream ownership and large pages without raster backing.

Visual comparisons render both the source scene with Skia and the exported document with MuPDF. Thresholds account for different antialiasing and font rasterization. PDF/A tests inspect produced metadata and output intent; a complete external PDF/A conformance validator was not run.
