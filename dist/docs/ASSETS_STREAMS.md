# Image, codec, stream and text-run completion

The asset adapters are installed by `installAssetExtensions(CanvasKit, api)` after the core, GPU and overload adapters and before document recording. Installation is idempotent. Native operations use bindings in the same CanvasKit module; native objects are never passed between independent WASM modules.

## Implemented native contracts

- `SKPngEncoderOptions`: filter masks and compression levels 0–9.
- `SKJpegEncoderOptions`: quality, 4:2:0 / 4:2:2 / 4:4:4 chroma sampling, and Ignore / BlendOnBlack alpha handling.
- `SKWebpEncoderOptions`: independent lossy/lossless mode and floating-point quality/effort. Lossy quality 100 remains lossy. All lossless effort values remain lossless.
- `SKWebpEncoder`: single image and animated frame encoding into `SKData` or writable streams. `SKWebpEncoderFrame` accepts pixmaps, bitmaps and images. JavaScript duration numbers represent milliseconds; `{ TotalMilliseconds: number }` is also accepted.
- `SKCodec`: native image info, origin, dimensions, animation metadata and dependencies, subsets, frame decode, scanline decoding and incremental destination-buffer decoding. Codec results are returned unchanged, including legitimate format-specific `Unimplemented` results. PNG, for example, supports incremental decoding while its native scanline decoder returns `Unimplemented`.
- `SKImage.ToRawShader`, `ApplyImageFilter`, and `RequestReadPixels`: native shader semantics, returned filter subset/offset, all native rescale modes and source/linear gamma. To observe conversion back into sRGB after linear-light scaling, supply an sRGB destination color space.
- `SKBitmap.ExtractAlpha`: native A8 mask filtering, aligned rows and expanded bounds/offsets.
- Native positioned and rotation-scale text blobs, optional explicit bounds, retained UTF-8 text/cluster data, and text intercepts. Skia deliberately ignores RSXform runs when computing intercepts and forces fill style for path intersection; the wrapper preserves those native rules.

`SKCodec.DecodeMode` is `native` with the bundled extension. An older engine without the extension uses a separately identified `decoded-frame-buffer` fallback, which decodes a complete frame before serving rows. That fallback does not claim native incremental parsing of encoded input.

## Portable memory and file contracts

`SKPixmap` supports empty construction/reset, borrowed subset views, typed spans, floating-point pixel channels, alpha/opacity queries, and views that reinterpret color type, alpha type or color space. Subsets share the original storage and preserve row stride. The last row uses the native minimum byte-size formula rather than requiring trailing padding. Owner disposal and typed-array alignment are checked.

`SKBitmap` accepts the opaque constructor, explicit row stride, allocation flags, output pixmaps, coordinate-relative spans, copy capability checks, and alpha extraction. Installing arbitrary JavaScript bytes copies them into WASM-owned pixel memory; `PixelInstallMode` is `copy-to-wasm`. This is an explicit memory adaptation, not a retained external process pointer.

Streams implement little-endian primitive fields, out-value boxes, bounds-checked buffer/offset reads, peeking, skipping, packed UInt32 fields, text fields and chunked stream copying. Packed UInt32 uses Skia's 1/3/5-byte format with `0xFE` and `0xFF` sentinels. `SKDynamicMemoryWStream.CopyTo(stream)` forwards chunks without first concatenating the entire source.

Synchronous filename APIs use explicitly mounted browser resources:

```js
SKFileSystem.Mount('/images/source.png', pngBytes);
const image = SKImage.FromEncodedData('/images/source.png');

const output = SKFileWStream.OpenStream('/images/result.webp');
const frame = image.PeekPixels();
SKWebpEncoder.Encode(output, frame,
  new SKWebpEncoderOptions(SKWebpEncoderCompression.Lossless, 75));
output.Dispose(); // Flushes the completed bytes to the mounted path.

const bytes = SKFileSystem.ReadAllBytes('/images/result.webp');
// Optional persistence through an already granted File System Access handle:
await SKFileSystem.SaveAsync('/images/result.webp', fileHandle);
```

