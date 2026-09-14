# SkiaSharpWeb.Blazor 0.6.0

- .NET 8/.NET 10 SkiaCanvas and provider with the qualified native JavaScript/WASM runtime and preserved relative asset layout.
- Retained drawing batches, synchronous browser paint callbacks, surface/canvas handles, resize/backend lifecycle and asynchronous disposal fences.
- Streamed PNG snapshots and pixel reads, full native function handles and literal application data.
- Native binary/asset integrity checks, no bundled font files, preserved dependency notices.
- Package-restored WebAssembly/Server samples validating actual pixels/PNG, streams, Razor callbacks and remounting.
- Root/Blazor documentation and validation-gated NuGet publication with public-payload verification and runnable sample artifacts.

Native capabilities/limitations remain unchanged. Typed helpers are complemented by generic native interop; this is not an exhaustive generated C# SkiaSharp port. Chromium software tests do not establish physical-GPU qualification.
