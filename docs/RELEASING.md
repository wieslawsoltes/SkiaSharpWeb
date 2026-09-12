# Release procedure

`Package readiness` validates each PR on Node 22 and 24 across Linux, macOS and Windows. It also checks installed browser packages under CSP, the compiled native integration suite, and independent .NET contracts. After a version PR merges to main and these checks pass, the reusable release workflow publishes the tested package to GitHub Packages and creates a GitHub release. The npm workflow then publishes the same tarball to `@wieslawsoltes/skiasharpweb`.

## Prepare through a PR

```sh
npm ci
npm version patch --no-git-tag-version
npm run release:check
npm test
```

Update the changelog and `docs/release-notes.md`, and commit the package, lockfile and synchronized runtime version. Merge after all checks pass. No manual tag creation or publication-enable variable is required. Existing version tags and release assets are retained; a commit with an already released version does not republish it.

The build verifies the pinned WASM and loader hashes and assembles the existing qualified runtime. It does not compile C++ or alter native WASM bytes. The package preserves licensing notices, a CycloneDX SBOM and per-file manifests, and contains no fonts, gallery, tests, native build tools or install scripts. Font processing remains available for caller-supplied fonts. Size limits remain 12 MiB compressed and 24 MiB unpacked.

## Publication and verification

The reusable `npm-publish.yml` workflow uses the `npm` environment, Node 24, npm 11 and `NPM_TOKEN`. It also supports npm trusted publishing when configured for the correct repository/workflow/environment. Token values are used only in the publication step.

Before publication it verifies the tag and CI commit, downloads the GitHub release tarball, validates SHA-256 checksums, source file inventory and native hashes, then tests that exact archive in installed ESM, CommonJS and strict TypeScript consumers. The consumers execute native drawing, PNG and PDF generation and the asset-copy CLI.

An existing npm version is accepted only when its SHA-512 integrity matches the release. After publication the workflow waits for the public version, distribution tag, npm install index and provenance metadata; downloads and verifies the public tarball; repeats consumer checks; and performs a fresh anonymous install by package name followed by native rendering checks.

The release contains `.tgz`, `SHA256SUMS`, `SHA256SUMS.txt`, `package-manifest.json` and `sbom.cdx.json`. The two checksum files contain the same checksums. Keep these files together.

## Retry an interrupted publication

Rerun only the failed npm job after resolving authentication or registry propagation. The integrity check skips an already published identical version, so retries retain immutable package bytes. Alternatively dispatch `Publish npm registry` with the existing release tag, optional exact commit SHA and `latest` or `next` distribution tag.

A package or integrity failure blocks publication. Correct a published package with a new version; do not overwrite its release assets or tag. Rendering capability boundaries and physical-GPU qualification remain documented in [COMPATIBILITY.md](../COMPATIBILITY.md).

Official references: [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/), [npm provenance](https://docs.npmjs.com/generating-provenance-statements/), and [Node package exports](https://nodejs.org/api/packages.html#conditional-exports).
