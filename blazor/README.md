# SkiaSharpWeb.Blazor

Install `SkiaSharpWeb.Blazor` 0.6.1 for .NET 8/.NET 10. The real Skia JavaScript/WASM runtime is packaged as local static web assets, retaining native relative paths and dependency notices. Fonts are neither bundled nor implicitly downloaded.

## Canvas and drawing

Use `SkiaCanvas` with a real CSS height. `Backend` accepts auto/canvas/webgl/webgpu; explicit Width/Height use native backing-store pixels. The engine handles resize and device-pixel ratio when dimensions are automatic. `DrawCommands` supports clear, rect, circle, line, oval, roundRect, save/restore, translate, scale, rotate and clipRect. Batches validate finite numeric values and balanced save scopes before drawing.

After `Ready`, call `DrawAsync`, `InvalidateAsync`, `FlushAsync`, `GetInfoAsync`, `SnapshotAsync` or `ReadPixelAsync`. Binary results are streamed, avoiding the Server message-size ceiling. `GetSurfaceAsync`/`GetCanvasAsync` expose borrowed native handles; `SkiaProvider`/`SkiaModule` expose the full initialized native namespace.

For text, paths, images, effects, documents and advanced GPU APIs, use a synchronous browser callback via `Render = BrowserFunction.Module("./drawing.js", "paint")` or native object methods through `Module`. A paint callback receives `(native, canvas, info)`. Do not pass an asynchronous Server callback into the synchronous paint loop. Batch drawing avoids per-primitive network calls on Server.

The [sample](sample/Demo.razor) draws with native Skia, checks an exact red RGBA pixel, verifies a real PNG signature and tests unmount/remount. Full native compatibility boundaries remain in the project guide. This is a browser-engine wrapper, not an exhaustive generated C# SkiaSharp replacement.

See [INTEGRATION.md](INTEGRATION.md) for lifecycle, hosting, reference ownership, streaming and publishing.
