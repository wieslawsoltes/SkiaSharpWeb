# Architecture

`dist/lib/index.js` assembles a PascalCase JavaScript API around the bundled native Skia WebAssembly engine. The custom CanvasKit build combines Graphite/Dawn WebGPU, Ganesh/WebGL, raster rendering, ICU/HarfBuzz, FreeType, codecs, Skottie and native PDF. This is a compatibility layer over Skia, with explicit browser adaptations.

Initialization shares a promise for concurrent default callers and retries after failures. `isolated: true` creates a separate namespace/font registry. `Initialize({CanvasKit})` injects an engine, including in Node. Capabilities are detected from that engine's actual bindings.

## Module responsibilities

| Modules | Responsibility |
| --- | --- |
| `core`, `paths`, `images`, `canvas` | Values and native handles, geometry, drawing, pictures, surfaces and backend selection |
| `fonts`, `font-engine`, `font-cff`, `font-cache` | Registries, format/variation processing, hint-preserving document conversion, bounded caches and native text |
| `regions`, `effects`, `path-effects`, `canvas-effects`, `layer-effects` | Native region/effect execution and Float32 fallback graphs |
| `gpu`, `gpu-records`, `webgpu` | Graphite/Ganesh adapters, asynchronous readback, GPU presentation and compatibility primitive renderer |
| `overloads`, `conformance`, `color-space`, `portable-values`, `text-interop` | Argument dispatch, value conventions, native color spaces, runtime effects and shaped text |
| `assets`, `asset-streams`, `asset-codecs`, `asset-pixels`, `asset-textblobs` | Streams, native codecs/encoders, pixel operations and cluster-aware blobs |
| `surface-formats` | Raster format/stride/ownership dispatch, native surface properties and high precision readback |
| `documents` | Native PDF and SVG, managed PDF/XPS, vector recording and explicit managed fallback patches |
| `animation`, `specialized` | Native Skottie, resource providers, scene nodes, drawables and forwarding canvases |
| `index` | Assembly, asset locations, initialization cache and reusable web component |

Base types are assembled before extension installers. Overloads precede effect/layer hooks; assets and specialized canvases precede document recording; conformance and surface adapters complete the namespace. Installers preserve wrapped method ownership and idempotence.

## Native WebGPU rendering

An onscreen surface attempts its requested backend/fallback chain. Graphite creates a browser device context, ordered recorder, persistent RGBA8 WebGPU render texture and wrapped native Skia surface. All native drawing records into Graphite. Flush snaps and inserts the recording, submits Skia's work, then presents the texture through a WebGPU render pass. The normal frame does not copy a CPU-rendered surface to the GPU.

A native recorder image provider converts raster/decoded images into Graphite textures through Skia transfer tasks. Its LRU retains at most 256 images and one quarter of the recorder budget, capped at 64 MiB. Cache keys include native image identity and mipmap requirements. Statistics report actual uploads/hits; callers can purge retained images.

`Flush` submits without waiting. `FlushAsync` waits for queue completion; `SnapshotAsync` reads back through a mapped GPU buffer and returns an independently owned raster image. `Dispose` invalidates wrappers immediately and defers context/device destruction until submitted work completes. `DisposeAsync` waits for that cleanup. A canvas is borrowed from its surface and must not outlive it.

The bundled bridge corrects the Emscripten imported-device queue lifetime and supplies matching WebGPU ABI enums. Exact sources, pinned revisions, reproducible build commands and SHA256 hashes are under `native/`. Actual Dawn/SwiftShader execution establishes software GPU behavior; target browser and physical driver validation remains separate.

## Compatibility presentation and raster surfaces

An injected CanvasKit without Graphite uses the retained primitive/raster WebGPU presenter. Unrestricted clear begins an eligible primitive frame; simple rectangles, circles and lines are stored as copied values and submitted as 52-byte instances. Complex drawing materializes the pending commands through raster Skia, then uploads its pixels. Reusable geometrically grown buffers avoid per-frame allocations; queue texture writes use tight rows. Raster and WebGL routes bypass primitive bookkeeping entirely.

Raster surfaces preserve supported native color/alpha types, color space, row stride and surface properties. Copied external buffers synchronize on Flush and NotifyPixelsChanged; borrowed WASM memory follows explicit ownership rules. Float16/Float32 surfaces avoid forced RGBA8 conversion in native high precision operations. Canvas presentation and PNG exports can still require 8-bit output.

## Regions, effects and fonts

Bundled region conversion/serialization and compound path effects call native Skia. JavaScript band operations avoid pixel-sized storage for rectangle Boolean operations. A portable region encoding remains distinct from native serialized bytes. Injected stock engines can use documented sampled fallbacks.

Specialized filters prefer native handles. Software graphs retain Float32 intermediates and use bounded reusable scratch storage; CTM, clipping and logical layer state determine evaluation/composition. Conversion to the final target format occurs at its boundary. Exact behavior for every effect graph and destination format requires broader differential coverage.

Fonts retain normalized registered bytes. Native HarfBuzz performs variation/shaping and SkParagraph handles rich layout. Resolved CFF2 is retained for native rendering; document CFF1 conversion preserves hints, masks, private dictionaries and cubic programs. Cache entries reuse normalization and instancing while returned objects maintain independent ownership. See FONT-FIDELITY.md for positive and negative-control evidence.

## Documents, animation and resources

PDF defaults to native Skia. Native metadata, fonts, vectors, images and filters follow that backend. Skia does not expose per-operation rasterization telemetry, so `RasterFallbacks` is null. The managed PDF writer and XPS writer record supported operations with copied resources, embed text/fonts, preserve supported groups and report unsupported changed-pixel patches. StrictVector rejects operations needing patches. PDF/A output metadata is tested separately from formal conformance certification.

Native Skottie evaluates Lottie animation and its supported resources, properties and timelines. Resource providers retain copied bytes and cache asynchronous loads. The retained scene hierarchy is a web extension with conservative invalidation and hit testing; it does not promise upstream scene-graph equivalence or automatic damage-only rendering.

## Verification discipline

Native handles are deterministically disposed; paints retain effects, fonts retain faces, snapshots retain image content, and borrowed pixel views expire with their owner or WASM growth. Tests exercise these relationships as well as output pixels. The declaration inventory tracks 3995 pinned source entries; names and overload adapters do not by themselves prove behavior. Compatibility, differential references, GPU results and performance measurement limits are recorded separately in the accompanying reports.
