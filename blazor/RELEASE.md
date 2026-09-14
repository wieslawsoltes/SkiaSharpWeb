# SkiaSharpWeb.Blazor 0.6.2

Adopts shared runtime c833be49d472583b6f56225862e0aa7d201c1da7 from merged, validated Dockyard PR #5. Fixes concurrent visual disposal, late template imports/creation, callbacks queued before removal and retained cleanup failures. Adds IsReady/IsDisposed, awaitable Razor factory teardown and coalesced updates.

Preserves SkiaCanvas, retained drawing batches, native surface/canvas handles, backend/resize handling and streamed pixel/PNG output. Qualified native Skia/WASM binaries, relative asset paths, font exclusions, integrity checks and specialized build prerequisites are unchanged.

Both .NET targets restore the actual NuGet package into WebAssembly and Server samples. Tests include exact native pixels, PNG output, streaming, managed disposal regressions and template movement/update/recreation. Publication verifies public NuGet payloads and emits package/symbol/sample releases. Software browser validation is not physical-GPU or all-browser certification.
