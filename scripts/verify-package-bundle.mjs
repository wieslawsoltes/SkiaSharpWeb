import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, npm, readJson } from './packaging/common.mjs';
const {consumer}=readJson('test-output/package-verification.json');
// Use the installed package's conditional root export, with no repository aliases.
const source=readFileSync(resolve(root,'tests/packaging/browser.mjs'),'utf8').replace("'./node_modules/@wieslawsoltes/skiasharpweb/dist/package/browser.js'", "'@wieslawsoltes/skiasharpweb'");
writeFileSync(resolve(consumer,'bundle-entry.mjs'),source);
// Exact-version test tool fetched in a read-only CI job. Not a runtime dependency.
npm(['exec','--yes','--package=esbuild@0.25.10','--','esbuild','bundle-entry.mjs','--bundle','--format=esm','--platform=browser','--target=es2022','--minify','--outfile=bundled.js'],{cwd:consumer,stdio:'inherit'});
console.log('Production browser bundle built from the installed root export.');
