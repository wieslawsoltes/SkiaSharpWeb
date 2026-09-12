# Packaging readiness (unreleased)

The 0.5.0 runtime is now distributed as `@wieslawsoltes/skiasharpweb` with verified GitHub and npm releases. Native renderer behavior is unchanged.

- Add conditional Node ESM/CommonJS and browser entries with no implicit font downloads.
- Add typed initialization/core drawing/component APIs and a generated advanced namespace.
- Add deterministic tarball manifests, native integrity/size/content checks, bundled notices and SBOM.
- Add clean consumer, cross-platform, TypeScript, browser, native/.NET and release gates.
- Add opt-in, tag-checked draft GitHub releases and verified-artifact npm trusted publishing.
- Preserve the qualified native renderer and gallery behavior; no registry publication performed.

# Changes

## 0.5.0 — portable completion and optimization

- Rebased onto c817226, preserving the concurrently published native document diagnostics, canonical glyph paths, paint/text geometry and qualified runtime.
- Preserved all 18 upstream exact native GetFillPath branches; expanded GetFastBounds rectangle/output forms and capability reporting.
- Hardened numeric/named/native paint-enum normalization while retaining the upstream filled-versus-outlined PDF/XPS fix and custom-blender cleanup.
- Added checked SKData overloads, retained zero-copy subsets/streams, release callbacks, chunked writes, bounded asynchronous reads, cancellation and single-copy writer materialization.
- Added an 8 MiB default bounded path-query LRU and balanced region union / allocation-free intersection queries.
- Fixed resource registration, URL replacement, removal, cache-clear and in-flight promise races.
- Added the font-free Optimization Lab, 31 regression tests, exact-output benchmarks, finite native resource-soak evidence and a browser verification workflow.
- Current verification and remaining gaps are recorded in docs/OPTIMIZATION-0.5.md. This is not a full-parity or physical-GPU-qualified release.

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
