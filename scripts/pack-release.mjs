import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, readJson, npm, hash } from './packaging/common.mjs';
import { ReadTarball } from './packaging/tar.mjs';
execFileSync(process.execPath,[resolve(root,'scripts/build-package.mjs')],{cwd:root,stdio:'inherit'});
mkdirSync(resolve(root,'artifacts'),{recursive:true});
const pkg=readJson('package.json');
const [result]=JSON.parse(npm(['pack','--ignore-scripts','--json','--pack-destination','artifacts']));
if(result.name!==pkg.name||result.version!==pkg.version||result.filename!==`${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`)throw new Error('Unexpected npm pack identity.');
const bytes=readFileSync(resolve(root,'artifacts',result.filename)),entries=ReadTarball(bytes);
const runtime=readJson('dist/package/build-manifest.json');
for(const [file,sha]of Object.entries(runtime.files))if(!entries.has(file)||hash(entries.get(file))!==sha)throw new Error(`Packed runtime differs: ${file}`);
for(const path of entries.keys()) {
  if(!/^(?:dist\/(?:lib|vendor|package|licenses)\/|dist\/(?:README|COMPATIBILITY)\.md$|docs\/(?:PACKAGING|RELEASING)\.md$|(?:package\.json|README\.md|CHANGELOG\.md|COMPATIBILITY\.md|LICENSE)$)/.test(path))throw new Error(`Unapproved package entry: ${path}`);
  if(/\.(?:ttf|otf|woff2?|ttc|otc|eot|pfa|pfb|pem|key)$/i.test(path)||/(^|\/)(?:\.env|\.git|node_modules|test-output)(\/|$)/.test(path))throw new Error(`Disallowed package entry: ${path}`);
}
if(result.size>12*1024*1024||result.unpackedSize>24*1024*1024)throw new Error('Package exceeds its release size budget.');
let sourceRevision=null;try{sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
const metadata={schemaVersion:1,sourceRevision,name:pkg.name,version:pkg.version,filename:result.filename,sha256:hash(bytes),integrity:result.integrity,size:result.size,unpackedSize:result.unpackedSize,entryCount:entries.size,nativeRevision:runtime.nativeRevision,files:Object.fromEntries([...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([p,b])=>[p,hash(b)]))};
writeFileSync(resolve(root,'artifacts/package-manifest.json'),JSON.stringify(metadata,null,2)+'\n');
copyFileSync(resolve(root,'dist/package/sbom.cdx.json'),resolve(root,'artifacts/sbom.cdx.json'));
writeFileSync(resolve(root,'artifacts/SHA256SUMS'),[result.filename,'package-manifest.json','sbom.cdx.json'].map(p=>`${hash(readFileSync(resolve(root,'artifacts',p)))}  ${p}\n`).join(''));
console.log(JSON.stringify({package:result.filename,files:entries.size,bytes:result.size,sha256:metadata.sha256}));

copyFileSync(resolve(root,'artifacts/SHA256SUMS'),resolve(root,'artifacts/SHA256SUMS.txt'));
