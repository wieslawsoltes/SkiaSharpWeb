# SkiaSharp Web 0.5 — completion, optimization, and verification

## Source and runtime provenance

Work started from remote main `9edcb2a13b19fd34ad5e3ddd8743789f143298e7`. During the work,
main advanced to **`c81722688843c24354d728f93ad8a6307cccc598`**. The delivered changes are rebased
onto the latter source snapshot and preserve its canonical paint/text-geometry
contracts and compiled runtime. The runtime was previously compiled from native
source revision `fda31309abdfd53091eb85aaab9c8165b8403b6a`, GitHub Actions run
`34618183369`, artifact `10273011037`; it is now already present in the current
remote baseline. No new local C++ build or replacement native binary is claimed.
The new data, path-cache, region and resource changes were rerun against the merged
source. Local source recovery does not include the repository's font binaries.

WASM SHA-256: `698921da1c2d684dc52b9607cb2031aee9d9f4ddb06a6dca107265d684a73505`.
JavaScript loader SHA-256 (both JS and CJS):
`ab5e415bb40d5a76ac20bf529dfe843d9eb0808bbb7aefa350f478330ee1df81`.
The upstream API remains pinned to `b33cf54f24edc5347567c95b1924c447669c1de8`.

## New behavior

### Native paint geometry and enum fidelity

The latest upstream update supplies the 18 native fill-path branches and text-geometry
adapters. This round preserves those changes, hardens enum normalization and bounds
outputs, and adds independent regression coverage rather than installing competing
adapters on top of them.

`SKPaint.GetFillPath` accepts all 18 upstream combinations of source, optional
`SKPath`/`SKPathBuilder` destination, cull rectangle, and resolution scale or matrix.
The full matrix and cull rectangle reach Skia rather than being collapsed to an
approximate scale. Hairline false-return behavior preserves the distinction between
obsolete path destinations and builder destinations. Source/destination aliases
work without deleting the source early. Invalid overloads fail before mutation.
`GetFastBounds` delegates to native Skia and handles normal rectangle outputs,
arrays, and `{ Value: rect }` outputs. Software-only effects do not report an
unfiltered native rectangle as their effective bounds.

Numeric paint enums previously could silently become a different native enum.
For example, a managed Stroke value could leave native Fill active, and the new
native fill-path export exposed outlined text rendering filled in PDF/XPS. The
merged normalization accepts equivalent native enum objects, numeric values, names,
and `{value}` forms for Style, StrokeCap, StrokeJoin and BlendMode. Invalid values
fail before changing the paint. The 27 style/cap/join combinations are checked
against native geometry and all exposed blend modes against native pixel output.

```js
const paint = new S.SKPaint({
  Style: S.SKPaintStyle.Stroke,
  StrokeWidth: 12,
  StrokeJoin: S.SKStrokeJoin.Round
});
const outline = paint.GetFillPath(path, S.SKMatrix.CreateScale(2, 3));
try {
  // Draw outline with a fill paint. It is actual native stroke geometry.
  canvas.DrawPath(outline, fillPaint);
} finally { outline?.Dispose(); paint.Dispose(); }
```

### Paths and regions

An 8 MiB default LRU retains JavaScript point data, not native SKPath owners.
GetPoints, GetPoint and path classifications reuse one native command read.
Returned points are independent values. Native generation changes, edits,
replacement, reset and disposal invalidate entries. Oversized paths bypass caching;
zero budget disables it. The byte budget counts retained typed point data and a
fixed bookkeeping allowance, not exact JavaScript-engine heap allocation.

```js
S.SKGraphics.SetPathCacheLimit(8 * 1024 * 1024);
console.log(S.SKGraphics.GetPathCacheStatistics());
S.SKGraphics.PurgePathCache();
```

Region construction unions rectangles in a balanced tree instead of rebuilding the
entire result after each rectangle. Band merging and intersection consume sorted
bands linearly; intersection can return without constructing a temporary region.
SetRects validates before replacing existing state. The new independent grid oracle
checks 60 generated cases, all six operations, and 576 points per case/operation
(207,360 point comparisons), alongside the existing region suite.

### Data and streams

