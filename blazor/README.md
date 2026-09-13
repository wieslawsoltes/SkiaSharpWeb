# SkiaSharpWeb.Blazor

A self-contained .NET 8 / .NET 10 Razor Class Library with a real Skia/WASM canvas, browser-engine services and complete native export access. The package includes the qualified engine JavaScript/WASM and dependency notices, not a Canvas 2D replacement or CDN loader. No font binaries are bundled or downloaded implicitly.

```sh
dotnet add package SkiaSharpWeb.Blazor --version 0.6.0
```

```razor
@using SkiaSharpWeb.Blazor
<SkiaCanvas Width="800" Height="400" Backend="auto" DrawCommands="commands"
            Ready="OnReady" Style="display:block;height:400px" role="img" aria-label="My drawing" />
@code {
    private SkiaDrawCommand[] commands = [
        SkiaDrawCommand.Clear("#ffffff"),
        SkiaDrawCommand.Rect(20, 20, 200, 100, "#356ac3"),
        SkiaDrawCommand.Circle(400, 180, 80, "#d74c62")
    ];
}
```

## Rendering and surface lifetime

`SkiaCanvas` uses the native `skia-canvas` scheduler and `SKSurface`. Backend choices are `auto`, `canvas`, `webgl`, and `webgpu`, subject to the native engine's actual capabilities. `canvas` is the real Skia software rasterizer presented through Canvas 2D. Auto selection and device-loss behavior remain native. The returned `SkiaSurfaceInfo.Backend` reports the backend actually selected; the wrapper does not label every canvas as GPU-rendered.

`Width` and `Height` are optional backing-store pixel dimensions. When omitted, the native resize/DPR observer derives them from the CSS host size. `DrawCommands` is a retained batch replayed synchronously on repaint, resize or surface recreation. Replace the list or increment `Revision` after an in-place mutation. `DrawAsync` replaces the retained browser batch directly; a subsequent changed component parameter takes precedence. Commands support clear, rectangles, circles, lines, ovals, rounded rectangles, balanced save/restore, translate/scale/rotation and clipping. Colors use native hexadecimal ARGB conventions. Validation rejects unknown operations, invalid numeric arguments and unbalanced state before replacing the retained batch.

A batch crosses interop once, not once per primitive. Native paint resources are disposed after drawing and canvas state is restored. `InvalidateAsync`, `FlushAsync`, `GetInfoAsync`, `ReadPixelAsync` and `SnapshotAsync` provide typed operations. Snapshots use native Skia codecs and return `byte[]`; pixel reads use native snapshot/readback, not DOM screenshots. Large Server image transfers require suitable SignalR limits or application-level streaming/batching.

`Ready` runs after the first completed native frame. `Changed` forwards surface errors/device loss; opt into `Events` containing `dom:paint` for compact frame notifications. Do not send a per-frame callback through a Server circuit for animation. Native asynchronous disposal fences are awaited when the component releases its surface; DOM removal also triggers cleanup and cancels pending native scheduler work.

## Full native drawing and engine APIs

Use `Render="BrowserFunction.Module(\"./drawing.js\", \"paint\")"` to invoke a synchronous browser paint function with `(api, canvas, imageInfo)`. This exposes native paths, text/shaping, images, shaders/effects, transforms, pictures, GPU resources and all available native features at browser speed. The callback must be synchronous because native PaintSurface is synchronous. Asynchronous .NET callbacks cannot replace this contract, especially on Server. Load resources before painting and invalidate when ready.

`GetSurfaceAsync` and `GetCanvasAsync` return real native `IJSObjectReference` handles for advanced imperative operations. After drawing through an asynchronous C# interop call, call `FlushAsync`; do not retain a surface/canvas across resize or backend recreation. Reacquire the reference after recreation. The surface owns its canvas, so releasing an interop handle must not independently destroy a canvas still used by that surface.

`SkiaModule` / `BrowserModule` exposes `GetExportsAsync`, `CreateAsync`, `InvokeAsync`, `CallAsync`, `GetAsync`, `SetAsync`, `SubscribeAsync`, and `ReleaseAsync`. The entire initialized native namespace is available, including CanvasKit and the library's document, image, path, font, effect and GPU APIs. Generic interop is not an exhaustive strongly typed C# reimplementation of every SkiaSharp class. Existing [native compatibility boundaries](../COMPATIBILITY.md) remain applicable.

`SkiaProvider` is an optional lifecycle provider with `RenderFragment<BrowserModule>` content for nonvisual image/path/document work. Created objects belong to the session; objects returned by native factories need explicit native lifetime management. `IJSObjectReference.DisposeAsync` frees only the interop handle, while `ReleaseAsync` also calls native disposal. Use per-component/per-circuit modules, never application-wide Server singletons. Native references and callbacks cannot be serialized as ordinary CLR object graphs.

## Hosting and assets

Use interactive WebAssembly or Interactive Server. Static prerender emits an inert host and performs no JavaScript/WASM initialization. Consumers need no npm, Node, CDN or source submodule. Deploy `_content/SkiaSharpWeb.Blazor` with the application and serve `.wasm` as `application/wasm`. Preserved `engine/lib`, `engine/package` and `engine/vendor` directories keep relative asset URLs correct under a non-root application base URI. The package does not silently load fonts; register application-owned fonts through the native API when required.

## Source build and samples

```sh
git submodule update --init --recursive
npm ci
npm run build
node blazor/build.mjs
dotnet run --project blazor/sample/Sample.csproj
dotnet run --project blazor/server/Server.csproj --urls http://localhost:5080
# Server sample: http://localhost:5080/probe/
```

The native package build verifies qualified binary hashes. The Blazor build additionally verifies the actual WASM magic/size and rejects font binaries in package assets. Common lifecycle code, project/host templates and consumer tests come from a commit-pinned source submodule; the resulting NuGet package has no Dockyard runtime dependency. Project-specific rendering code and the sample remain reviewed source in this repository.

CI packs both target frameworks, inspects the actual nupkg, runs bridge and managed lifecycle/prerender checks, restores WebAssembly/Server sample consumers from that package, and tests them in Chromium at non-root paths. The sample asserts actual native red pixels, PNG signature/encoding, dimensions/backend, and repeated unmount/remount. Browser diagnostics, packages and published samples are retained. These tests qualify the software Skia backend; they do not establish physical-GPU or all-browser qualification.

## Release publishing

NuGet is versioned independently of npm in `blazor/Version.props`. A version-changing PR merged to main publishes only after both validation matrices pass, using `NUGET_API_KEY` (fallback `NUGET_TOKEN` or `NUGET_KEY`). Manual dispatch defaults to validation-only. `blazor-v<version>` releases attach NuGet packages and the runnable WebAssembly sample without changing npm releases. Update the shared source and reusable workflow pins together through PRs.
