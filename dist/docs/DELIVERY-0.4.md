# Delivery record — SkiaSharp Web 0.4

The updated source, native runtime, tests and both sample entry points are committed to this repository. The final additional implementation/test commit is `b8193d1c73a9ddf6589bd0e111568a83e641c62e`; reviewed audit tables were generated in `67d7414d9719124c861d416c46f39551af938265`. This record changes documentation only.

- [Graphics Lab](https://wieslawsoltes.github.io/SkiaSharpWeb/): 44 interactive scenes.
- [Performance/component Lab](https://wieslawsoltes.github.io/SkiaSharpWeb/performance.html): real reusable component, three backends, immutable-bitmap cache controls, native memory tracing, animation and PNG export.
- [Release details and remaining limits](./RELEASE-0.4.md).

## Final execution evidence

The merged local source passed **345 tests, zero failures and zero skips** against the actual compiled WASM. Native memory callback/identity and singular matrix/clip tests are included. The Pages pipeline reruns source integrity and the complete suite before deploying.

[Browser lifecycle and live .NET run 34612941371](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/runs/34612941371) completed successfully on the implementation commit above. It ran all 44 scenes on each of Canvas, WebGL and native Graphite, component resize/disconnect/reconnect, HDR and exact F32 readback, staging reuse, native image alias caching and native memory tracing. The final performance-page checks switched all three backends, exercised invalidation batching, disabled/enabled caching and parsed actual native memory diagnostics. No browser errors were recorded.

The performance component finished that control sequence with 113 invalidations, 12 frames, four surface creations, eight reuses and zero errors. Its bitmap cache recorded 9,998 hits, two misses, one eviction and 2,304 retained pixel bytes. The independent 10,000-invalidation component test produced one frame. These are workload counters, not an application-wide speedup claim.

Browser evidence artifact `10269395663` contains rendering.json, performance.json, ui.json and actual browser screenshots. Its SHA-256 is `4553bf429d84e31a3108e11067e93a0efe2d573d152b56a75f83450a14276fa2`. Chromium used SwiftShader; physical GPU qualification is still unverified.

The independent .NET 3.119 and 4.154-preview runs, native compilation provenance, two repeated-bitmap benchmark runs and their identical output hashes remain documented in the release and verification reports. They are finite tests, not proof of every overload or input format.

## Reproducible source

The Source snapshot workflow packages the producing commit, generated documentation and runtime, and writes `SOURCE_REVISION.txt` plus `SHA256SUMS`. Its archive excludes font binaries. The repository checkout and deployed Graphics Lab retain their existing assets; the separate performance sample and `Initialize({fonts:false})` do not require font files.

The reviewed 3,995-row inventory is **1,936 implemented, 1,042 partial/unverified, 873 browser-inapplicable and 144 missing** declarations. The last group remains desktop driver-pointer or CLR/COM integration, rather than fabricated browser equivalents. Complete behavioral parity, exhaustive input corpora and physical vendor-driver testing are not claimed.