CreateCopy respects byte-view offsets and explicit Number/BigInt lengths. Data
allocation and imports enforce the documented 512 MiB safety bound. True native
pointer addresses are not accepted as JavaScript byte storage. Exact-length stream
loads handle short reads and return null on premature EOF. SKStream and CLR-like
seekable-stream overloads retain their different declared-length conventions.

Create(buffer, length, release, context), Subset and AsStream retain shared storage.
A release callback runs once after the last retained view, including when the root
wrapper is disposed early. Span is a mutable JavaScript byte view; JavaScript cannot
provide C# compile-time readonly span enforcement. SaveTo emits bounded chunks
without a full-size temporary copy. SaveToAsync retains input across awaits and
releases acquired writer locks on failure/cancellation; it does not close a
caller-owned stream. FromReadableStream bounds total input and cancels/releases
its reader on errors or abort. Writer CopyToData uses one full-size copy instead of
two. Tiny short reads and asynchronous producer chunks are coalesced into bounded
staging chunks; a 10,000-byte stream delivered one byte at a time uses two tracked
full/staging allocations, not a 64 KiB retained buffer per byte. Packed UInt32 reads
distinguish EOF, zero and truncated markers.

```js
const data = await S.SKData.FromReadableStream(response.body, {
  maxBytes: 32 * 1024 * 1024,
  signal: controller.signal
});
try { await data.SaveToAsync(writableStream, { signal: controller.signal }); }
finally { data.Dispose(); }
```

### Resource loading

URL loads for the same active registration share an in-flight promise. Replacing or
removing a resource cannot be undone by a late old response. A stale promise's
finally block cannot delete its replacement. Clearing a caching provider creates a
new cache generation, so an earlier response cannot repopulate it. URL imports can
use `MaxBytes` for bounded streaming. These rules preserve already waiting callers
without silently publishing their old bytes as the new resource value.

### Documents and the sample

The matching native runtime exposes actual PDF raster-decision events, including
bounded diagnostics and dropped-event counts. These are native instrumentation
points, not inference from image objects in the finished PDF. They do not guarantee
that every future or uninstrumented internal path is observed. PDF can still require
raster content for unsupported effects. Strict-vector mode rejects observed native
raster decisions, and the managed PDF/XPS path retains its existing policy.

`dist/optimization.html` is a font-free reusable-component sample. It draws the
original stroke beside its native fill geometry, supports width/cap/dash controls,
shows cache statistics, runs warmed CPU benchmarks, and exports native PDF with a
blur toggle, raster-decision report and strict-vector gate. The shared drawing code
is used unchanged in Node scene tests and preview generation. The actual sample
JavaScript/interactive controls have not passed a browser run on this host.

## Measured optimization results

Node v22.16.0, Linux x64. Each comparison uses five warmups and 21 measured rounds,
alternating before/after order. Equal outputs are asserted. These are CPU
microbenchmarks; they are not whole-application or physical-GPU speedups.

| Workload | Before median | After median | Ratio |
| --- | ---: | ---: | ---: |
| 500 query bundles on a 128-cubic path | 207.871 ms | 9.970 ms | 20.85x |
| Materialize 4 MiB from 256 writer chunks | 2.540 ms | 1.329 ms | 1.91x |
| Union 1,200 rectangles | 5.491 ms | 0.215 ms | 25.58x |

Path baseline uses caching disabled in the same runtime. Writer baseline reproduces
the old double-copy construction and compares every byte plus SHA-256. Region
baseline is sequential Op(Union) versus balanced SetRects in the same runtime, not
an old-revision whole-engine comparison. Canonical regions must compare equal.
Raw samples and checksums are in `OPTIMIZATION-BENCHMARK-0.5.json`.

## Verification actually performed

- All **31 new tests pass**, zero skipped: native paint overloads and enum fidelity,
  path-cache invalidation/budgets/output independence, data ownership/cancellation,
  region oracles, resource concurrency, and the shared sample/native PDF scene.
- The complete merged local suite is **352 tests: 347 pass, five fail, zero skipped**.
  Failures are a missing transient `RobotoFlex-Black.otf` document fixture, two
  missing `RobotoFlex-Variable.woff2` tests, a DejaVu byte-hash mismatch against the
  pinned .NET font reference, and the gallery test module's missing Roboto asset.
  The gallery module stops during setup; its 44 scene subtests did not run in this
  execution. Missing assets have not been converted into skipped or passing tests.
