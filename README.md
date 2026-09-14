# SkiaSharpWeb

SkiaSharp-style JavaScript graphics with native Skia Graphite/WebGPU, Ganesh/WebGL and raster Canvas backends, plus Blazor components.

[![npm](https://img.shields.io/npm/v/%40wieslawsoltes%2Fskiasharpweb)](https://www.npmjs.com/package/@wieslawsoltes/skiasharpweb)
[![npm downloads](https://img.shields.io/npm/dm/%40wieslawsoltes%2Fskiasharpweb)](https://www.npmjs.com/package/@wieslawsoltes/skiasharpweb)
[![NuGet](https://img.shields.io/nuget/v/SkiaSharpWeb.Blazor)](https://www.nuget.org/packages/SkiaSharpWeb.Blazor)
[![NuGet downloads](https://img.shields.io/nuget/dt/SkiaSharpWeb.Blazor)](https://www.nuget.org/packages/SkiaSharpWeb.Blazor)
[![Blazor CI](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/workflows/blazor.yml/badge.svg)](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/workflows/blazor.yml)

## JavaScript

```sh
npm install @wieslawsoltes/skiasharpweb
```

The [complete JavaScript guide](README.web.md) preserves existing API examples, native engine information, qualification, compatibility and licensing. [Open the web demo](https://wieslawsoltes.github.io/SkiaSharpWeb/).

## Blazor

```sh
dotnet add package SkiaSharpWeb.Blazor --version 0.6.0
```

The .NET 8/.NET 10 RCL supports interactive WebAssembly and Server, with actual native JavaScript/WASM assets packaged locally. `SkiaCanvas` provides retained drawing batches, synchronous browser rendering callbacks, backend selection, dimensions, snapshots, pixel reads and native surface/canvas handles. No consumer npm/CDN dependency or implicit font download is required.

```razor
@using SkiaSharpWeb.Blazor
<SkiaCanvas Backend="auto" DrawCommands="commands" Style="height:400px" />
@code {
    private SkiaDrawCommand[] commands = [SkiaDrawCommand.Clear("#ffffff"),
        SkiaDrawCommand.Circle(120, 120, 80, "#245bc3")];
}
```

See the [Blazor guide](blazor/README.md), [integration contract](blazor/INTEGRATION.md), [sample](blazor/sample/Demo.razor) and [release notes](blazor/RELEASE.md).

```sh
git submodule update --init --recursive
npm ci
npm run build
node blazor/build.mjs
dotnet run --project blazor/sample/Sample.csproj
# Or: dotnet run --project blazor/server/Server.csproj
```

Source builds require the .NET 10 SDK with .NET 8 targeting support. The Server sample uses `/probe/`. CI checks native binary integrity, package assets and package-restored consumers on both frameworks/hosts, including actual pixels/PNG, full streams, templates and remounting. Software Chromium tests do not establish physical-GPU qualification.

`blazor/Version.props` independently versions NuGet. Version-changing main merges publish after validation using `NUGET_API_KEY` (`NUGET_TOKEN`/`NUGET_KEY` aliases), verify public payloads and create `blazor-v*` releases with symbols, samples and checksums. See [LICENSE](LICENSE), [COMPATIBILITY.md](COMPATIBILITY.md) and bundled third-party notices.
