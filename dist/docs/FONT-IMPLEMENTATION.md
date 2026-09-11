# Font and text implementation

Font rendering and shaping use the bundled native Skia, FreeType, HarfBuzz, and SkParagraph build. The browser-facing API preserves C# names and uses owned, independently disposable typefaces and fonts. Registered font data determines available scripts; fonts installed on the operating system are accessible only through the browser's optional Local Font Access flow.

## API and formats

- TTF, OTF/CFF, CFF2, WOFF, WOFF2, and indexed font collections; table reads return independent bytes. `WithTables` reconstructs an SFNT after table replacement.
- `SKFontManager` family/style sets, CSS style matching, glyph fallback, URL/blob registration, and optional registered BCP47 language metadata. Native paragraph fallback resolves missing glyphs from registered faces. Later language preferences take priority; primary-language matches support tags such as `pl-PL` against a registered `pl` face.
- Native glyph IDs, widths, bounds, paths, metrics, interception, positioned text, paragraph shaping, and text blobs. `ForceAutoHinting` and `BaselineSnap` control the underlying `SkFont` flags.
- Canonical `SKFontMetrics`, `SKFontVariationAxis`, `SKFontVariationPositionCoordinate`, and `SKFontPaletteOverride` records with value equality and hashes. Variation count/properties and destination spans, coordinate/palette `Clone` overloads, and `SKFontArguments.PaletteIndex` / `PaletteOverrides` are available.
- COLR/CPAL palette replacement and layer/paint inspection, COLRv1 variable paint resolution, sbix/CBDT bitmap extraction, SVG glyph document extraction, glyph names, supported Unicode codepoints, and named variations.

The browser parser is locally bundled fontkit 2.0.4. WOFF2 decoding and HarfBuzz instancing run in WebAssembly; no external service or Python runtime is required. The portable instancer uses the unchanged harfbuzzjs 0.10.3 subset binary. The bundled native extension also exports native font instancing and CFF2 downgrade for native integrations.

## Instancing and hint preservation

HarfBuzz pins every axis to the selected or default coordinate while retaining glyph IDs, characters, names, and layout features. TrueType `gvar` geometry, HVAR/VVAR advances and bearings, GPOS/GDEF positioning variations, and conditional GSUB features become static font data. A supplemental resolver applies MVAR metrics from original source values and resolves COLRv1 variable paint fields and clip boxes without applying deltas twice. TrueType instances retain available hint programs.

**CFF2 rendering retains resolved CFF2 programs and private hint dictionaries.** The former outline reconstruction that discarded CFF hints has been removed.

`SKTypeface.GetDocumentFontData()` returns standalone SFNT data for document embedding. CFF2 is separately converted to CID-keyed CFF1 by preserving stems, hint masks, counter masks, private hint dictionaries, glyph IDs, and exact cubic coordinates. Local/global subroutines are expanded, and long operand batches are split at operator boundaries to respect CFF1's stack limit. No tessellation or outline reconstruction is involved. WOFF input is normalized to SFNT before export.

## Performance and ownership

`SKFontCache` defaults to a 32 MiB budget covering source bytes, resolved axes/palette variants, document fonts, and owned native typeface references. Content hashes are verified against the original bytes. Repeated variants reuse native typefaces; each returned wrapper owns an independent reference. Eviction or `Clear()` releases cache references without invalidating active callers. The budget counts retained font data and excludes JavaScript object and native allocator overhead.

The checked workload measured a median 3.30 ms cold Roboto Flex weight-750 instance and 0.0113 ms cached instance, about 293× for repeated identical axes. An owned clone took 0.0051 ms. These are shared-host Node/WASM observations, not universal browser throughput claims. See [FONT-PERFORMANCE.json](./FONT-PERFORMANCE.json) and run `node scripts/benchmark-fonts.mjs` to reproduce the workload.

## Verification and qualifications

Five test files cover the original font/text integrations, advanced formats, variable tables, hint fidelity, and new native bindings. Tests compare all metric fields, glyph IDs, advances, and bounds with independently executed .NET SkiaSharp 3.119 and 4.154 using the exact bundled DejaVu Sans font identified by SHA-256. Native flag changes, empty typefaces, paragraph fallback, registered BCP47 selection, cache eviction, and ownership are exercised.

Independently authored hinted CFF2 fixtures are instanced by Python fontTools at weights 100, 500, and 900. Their native CFF2 and CFF1 raster pixels match this implementation byte-for-byte at sizes 7, 9, 11, 13, 18, 32, and 60. Separate fixtures test local/global subroutines, mask bytes, and long operand batches. A negative control with removed hints produces different pixels, demonstrating that these tests detect the former fidelity loss. Fixture generators are development tools only.

The CFF1 format limits a document conversion to 256 distinct font dictionaries; malformed or unresolved programs are rejected rather than losing hints. Native CFF2 rendering is retained independently. The tests do not constitute an exhaustive OpenType corpus: unusual AAT/Graphite layout behavior follows the bundled native engines, and independent COLRv1 pixel fixtures cover variable linear gradients and alpha rather than every possible paint combination. SVG glyph extraction does not itself provide a full SVG renderer. Low-level .NET native pointers use the library's JavaScript buffer conventions; exact declaration status is tracked separately in the conformance report.