- The combined new-test and preserved upstream geometry run is **43/43**, including
  all 31 new cases and 12 existing geometry cases.
- The font-general suite also executes successfully using local DejaVu regular/bold.
  The exact pinned-font .NET check remains failed rather than rewriting its hash.
- **33,962 comparisons pass** against a recovered .NET-generated contract corpus:
  descriptors, path measures, segments, pixel operations and canonical glyph paths.
  .NET was not freshly executed in this host. Corpus assembly is SkiaSharp 4.154.0.0.
- **100,000 native-raster resource cycles pass** after 2,000 warmup cycles, including
  4,000 encodes, 4,000 decodes, 2,500 pictures, 1,000 PDFs and 1,000 animations.
  Recorded handle growth is zero; WASM linear-memory capacity growth is zero;
  post-GC JavaScript heap spread is 136,264 bytes. This finite test is not an
  indefinite production or hardware GPU soak.
- The PDF/XPS outlined/gradient text fidelity regression passes after fixing numeric
  enums. The latest upstream
  searchable PDF test sizes its page from measured text width; that correction is
  preserved, and no search assertion was removed.
- Browser execution was attempted but navigation failed with
  `ERR_BLOCKED_BY_ADMINISTRATOR`: this host has a managed URL block policy.
  No policy was altered. Actual GPU/browser integration and physical hardware
  qualification remain unverified in this round. Static Chromium layout captures
  use native-raster preview images and do not certify application JavaScript.

Run the independent new tests without external font files:

```sh
npm run check
npm run test:optimization
node scripts/benchmark-optimization.mjs test-output/optimization/benchmark.json
node --expose-gc scripts/soak-runtime.mjs 100000 test-output/optimization/soak.json
node scripts/review-optimization.mjs
```

Browser verification on a permitted host:

```sh
python -m pip install playwright==1.55.0
python -m playwright install --with-deps chromium
python scripts/verify-optimization.py
# Uses software GPU flags by default; physical hardware is a separate requirement:
python scripts/verify-optimization.py --require-physical-gpu
```

The new workflow runs the font-free checks and publishes CPU/browser evidence when
committed to a connected runner. Adding a workflow is not evidence that it has run.

## Declaration review and remaining gaps

This recovered patch was reconciled onto `49c7a4e`, preserving the newer native
runtime and its separate qualification evidence. Its original local evidence
remains in `OPTIMIZATION-VERIFICATION-0.5.json`; `VERIFICATION-0.5.json` continues
to describe the earlier independently qualified native runtime and is not replaced.

The saved patch originally reviewed 25 declarations against its older audit.
The current main audit already includes 19 of those reviews. Regenerating the
optimization overlay now adds only **six** targeted reviews: paint Style and
BlendMode, three non-pointer CreateCopy overloads, and ToArray. The overlay is
1,988 implemented, 1,057 partial/unverified, 872 not-applicable and 78 missing,
still totaling 3,995. These counts are not a universal conformance claim.
`OPTIMIZATION-CONFORMANCE-0.5.json` records the six exact declarations and their
finite test evidence; the earlier native qualification report remains intact.

Remaining work includes unresolved/partially verified overloads, native desktop
pointer/driver/COM interfaces, full asset-matrix testing, document effects outside
the instrumented coverage, every possible font/ICC/Lottie file, unrestricted GPU
interop, physical driver qualification and extended production memory behavior.
All requested remaining features have **not** been completed by this round.

## Recovery and publication

The changes originate in the saved local optimization commit
`9b3ca3edfcecc19d8262d89243077d9b3b1095a0`, based on `c817226`.
This publication preserves newer documentation, package scripts and Geometry Lab
navigation from `49c7a4e`. The original optimization verification is retained as
historical evidence rather than replacing the native-runtime qualification report.
See `RECOVERY-PUBLICATION.md` for the reconciliation and test scope.

No font binaries or native runtime binaries are added or replaced by this patch.
The font-free Optimization Lab and its 31 targeted tests do not need font assets;
the full gallery continues to use the repository's existing pinned fonts.
