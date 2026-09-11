# Release procedure

## One-time maintainer setup

Verify ownership/availability of the `skiasharp-web` name on npm. The repository is
not made public by these workflows. A public unscoped npm publication is a separate
maintainer decision even when source is in a private GitHub repository.

For registry publication, configure an npm trusted publisher for the exact GitHub
owner `wieslawsoltes`, repository `SkiaSharpWeb`, workflow `npm-publish.yml` and
environment `npm`. Set repository variable `NPM_PUBLISH_ENABLED` to `true` only when
ready. Protect the `npm` environment with maintainer approval and restrict it to
release tags. Before that opt-in, the registry job is intentionally skipped.
The first publication may require bootstrapping package ownership interactively.

OIDC is the default. Where bootstrap requires it, provide a narrowly scoped,
expiring granular token as the `NPM_TOKEN` environment secret. Never commit tokens.
The workflow uses Node 24/npm >=11.5.1 and `id-token:write`. Public repositories can
produce npm provenance; private repositories cannot, so provenance is explicitly
disabled for private-source publication. This does not prevent local builds,
private GitHub release assets or publication after authorized npm configuration.

Official references:
- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/generating-provenance-statements/
- https://nodejs.org/api/packages.html#conditional-exports

Protect `main` and release tags from force pushes. Make `Package readiness / ready`
a required PR check. The workflow tests pull-request content, not a checkout of main.
Tag creation, package access, npm account ownership, protected environments and
secrets are administrator settings; no workflow silently changes them.

## Prepare through a PR

```sh
npm ci
npm version patch --no-git-tag-version
# npm's version hook synchronizes dist/package/version.js; inspect CHANGELOG.md.
npm run release:check
npm test
```

Commit `package.json`, `package-lock.json`, the version module, changelog and source.
Do not edit the qualified native binary or its hashes to make a failed build pass.
`npm run build` verifies package/lock/runtime version agreement and native integrity.
CI covers clean tarball ESM/CJS installs on Linux/macOS/Windows with Node 22/24,
TypeScript, a real browser under CSP, the full native integration suite and fresh
.NET contract comparisons. Merge only after the checks pass. API completeness,
physical GPU qualification and account-level publication rights are separate claims.

## Build release artifacts, without publishing

```sh
npm run pack:release
sha256sum -c artifacts/SHA256SUMS
```

The exact tarball is installed and tested before publication. Build metadata and
archives are deterministic for the same checkout/tool versions, without timestamps
or absolute paths. Release size gates are 12 MiB compressed / 24 MiB unpacked.
No fonts, tests, gallery, secrets or native build tree are in the npm tarball.
`npm run build` does not require a C++ toolchain. A source checkout's pinned dev
compiler is installed with `npm ci`; consumers have no runtime npm dependencies.

## Tag and stage a GitHub release

After the version PR is merged:

```sh
git switch main
git pull --ff-only
git tag -a v0.5.0 -m 'SkiaSharp Web 0.5.0'
git push origin v0.5.0
```

Use the actual version; tags must exactly equal `v` plus package.json. The tag must
already exist and point to a commit reachable from main. The `Release package`
workflow reruns package, browser and native integration checks and uploads the npm
tarball, checksums, SBOM and manifest into a **draft** GitHub release. It refuses to
overwrite an existing release. Its manual dispatch accepts an existing tag and
`dry_run:true` (the default) to build and test without creating a release.

Review the draft and its checks. Publishing the draft triggers `Publish npm package`
only when the explicit repository opt-in is enabled. That workflow downloads the
already-tested assets; it does **not rebuild** a different tarball. It regenerates
deterministic metadata and compares every packed file with the checked-out tag. It verifies the
source commit, tag, package identity, every packaged-file hash, native binary hashes,
and checksum list before `npm publish --ignore-scripts`. Stable releases use `latest`;
prereleases use `next`. An existing registry version is accepted only when its
integrity equals the tested tarball. A different integrity aborts rather than
attempting replacement. Package install lifecycle hooks are absent.

## Failures, rollback and security

A build, type, content, version, native hash, browser or test failure blocks release.
Missing npm configuration does not become a fake successful publication. Rerun a
failed infrastructure job only after inspecting it; never weaken release gates or
rewrite a published tag/package. Ship a new patch version for a correction; use
npm dist-tags to move consumers deliberately. Keep the previous release available.
Do not unpublish a version to repair a build. Rotate exposed credentials immediately.

Keep release artifacts and checksum/manifest files together. They establish artifact
integrity and source identity, not full renderer or font/document input certification.
