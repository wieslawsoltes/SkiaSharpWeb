# Installing and embedding SkiaSharp Web

The `skiasharp-web` npm package is a **font-free runtime distribution**, separate
from the repository's Graphics Lab. It contains the qualified native WASM,
JavaScript library, Node/browser entry points, TypeScript declarations, native
hash manifest, bundled-component SBOM and license notices. It contains no demo,
test corpus, secret configuration, native build toolchain, or font binaries.
There are no runtime npm dependencies or install-time scripts.
The package build replaces two legacy WOFF2 JavaScript invoker generators with
static closures, with exact input/output hashes. Its embedded decoder WASM and
qualified CanvasKit runtime remain unchanged; JavaScript `unsafe-eval` is not required.

## Install the tested tarball

```sh
npm ci
npm run release:check
npm install /path/to/SkiaSharpWeb/artifacts/skiasharp-web-0.5.0.tgz
```

The last command runs in your application's directory. Once the maintainer has
published a version, `npm install skiasharp-web@<version>` uses the registry.
Merging this packaging change does **not** claim an npm publication or name ownership.
Node 22 and 24 are the CI targets; the package declares Node >=22.

## Node ESM and CommonJS

```js
import { Initialize } from 'skiasharp-web';
// CommonJS: const { Initialize } = require('skiasharp-web');
const S = await Initialize();
const surface = S.SKSurface.Create(new S.SKImageInfo(64, 64));
try {
  surface.Canvas.Clear(S.SKColors.Red);
  const image = surface.Snapshot();
  try {
    const data = image.Encode(S.SKEncodedImageFormat.Png, 100);
    try { /* data.ToArray() contains PNG bytes */ }
    finally { data?.Dispose(); }
  } finally { image.Dispose(); }
} finally { await surface.DisposeAsync(); }
```

Initialization is asynchronous in both module systems. The Node entry reads the
bundled WASM locally and caches its initialization. Importing it does not fetch
remote assets. Node rendering is Skia raster; this entry does not manufacture a
browser WebGPU device. Supply `CanvasKit` explicitly for custom engines.
`isolated:true` creates separate SK namespace/cache state, **not a separate Node
WASM heap**. Inject an independently initialized engine when heap isolation matters.
The package provides `DisposeAsync()` for all surfaces; native Graphite retains its
own asynchronous completion fence, while raster/Canvas surfaces dispose synchronously.

## Browser with a bundler

Copy the exact native loader and WASM to your static directory:

```sh
npx --no-install skiasharp-web-assets public/skia
# To deliberately replace existing assets after an upgrade:
npx --no-install skiasharp-web-assets public/skia --overwrite
```

```js
import { Initialize, RegisterWebComponent } from 'skiasharp-web/browser';
const S = await RegisterWebComponent({ assetBaseUrl: '/skia/' });
const view = document.createElement('skia-canvas');
view.style.cssText = 'width:100%;height:240px';
view.addEventListener('paintsurface', ({detail:{Canvas}}) => {
  Canvas.Clear(S.SKColors.Teal);
});
document.body.append(view);
await view.InvalidateSurface();
```

The copy command verifies pinned native hashes and refuses existing targets or
symlinks by default. It copies license notices alongside the engine. It does not
copy fonts. Use your application's actual base path when hosting below a subpath;
`assetBaseUrl` points to a directory, not a WASM filename. Serve WASM as
`application/wasm`, JavaScript with an appropriate JavaScript MIME type, and permit
both URLs in your CSP. A restrictive CSP needs `script-src 'self' 'wasm-unsafe-eval'`
and `connect-src 'self'`; the reusable component's current inline style also needs
an allowed style policy. HTTPS or localhost is required for WebGPU. Native assets
must be CORS-enabled when hosted on a different origin.

The JavaScript API is ESM; do not bundle the UMD CanvasKit loader as if it were an
ES-module default export. Keep it as a static asset. `/canvaskit.js` and
`/canvaskit.wasm` are explicit package exports for tools that resolve asset paths.
`GetAssetUrls(baseUrl)` returns the resolved loader/WASM URLs. Raw `<script
 type="module">` and CDN use can import `dist/package/browser.js` directly and
resolve the adjacent `dist/vendor/` assets without a bundler. The unbundled sample
in `examples/npm-browser/` demonstrates this layout; copy its files to your
application root, install the tarball there, copy the assets, and serve that root.

## Font registration and compatibility

Package entry points default to `fonts:false`, with **no hidden font downloads**.
Register fonts whose distribution rights you control:

```js
const S = await Initialize({ fonts: [{ family: 'My UI', url: '/fonts/my-ui.woff2' }] });
// In Node, data: await readFile('my-ui.ttf') and file: URL descriptors are supported.
```

Use a separate `isolated:true` namespace or explicit font-manager registration to
change font configuration after the cached default runtime has initialized.
`skiasharp-web/core` retains the legacy caller-supplied-engine and gallery-font
behavior. Existing gallery imports from `dist/lib/index.js` are unchanged.
Fonts themselves are not embedded into the package as a workaround for licensing.
The original custom rendering, document and native-platform compatibility limits
continue to apply. Packaging does not certify every SkiaSharp overload.

## TypeScript

Use named types from `skiasharp-web`, e.g. `InitializationOptions`, `Surface`,
`PaintSurfaceDetail`, and `SkiaCanvasElement`. NodeNext ESM/CommonJS and bundler
resolution are tested against the **installed tarball**, not repository aliases.
The initializer, surface, common drawing/value types and component events have
explicit declarations. The remaining namespace keys are generated from the actual
loaded runtime; advanced constructors and members intentionally remain permissive
(`any`). These declarations are not exhaustive .NET overload conformance. Native
classes are obtained from the awaited `S` namespace, not individual named JS exports.

## Inspect and reproduce

`npm pack` runs the deterministic metadata build. `npm run pack:release` additionally
checks the package allowlist, native hashes, size budgets and produces:

- `artifacts/skiasharp-web-<version>.tgz`
- `artifacts/package-manifest.json` with per-file hashes, tarball integrity and source commit
- `artifacts/sbom.cdx.json` and `artifacts/SHA256SUMS`

`npm run test:package` installs this tarball into a new external directory, performs
real native drawing/PNG/PDF checks, and tests the asset CLI. No repository symlink or
font fixture can hide a missing package file. `npm run test:types` uses that same
clean installation. The browser check serves both raw ESM and an esbuild 0.25.10
minified production bundle under a restrictive CSP and checks Canvas, WebGL,
Graphite and the custom element. Runtime binaries are verified against
`dist/vendor/native-build-manifest.json`, not rebuilt as an npm lifecycle side effect.
The SBOM inventories preserved npm manifests plus Skia's revision; full native
transitive build dependencies remain recorded in the native third-party notices.
