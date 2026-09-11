import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json',root)));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)) throw new Error('Invalid package version');
writeFileSync(new URL('dist/package/version.js',root), `/** Kept in sync by npm version; validated before every package build. */\nexport const Version = '${version}';\n`);
