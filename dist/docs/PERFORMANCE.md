# Performance measurements

Release 0.3 removes redundant raster command bookkeeping, uses instanced primitive buffers, avoids upload row-padding copies, and adds bounded native-image and font-instance caches. These measurements describe specific workloads in the recorded environment; they are not browser FPS or physical GPU speed claims.

## Reproducible CPU comparison

Run from the project root:

```sh
node scripts/benchmark.mjs --baseline /path/to/0.2/dist --count 10000 --rounds 31 --output benchmark.json
```

A baseline directory must contain the previous release's `lib/` and required relative assets. Both namespaces use the same current native WASM engine and explicit RGBA8888/unpremultiplied/sRGB surfaces, so this comparison isolates JavaScript changes. The script performs seven warmups, 31 measured rounds, and alternates baseline/current order. Raster snapshots are SHA256-identical.

| Workload | 0.2 median | 0.3 median | Observed change |
| --- | ---: | ---: | --- |
| Raster drawing, 10000 circles | 66.796 ms | 45.263 ms | 32.2% lower elapsed CPU-side time |
| WebGPU primitive validation/packing, 10000 instances | 5.426 ms | 0.300 ms | 18.1× faster preparation |
| Primitive bytes submitted per frame | 2,640,000 | 520,000 | 80.3% fewer bytes |
| Odd-width texture upload preparation,997×563 | 0.0806 ms | 0.001953 ms |Removed row-padding allocation/copy |

The WebGPU preparation cases use a submission sink. They time JavaScript validation, packing and preparation, with no GPU execution. The raster case executes actual Skia CPU rendering. Timing includes the shared host's scheduling and varies between runs. Full medians, CPU medians, p95 and hashes are in PERFORMANCE-RESULTS.json.

The compatibility primitive renderer now submits a 52-byte per-instance record and reuses geometrically grown CPU/GPU buffers. Its shader output was compared with the previous implementation on Dawn/SwiftShader: selected primitive pixels and the complete comparison image matched. GPUQueue.writeTexture accepts tight rows; encoder buffer-to-texture copies have a different alignment requirement.

## Native Graphite

The normal bundled WebGPU route renders through Skia Graphite and samples its persistent GPU texture for presentation. The 44-scene comparison verifies `lastUploadBytes === 0` for CPU-frame presentation uploads. Native image transfers still occur when decoded/raster images first become GPU resources; the recorder image-provider cache avoids repeated conversions. This distinction is explicit in the counters.

`surface.GraphiteContext` exposes the context. A recorder's `GetImageCacheStatistics()` reports Hits, Uploads, Bytes, Count and Budget; `PurgeImageCache()` drops retained image references. The native verifier proves a repeat-image hit, correct pixels and zero retained bridge device/queue/texture handles after teardown.

## Fonts and effects

The repeated-axis font benchmark measured 3.30ms cold versus 0.0113ms cached (approximately 293× in that workload). The cache is bounded to 32 MiB and returns independently owned wrappers. FONT-PERFORMANCE.json and `node scripts/benchmark-fonts.mjs` contain its evidence and command.

The stock-runtime fallback effect benchmarks measured a clipped 1024×1024 circle-region conversion at 271.637ms before versus 3.499ms after optimization, and a 1200×800 filtered canvas with a 20×30 clip at 24.194ms versus 0.458ms. These target bounded scan/filter work, not general application rendering. See EFFECT_FIDELITY.md and effects-benchmark-results.json.

## GPU verification commands

Supply a compatible Node WebGPU implementation exporting `create` and `globals`:

```sh
WEBGPU_MODULE=/path/to/webgpu/index.js node scripts/verify-webgpu.mjs
WEBGPU_MODULE=/path/to/webgpu/index.js node scripts/verify-graphite.mjs --output graphite.json --images graphite-images
SKIA_WEBGPU_MODULE=/path/to/webgpu/index.js node native/verify_native.mjs
SKIA_WEBGPU_MODULE=/path/to/webgpu/index.js node native/verify_gpu_images.mjs
```

The supplied tests used Dawn with a SwiftShader Vulkan ICD. Configure `VK_ICD_FILENAMES` and the driver's library search path for that local installation. The adapter identity and `physicalGPU: false` are recorded in GRAPHITE-VALIDATION.json and the native verification reports. No physical GPU/browser-driver or long-running production memory certification is implied.
