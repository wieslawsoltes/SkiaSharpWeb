# SkiaSharp Web 0.5.0

First public npm distribution: `@wieslawsoltes/skiasharpweb`.

- Includes the existing qualified native Skia WASM renderer, ESM/CommonJS/browser entries, TypeScript declarations, asset-copy CLI and third-party notices.
- Uses explicit font registration; the runtime package contains no font binaries or gallery assets.
- Automates GitHub release, GitHub Packages and npm publication after cross-platform package, browser, native and .NET checks.
- Verifies exact release bytes, source/native hashes, npm integrity, distribution tags, provenance metadata and a fresh anonymous install with real PNG/PDF rendering.

The package retains the documented SkiaSharp compatibility and physical GPU qualification boundaries. This release does not change native rendering behavior.
