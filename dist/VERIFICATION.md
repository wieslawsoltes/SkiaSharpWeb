# Verification report

Tested on 2026-09-11 using Node.js and the bundled CanvasKit 0.42.0 full WASM engine.

`node --test tests/*.test.mjs` completed with **67 tests passed, 0 failed**. Four file-level tests also execute 43 grouped native checks internally: 10 core, 14 paths, 10 fonts/text, and 9 images/documents. These groups are not a count of upstream API parity.

## What was exercised

- All 22 showcase scenes were drawn through the actual Skia software rasterizer and exported as nonempty PNG images.
- Core checks validate pixels for gradients, stroke-and-fill, color matrices and SkSL uniforms; effects, paint copies, disposal, color conversions and matrix transforms are exercised.
- Paths cover every primary curve verb, native inverse fills, Boolean operations, SVG, native contour measurement, segment extraction, reversal, conic approximation and mutable snapshots.
- Font checks load bundled font bytes, compare normal/bold native advances, read tables and metrics, extract simple/composite TrueType outlines, build positioned text blobs, exercise collection face selection and render shaped text with ligatures, bidirectional runs, wrapping and paint effects.
- Image checks cover PNG/JPEG/WebP encode/decode, mutable pixels, row padding, float pixels, snapshot ownership, two-frame GIF selection and rewind, shaders, vertex meshes and raster PDF pages.
- Canvas regressions cover clip-state restoration, accurate text alignment, shaped text color and width, effects without temporary native-reference leaks, pictures and serialization, overload dispatch, sampled images, atlas colors, deferred primitive replay and snapshots after disposal.
- Controlled WebGPU mocks validate pipeline descriptions, vertex coordinates, premultiplied blending, aligned uploads, texture/buffer reuse, failure cleanup, size limits and device loss. Controlled backend/DOM mocks validate fallback to a fresh canvas, WebGL context cleanup and the web component's selected canvas.
- JavaScript syntax, relative module imports and HTML entry assets passed `node scripts/check.mjs`.
- Selected rendered PNGs were visually inspected, including gradients, curved Boolean operations and Latin/Greek/Arabic/Hebrew/Polish text.
- During document-module development, Poppler independently parsed and rendered a two-page raster PDF, verifying page dimensions, Unicode metadata and sample pixels. The shipped suite repeats in-memory PDF structure and content validation.

## Limits of this verification

No browser UI interaction suite or physical GPU session was run in this task. WebGPU WGSL execution, hardware pixel output, WebGL driver behavior, browser device loss, browser Local Font Access permissions and device-specific performance still need target-browser validation. The passing GPU mocks verify JavaScript decisions and resource use; they do not compile shaders or prove driver conformance.

Software sample images do not certify pixel equality between the custom WebGPU antialiasing shader and Skia. The demo's elapsed time is CPU drawing/submission time, not GPU execution time. No exhaustive .NET-versus-JavaScript differential suite, fuzzing campaign, production memory soak, full upstream API conformance run or platform-native interop validation has been completed.

## Reproduce

From the source directory, with Node.js installed:

```sh
npm test
npm run check
```

No npm dependency installation or network access is required for these tests. All required engine and font files are included. Sample images are generated under `test-output/` and are ignored by Git.

The separate `docs/upstream-public-api.json` inventories upstream declarations. `dist/compatibility.json` inventories 98 exported JavaScript `SK*` names. Both inventories are aids for review, not a feature-completeness score.
