# SkiaSharpWeb.Blazor 0.6.1

Updates the pinned interop runtime to tested Dockyard revision `1c895b7184451071e1c7131063249d2d9eb145b9`; the resulting package remains self-contained.

- Await concurrent native/module/subscription cleanup and asynchronous unsubscribe, preserving the native asynchronous disposal fence.
- Preserve callable property/method/disposal access, cyclic/deep argument graphs and shared callback identity.
- Honor initialization-wait cancellation independently for each caller and prevent late native construction after disposal.
- Add `CallFunctionJsonAsync<T>` and expanded JavaScript/managed regressions.

SkiaCanvas, retained drawing batches, native surface/canvas access, streaming pixels/PNG, backend/resize handling and all initialized native exports remain available. The native Skia/WASM binaries, relative paths, integrity checks, build prerequisites and dependency notices are unchanged. No fonts are bundled or implicitly downloaded.

The .NET 8/.NET 10 WebAssembly/Interactive Server package matrix validates native pixels and PNG output before publication. Software browser tests do not establish physical-GPU qualification. The release workflow verifies downloaded public NuGet payloads and attaches packages, symbols and samples.
