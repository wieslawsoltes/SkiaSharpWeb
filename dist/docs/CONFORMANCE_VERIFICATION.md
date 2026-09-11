# Conformance verification — 0.5

All 3,995 pinned declaration IDs are retained: **1982 implemented, 1063 partial/unverified, 872 browser-inapplicable and 78 missing**. These are declaration counts, not feature percentages.

The 0.5 review upgrades 46 previously partial declarations using targeted native/.NET tests. One additional change corrects an inventory error: the public SKPathMeasure constructor has an IntPtr.Zero base initializer, not a pointer argument. It remains partial because the corpus does not exercise arbitrary resScale. Source and runtime SHA-256 checks prevent these reviews from silently certifying edited code.

The missing group contains 64 native Vulkan/Metal/Direct3D declarations and 14 CLR native-object/locking/COM declarations. Portable GPU descriptor value objects are distinct from importing a desktop device or process address. The earlier 144-to-78 reduction reflects newly available descriptor records, many still partial—not new browser driver interfaces.

Qualification run 34627270171 passed 374 integration tests and 193,931 comparisons against independently executed SkiaSharp 4.154. Corpus sizes and exact provenance are in [VERIFICATION-0.5.json](./VERIFICATION-0.5.json). The reviewed families are paint expansion/fast bounds, contour-preserving text paths, numeric BreakText, canonical glyph callbacks, path-measure queries and SVG flags. The legacy paint BreakText overload family and untested branches remain partial.

[REVIEW-0.5.json](./REVIEW-0.5.json) records individual before/after changes; [OVERLOAD_CONFORMANCE.md](./OVERLOAD_CONFORMANCE.md) lists every declaration. Finite differential testing is not an exhaustive proof, and SwiftShader is not physical-GPU qualification.