`SKFileSystem.MountAsync` imports a URL, Blob/File or FileSystemFileHandle before synchronous use. Arbitrary operating-system paths and process addresses are outside the browser address space. `SKFrontBufferedStream` and `SKFrontBufferedManagedStream` rewind within their configured prefix; moving beyond that prefix prevents subsequent rewind. Read-only writes and length changes throw explicit errors.

## Typed text runs

```js
const builder = new SKTextBlobBuilder();
const bytes = new TextEncoder().encode('Hello');
const run = builder.AllocatePositionedTextRun(font, 5, bytes.length);
run.SetGlyphs(font.GetGlyphs('Hello'));
run.SetPositions(font.GetGlyphPositions(run.Glyphs, new SKPoint(20, 80)));
run.SetText(bytes);
run.SetClusters([0, 1, 2, 3, 4]);
const blob = builder.Build();
canvas.DrawTextBlob(blob, 0, 0, paint);
```

All plain, horizontal, positioned, rotation-scale, text and raw allocation variants are present. Typed buffers expose glyph, position, UTF-8 and cluster spans. Building snapshots the buffers and retains independent font ownership until blob disposal. `blob.TextRuns` exposes copies of glyph/text/cluster/position arrays and borrowed font references for document recording. A run's `Origin` is applied in addition to its positions.

## Verification and performance

The regression suite checks exact packed-stream bytes, byte offsets, aliases and disposal, PNG scanline filters against an independent zlib inflater, JPEG SOF sampling factors, WebP compression chunk types, lossless pixel equality, native animated frame durations, native codec row protocols, filtered alpha bounds, floating-point pixels, source-versus-linear-light scaling, glyph intercepts and retained UTF-8 clusters. The sample scenes demonstrate native encoders and typed text runs.

Native codecs use a single SkCodec instance rather than allocating both an animated-image decoder and a second codec. Pixmap pixel queries read common byte/float formats directly. Text factories avoid duplicate positioned-run construction, and writable stream copies avoid a full-size intermediate concatenation. These changes reduce allocations and boundary crossings; no physical GPU performance claim is inferred from CPU/WASM tests.

The standalone PNG fallback vendors pako 1.0.11 under its MIT/Zlib license. Native PNG/JPEG/WebP encoding uses the Skia build's existing third-party codec dependencies and license notices.

## Native GPU image verification

`native/verify_gpu_images.mjs` ran against the actual Dawn Vulkan device backed by SwiftShader driver 5.0.0. Both mipmapped and unmipmapped `SKImage.ToTextureImage(SKGraphiteRecorder)` produced the exact expected RGBA pixels. The source raster was disposed before drawing, and both texture-image wrappers were disposed before GPU submission; recorded commands retained the resources correctly. Recorder disposal was prevented while image wrappers were alive. Cleanup left zero registered native device, queue and texture handles, with no uncaptured GPU errors. `docs/gpu-image-validation.json` records the adapter and measured results.

This is a real software GPU-device execution, not physical GPU validation. Ganesh `ToTextureImage(GRContext)` and `FromAdoptedTexture` call actual native Ganesh bindings and have wrapper argument/ownership tests, but were not exercised against a live WebGL context by this script. Dawn/Vulkan is not a WebGL provider.

The verification script accepts `SKIA_WEB_ROOT`, `SKIA_NATIVE_DIR`, `SKIA_WEBGPU_MODULE` and `SKIA_GPU_IMAGE_REPORT`. Supply a valid Vulkan ICD using the environment's standard Vulkan configuration, or run with the deployment platform's native GPU adapter.

`SKManagedStream.CopyTo(destination)` consumes from the current source position, flushes the destination, and returns the native-style Int32 count of source bytes read. As in the pinned upstream implementation, a destination `Write` return value of `false` does not stop copying; exceptions propagate. `ToMemoryStream()` consumes the remaining bytes and returns an independently owned stream positioned at zero. Regression tests cover nonzero positions, short reads, failed write return values, exceptions, flushing and independent disposal.
