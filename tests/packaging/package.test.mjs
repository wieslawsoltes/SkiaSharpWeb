import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { root, readJson, digest, assertReleaseTag, npm } from '../../scripts/packaging/common.mjs';
import { GetAssetUrls, NormalizeOptions } from '../../dist/package/assets.js';
import { CopyAssets } from '../../dist/package/copy-assets.mjs';
import { ReadTarball } from '../../scripts/packaging/tar.mjs';
import { Version } from '../../dist/package/version.js';
test('package identity, exports and lifecycle have safe publication defaults',()=>{
 const p=readJson('package.json');assert.equal(p.version,Version);assert.equal(readJson('package-lock.json').version,Version);
 assert.equal(p.publishConfig.registry,'https://registry.npmjs.org/');assert.equal(p.private,undefined);
 assert.equal(p.dependencies,undefined);for(const n of ['install','postinstall','preinstall','prepare'])assert.equal(p.scripts[n],undefined);
 for(const n of ['.','./browser','./node','./core','./canvaskit.wasm','./package.json'])assert(p.exports[n]);
 assert(!p.files.some(p=>p.includes('fonts')||p==='dist'));
});
test('font-free defaults are explicit; invalid options and pre-aborted calls reject',()=>{
 assert.equal(NormalizeOptions().fonts,false);assert.deepEqual(NormalizeOptions({fonts:[]}).fonts,[]);
 assert.throws(()=>NormalizeOptions({fonts:true}),TypeError);assert.throws(()=>NormalizeOptions(null),TypeError);
 const c=new AbortController();c.abort();assert.throws(()=>NormalizeOptions({signal:c.signal}),{name:'AbortError'});
});
test('asset URLs respect nested paths and reject executable URL schemes',()=>{
 const urls=GetAssetUrls('https://example.test/nested/assets');assert.equal(urls.wasmUrl,'https://example.test/nested/assets/canvaskit.wasm');
 assert(Object.isFrozen(urls));assert.equal(GetAssetUrls(new URL('https://example.test/a/')).wasmBaseUrl,'https://example.test/a/');
 assert.throws(()=>GetAssetUrls('javascript:alert(1)'),TypeError);assert.throws(()=>GetAssetUrls('data:text/plain,a'),TypeError);
});
test('release tags match the package exactly and prereleases select next',()=>{
 assert.equal(assertReleaseTag('v1.2.3','1.2.3'),'latest');assert.equal(assertReleaseTag('v1.2.3-beta.1','1.2.3-beta.1'),'next');
 for(const tag of ['main','v1.2.4','v1.2.3;echo hi','v01.2.3','v1.2.3\n'])assert.throws(()=>assertReleaseTag(tag,'1.2.3'));
});
test('native hashes and build inventory match files on disk',()=>{
 const p=readJson('dist/package/build-manifest.json');assert.equal(p.version,Version);assert.equal(p.fontsIncluded,false);
 for(const[path,sha]of Object.entries(p.files))assert.equal(digest(path),sha,path);
 assert(p.files['dist/package/THIRD_PARTY_NOTICES.txt']);assert(p.files['dist/package/runtime.d.ts']);
 assert(readJson('dist/package/sbom.cdx.json').components.some(c=>c.name==='Skia'));
});
test('build is reproducible and does not mutate the qualified WASM',()=>{
 const before=digest('dist/package/build-manifest.json'),wasm=digest('dist/vendor/canvaskit.wasm');
 execFileSync(process.execPath,[resolve(root,'scripts/build-package.mjs')],{cwd:root});
 assert.equal(digest('dist/package/build-manifest.json'),before);assert.equal(digest('dist/vendor/canvaskit.wasm'),wasm);
});
test('copy CLI emits the exact native assets and refuses accidental overwrites',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'skia assets '));
 try{await CopyAssets(dir);assert.equal(digest(join(dir,'canvaskit.wasm')),digest('dist/vendor/canvaskit.wasm'));
  await assert.rejects(CopyAssets(dir),/exists/);await CopyAssets(dir,{overwrite:true});
  const cli=execFileSync(process.execPath,[resolve(root,'dist/package/copy-assets.mjs'),'--help'],{encoding:'utf8'});assert.match(cli,/No fonts/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('copy refuses symlink targets and validates all files before copying',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'skia symlink '));
 try{writeFileSync(join(dir,'target'),'safe');
  // File symlink creation needs privileges on Windows; use a directory junction there.
  if(process.platform==='win32')symlinkSync(dir,join(dir,'THIRD_PARTY_NOTICES.txt'),'junction');else symlinkSync(join(dir,'target'),join(dir,'THIRD_PARTY_NOTICES.txt'));
  await assert.rejects(CopyAssets(dir,{overwrite:true}),/non-regular/);
  assert.equal(readFileSync(join(dir,'target'),'utf8'),'safe');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('npm tarball is reproducible, bounded and contains no demo, font or private files',()=>{
 execFileSync(process.execPath,[resolve(root,'scripts/pack-release.mjs')],{cwd:root});
 const meta=readJson('artifacts/package-manifest.json'),one=digest('artifacts/'+meta.filename);
 const [packed]=JSON.parse(npm(['pack','--ignore-scripts','--json','--pack-destination','artifacts']));
 assert.equal(digest('artifacts/'+packed.filename),one);
 const files=ReadTarball(readFileSync(resolve(root,'artifacts',meta.filename)));
 for(const path of files.keys())assert(!/(?:\.github|\.openai|node_modules|test-output|\/fonts\/|optimization\.html|\.ttf$|\.woff2?$)/.test(path),path);
 for(const p of ['dist/package/node.js','dist/package/node.cjs','dist/package/browser.js','dist/package/index.d.ts','dist/vendor/canvaskit.wasm','LICENSE','docs/PACKAGING.md'])assert(files.has(p),p);
 assert(meta.size<12*1024*1024);assert(meta.entryCount>50);
});
