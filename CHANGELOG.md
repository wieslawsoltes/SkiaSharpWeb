# Changes

## 0.2.0

- Added 18 scenes, for 40 total, with variable-font controls, native Skottie playback/properties/resources, regions/effects, vector documents and GPU diagnostics.
- Added vector/searchable PDF and XPS with embedded TrueType/CFF fonts, shaped text and explicit bounded raster fallback reporting.
- Added variable TrueType/CFF2 instancing including MVAR/VVAR/GPOS/GDEF/GSUB/COLRv1 resolution, CFF outlines, WOFF/WOFF2 decoding, color palettes/layers/bitmaps/SVG extraction and table replacement.
- Added integer regions, software/native filter composition, specialized effects, path-effect composition and nested filtered layers.
- Added native Skottie, resource providers, invalidation and retained scene extensions.
- Added source-checked overload adapters, typed buffers/output objects, lattices, matrix conventions, rounded-rectangle starts and specialized canvases/drawables.
- Added Ganesh browser adapters, GPU readback and optional native Graphite/Ganesh C++ extension source. The optional extension is not compiled in the bundled runtime.
- Fixed renderer/resource ownership, reusable scene state, export navigation, animation timing and component/app lifecycle regressions.
- Added a declaration-by-declaration compatibility audit and expanded the passing test suite to 189 Node test-runner cases.

Complete upstream API and behavioral parity is not claimed. See COMPATIBILITY.md and docs/VERIFICATION.md.
