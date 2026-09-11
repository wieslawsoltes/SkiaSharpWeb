# Contributing

Use a repository checkout with its pinned test assets and Node 22 or 24.

```sh
npm ci
npm run check
npm run release:check
npm test
```

`npm ci` installs only the locked development TypeScript compiler; consumers have
no runtime npm dependencies. `release:check` builds metadata, checks package policy,
installs the tarball into a clean external application, exercises real Skia and
validates the published declarations. Generated `dist/package` metadata and
`artifacts/` are ignored in git and regenerated before packing. Never check in npm
tokens or substitute system fonts for the pinned differential-test assets.

See [packaging](docs/PACKAGING.md) and [releasing](docs/RELEASING.md). Changes to
native bindings still require the pinned native build and its qualification flow;
ordinary package assembly does not rebuild WASM. Add tests for public API and
lifecycle changes. Preserve native/license notices and document compatibility limits.
