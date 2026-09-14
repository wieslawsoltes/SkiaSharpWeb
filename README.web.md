# SkiaSharp Web

[![CI](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/workflows/package-ci.yml/badge.svg?branch=main)](https://github.com/wieslawsoltes/SkiaSharpWeb/actions/workflows/package-ci.yml)
[![npm version](https://img.shields.io/npm/v/%40wieslawsoltes%2Fskiasharpweb)](https://www.npmjs.com/package/@wieslawsoltes/skiasharpweb)
[![npm downloads](https://img.shields.io/npm/dm/%40wieslawsoltes%2Fskiasharpweb)](https://www.npmjs.com/package/@wieslawsoltes/skiasharpweb)
[![GitHub release](https://img.shields.io/github/v/release/wieslawsoltes/SkiaSharpWeb)](https://github.com/wieslawsoltes/SkiaSharpWeb/releases/latest)
[![License: MIT](https://img.shields.io/github/license/wieslawsoltes/SkiaSharpWeb)](LICENSE)
[![Graphics Lab](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://wieslawsoltes.github.io/SkiaSharpWeb/)

An unofficial JavaScript graphics library with a familiar PascalCase `SK*` API,
compiled Skia Graphite/Dawn **WebGPU**, Ganesh **WebGL**, and a Skia raster **Canvas**
fallback. Reusable as a JavaScript library or `<skia-canvas>` web component.

**[Graphics Lab](https://wieslawsoltes.github.io/SkiaSharpWeb/) ·
[Optimization Lab](https://wieslawsoltes.github.io/SkiaSharpWeb/optimization.html) ·
[Packaging](docs/PACKAGING.md) · [Release procedure](docs/RELEASING.md)**

The qualified native renderer is bundled, not a placeholder. This project does
**not** claim complete SkiaSharp overload/behavioral parity or physical-GPU
qualification. See [compatibility](COMPATIBILITY.md) and the
[declaration audit](docs/OVERLOAD_CONFORMANCE.md).

## Install

```sh
npm install @wieslawsoltes/skiasharpweb
```

The package includes the qualified native WASM runtime and TypeScript declarations.

## Build a releasable npm package

```sh
npm ci
npm run release:check
```

The result is `artifacts/wieslawsoltes-skiasharpweb-<version>.tgz`, a checksum list, per-file
manifest and SBOM. The check installs the tarball into a fresh external application,
exercises real drawing/PNG/PDF output through ESM and CommonJS, validates TypeScript
consumers, and checks reproducible packing, native hashes, licensing and size budgets.
After the version PR passes all checks and merges, CI publishes immutable GitHub
release assets and verifies the public npm package, including a fresh install.

The runtime distribution contains **no font binaries, gallery, test corpus, native
build toolchain, install-time scripts, or runtime npm dependencies**. Font management
and shaping remain available with explicitly registered fonts. The standalone gallery
keeps its existing repository assets. Node 22/24, Linux/macOS/Windows, and installed
browser packages are covered by the package CI matrix.

## Use in Node

After installing the package:

```js
import { Initialize } from '@wieslawsoltes/skiasharpweb';
// CommonJS: const { Initialize } = require('@wieslawsoltes/skiasharpweb');
const S = await Initialize(); // Loads local bundled WASM. No implicit font downloads.
const surface = S.SKSurface.Create(new S.SKImageInfo(256, 160));
const paint = new S.SKPaint({ Color: S.SKColors.Teal, IsAntialias: true });
try {
  surface.Canvas.Clear(S.SKColors.White);
  surface.Canvas.DrawCircle(128, 80, 52, paint);
  const image = surface.Snapshot();
  try {
    const data = image.Encode(S.SKEncodedImageFormat.Png, 100);
    try { /* data.ToArray() contains PNG bytes */ }
    finally { data?.Dispose(); }
  } finally { image.Dispose(); }
} finally { paint.Dispose(); surface.Dispose(); }
```

Both module systems return the namespace asynchronously. Node uses the raster
backend; a custom initialized engine can be injected through `CanvasKit`.
`isolated:true` separates namespace caches, not the default Node WASM heap.

## Use in a browser

```sh
npx --no-install skiasharp-web-assets public/skia
```

```js
import { RegisterWebComponent } from '@wieslawsoltes/skiasharpweb/browser';
const S = await RegisterWebComponent({ assetBaseUrl: '/skia/' });
const view = document.createElement('skia-canvas');
view.style.cssText = 'width:100%;height:240px';
view.addEventListener('paintsurface', ({ detail: { Canvas } }) => {
  Canvas.Clear(S.SKColors.Teal);
});
document.body.append(view);
await view.InvalidateSurface();
```

The CLI copies the exact loader/WASM and notices, verifies native hashes, and
refuses accidental overwrites. Supply your deployment's correct base path. Use
HTTPS/localhost for WebGPU; `auto` falls back when unavailable. Raw ESM/CDN use can
load `dist/package/browser.js` with adjacent vendor assets. See the
[embedding guide](docs/PACKAGING.md) for CSP, MIME, CORS, font registration,
TypeScript, lifecycle and bundler asset rules. The existing gallery/core entry
retains its legacy defaults via `@wieslawsoltes/skiasharpweb/core`.

## Run the gallery

```sh
python3 -m http.server 8080 -d dist
```

Open `http://localhost:8080/`. Repository font assets are required by the original
44-scene gallery; the Optimization Lab is font-free. Examples for an installed
package are in `examples/npm-node/` and `examples/npm-browser/`.

## Features and evidence

Drawing, paths/Boolean geometry, regions, transforms, layers, native effects,
images/codecs, data/streams, font matching and variable/color-font processing,
shaping/bidi/paragraphs, pictures, Skottie/resources, native PDF and managed PDF/XPS
are documented in the [API guide](docs/API_USAGE.md). Format-specific and platform
limits are preserved, not counted as completed merely because a name is exported.

The [prior recovery evidence](docs/RECOVERY-PUBLICATION-RESULT.json) records 405
integration tests and 193,931 comparisons against freshly executed .NET SkiaSharp.
These are historical results for their recorded source hashes. Current package CI
reruns consumer, browser, native regression and .NET checks on the PR checkout.
Software GPU testing is separate from physical-device qualification.

## Maintainers

`npm version` synchronizes package, lockfile and runtime versions. Tags must match
`v<package-version>`. After the version PR merges and package CI passes, the
release workflow publishes the tested assets and the npm package. Publication
uses the configured `NPM_TOKEN` or npm trusted publishing and verifies the
exact archive, public registry metadata and fresh installed consumers. See [RELEASING.md](docs/RELEASING.md), [CONTRIBUTING.md](CONTRIBUTING.md)
and [SECURITY.md](SECURITY.md). The qualified native build remains independent.

## Attribution

Not affiliated with mono/SkiaSharp. The pinned API inventory is
`b33cf54f24edc5347567c95b1924c447669c1de8`; native build revisions and hashes are in
`dist/vendor/native-build-manifest.json`. Preserve the MIT project license,
Skia/CanvasKit and bundled font-engine notices when redistributing. The npm build
includes consolidated third-party notices and a scoped component inventory.
