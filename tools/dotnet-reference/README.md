# Native .NET references

From the repository root on Linux with .NET8 SDK:

```sh
dotnet run --project tools/dotnet-reference/Reference.csproj -- dist/fonts/DejaVuSans.ttf > reference.json
node --test tests/conformance.test.mjs
```

The checked fixtures were produced by executing the actual Linux x64 SkiaSharp native packages under .NET8.0.15, SDK8.0.408. The harness uses real SkiaSharp calls and reflection; no JS output is used to generate expected values. HarfBuzz shaping references execute SkiaSharp.HarfBuzz with HarfBuzzSharp14.2.1.400-preview.1.26454.9. The default C# source regenerates the4.154 fixture and extra compiler-reflected declarations/enums; the3.119 fixture was generated with the3.119 native package before adding HarfBuzz cases.

Coverage includes141 reflected named colors,104 HSL/HSV conversions, all256 alpha premultiplication/unpremultiplication cases, six transfer curves with21 samples and inverse coefficients, font metrics/glyph widths/bounds at12 and32px, region reference rectangles, high-contrast pixels, corner-effect path output, font style clamping, and four shaping strings covering ligatures, Arabic, combining marks and non-BMP clusters. Tests compare native byte values exactly where appropriate and document scalar tolerances in the test source.

The release package commit differs from the pinned public declaration inventory; both commits are retained in fixture metadata. These references are focused differential checks, not an exhaustive pinned-.NET implementation proof. The native region write-to-memory C export is absent in the official package, and the recorded exception is retained; independent native region fixtures in the effect suite cover serialization instead.
