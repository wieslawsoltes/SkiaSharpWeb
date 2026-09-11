# Conformance verification

The pinned inventory retains all3,995 declarations from commit b33cf54f24edc5347567c95b1924c447669c1de8. The current signature audit reports1,928 implemented,1,029 partial or unverified,873 not applicable to the browser boundary, and165 missing. These are declaration counts, not feature percentages or an exhaustive parity guarantee.

Compared with the supplied baseline (716 implemented,1,436 partial,873 not applicable,970 missing),722 missing declarations are now classified implemented,83 missing declarations are now partial, and490 previously partial declarations now have sufficient reviewed implementation/test evidence.204 lexer identities were corrected:202 initialized fields and2 generic method names. Evaluating the same final implementation with and without those corrections changes143 rows from missing to implemented. Those143 are parser corrections, not newly ported features. `conformance-changes.json` preserves these categories separately.

The native differential harness executes real SkiaSharp3.119 and4.154 packages and HarfBuzz14 under .NET8.0.15. The release package commits differ from the declaration inventory commit and are recorded in each fixture. The conformance tests cover141 named colors,104 HSL/HSV conversions, all256 alpha premultiplication/unpremultiplication cases, native transfer curves and inverse coefficients, ICC RGB profiles and linear-light pixels, gradient overload argument order, raw runtime-effect integer uniforms and child ownership, shader matrices, native annotation keys, UTF/BOM/malformed surrogates, overlapping pixel swizzles, fifteen test families in total. Actual .NET HarfBuzz reference strings cover ligatures, Arabic, combining marks and non-BMP glyph/byte-cluster/position results. Twelve shaped-text overload forms are exercised explicitly. Native null surfaces, picture operation counts, drawable recording and readback lifetimes are exercised too. Font metrics/width/bounds fixtures are consumed by the separate font suite.

Real Dawn Graphite execution is certified only for the tested operations. `native/verify_native.mjs` and `native/verify_gpu_images.mjs` execute native recorder/snap/insertion/default submit, bounded image cache reuse, exact readback, mipmapped/unmipmapped image conversion and ownership cleanup using Dawn SwiftShader. Physical vendor GPUs and live Ganesh texture adoption are not validated here. Native callback, synchronized submit and nondefault targeting variants remain partial unless separately supported by their evidence.

Specialized effects, regions, codecs, documents, fonts, surfaces and animation have separate suites and native providers. This audit incorporates reviewed certificates for their concrete overloads; method presence alone still receives partial status. RGB matrix/TRC ICC profiles are tested, while arbitrary LUT/HDR profile serialization remains partial. SVG output is vector but currently converts text to paths. Warped text/path effects retain documented geometric tolerances. `GetGlyphPaths` supplies transformed outlines with Identity callback matrices rather than claiming native path/transform decomposition. Several JavaScript return conventions and native platform integrations remain intentionally different.

Remaining missing rows are listed exactly in `remaining-declarations.json` and the full audit. The current categories are:

- Ganesh memory statistics facade: 1 declarations.
- Vulkan, Metal and Direct3D native platform interop: 130 declarations.
- Graphite browser records or image-cache facade: 18 declarations.
- CLR native-object, locking and COM integration: 14 declarations.
- Portable managed stream methods: 2 declarations.

Run `node scripts/audit-conformance.mjs` after initializing every extension. Optional environment variables `SKIA_TEST_ROOT`, `SKIA_TEST_VENDOR`, `SKIA_TEST_MODULE_ROOT` choose an alternate checkout/runtime; `SKIA_AUDIT_OUT` chooses output and `SKIA_AUDIT_BASELINE` supplies a previous JSON report for transition accounting. The audit never deletes or merges original overload identities.
