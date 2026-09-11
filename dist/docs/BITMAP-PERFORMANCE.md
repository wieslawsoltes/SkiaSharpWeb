# Immutable bitmap rendering and component performance

`SKCanvas.DrawBitmap` reuses a native `SKImage` snapshot for an immutable `SKBitmap`. Mutable images retain their original uncached semantics. The default 32 MiB LRU budget bounds retained pixel storage. Disposal, pixel-change notification, allocation replacement and explicit resource purges remove the cached image. Static codec factories returning original base-class instances are covered by the same lifecycle hooks.

```js
bitmap.SetImmutable();
SKGraphics.SetBitmapCacheLimit(32 * 1024 * 1024);
canvas.DrawBitmap(bitmap, 0, 0);
console.log(SKGraphics.GetBitmapCacheStatistics());
SKGraphics.PurgeBitmapCache();
```

The cache owns its snapshot, never the caller's bitmap or separately created images. RetainedBytes describes logical pixel storage, not total native heap or GPU driver memory. SKGraphiteImageCache has its own byte/entry budgets and native identity handling.

## Measured workload

Run `node scripts/benchmark-bitmaps.mjs --output docs/BITMAP-PERFORMANCE.json`.

The checked result uses actual Skia CPU rasterization: 10,000 draws of a 24-by-24 immutable sprite on a 512-by-512 surface, five warmup rounds per configuration, then 21 interleaved measured rounds. With the rebuilt runtime identified in the JSON, median time changed from 43.28 ms uncached to 31.43 ms cached (1.38x). Snapshot construction changed from 10,000 to one per measured round. Both configurations produce the same SHA-256 pixel hash. This is a workload-specific CPU result, not a universal speedup or GPU throughput measurement.

`tests/render-cache.test.mjs` verifies immutable reuse, mutable pixel changes, disposal, byte-budget eviction, cache disabling, resource purges, externally notified pixels and base-class codec instances against real Skia pixels. `tests/native-memory.test.mjs` verifies compiled diagnostics and image identity rather than substituting mocks.

## Interactive sample

`dist/performance.html` uses the reusable custom element, renderer switching, 100-request invalidation batches, workload and cache controls, live counters, PNG export and native memory diagnostics. CPU drawing time is labelled separately from GPU execution time. The memory trace control reports native binding availability rather than inventing statistics.

The component scheduler combines concurrent invalidations, reuses unchanged surfaces, discards stale asynchronous initialization, and handles resize, disconnect and device loss. The completed browser run confirmed a 100-request batch produced exactly one additional frame with the same native Graphite surface. Its four 1,000-bitmap frames produced 3,999 cache hits, one miss and 2,304 retained pixel bytes.
