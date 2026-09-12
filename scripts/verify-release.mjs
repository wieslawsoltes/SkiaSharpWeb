import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { hash, readJson, root, assertReleaseTag } from './packaging/common.mjs';
import { ReadTarball } from './packaging/tar.mjs';
export function VerifyRelease(directory, { tag, sourceRevision } = {}) {
  const pkg=readJson('package.json');assertReleaseTag(tag,pkg.version);
  const manifest=JSON.parse(readFileSync(resolve(directory,'package-manifest.json'),'utf8'));
  const filename=`${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`;
  if(manifest.name!==pkg.name||manifest.version!==pkg.version||manifest.filename!==filename||basename(manifest.filename)!==manifest.filename)throw new Error('Release package identity mismatch.');
  if(sourceRevision!==undefined&&manifest.sourceRevision!==sourceRevision)throw new Error('Release source commit mismatch.');
  const bytes=readFileSync(resolve(directory,filename));if(hash(bytes)!==manifest.sha256)throw new Error('Tarball SHA-256 mismatch.');
  const expected=new Map([filename,'package-manifest.json','sbom.cdx.json'].map(p=>[p,hash(readFileSync(resolve(directory,p)))]));
  const checks=readFileSync(resolve(directory,'SHA256SUMS'),'utf8').trim().split('\n');
  if(checks.length!==expected.size)throw new Error('Checksum list has unexpected entries.');
  for(const line of checks){const match=/^([0-9a-f]{64})  ([^/\\]+)$/.exec(line);if(!match||expected.get(match[2])!==match[1])throw new Error('Checksum list mismatch.');expected.delete(match[2]);}
  if(expected.size)throw new Error('Checksum list is incomplete.');
  const files=ReadTarball(bytes);
  if(files.size!==manifest.entryCount||files.size!==Object.keys(manifest.files).length)throw new Error('Package file inventory mismatch.');
  for(const[name,content]of files){
    if(hash(content)!==manifest.files[name])throw new Error(`Package file hash mismatch: ${name}`);
    // Bind the artifact to checked-out source, not just a self-asserted manifest.
    // Regenerate metadata with npm run build before calling this on a fresh checkout.
    if(hash(readFileSync(resolve(root,name)))!==hash(content))throw new Error(`Artifact differs from release source: ${name}`);
  }
  const packed=JSON.parse(files.get('package.json').toString());
  if(packed.name!==pkg.name||packed.version!==pkg.version||packed.repository.url!==pkg.repository.url||packed.private)throw new Error('Packed metadata does not match release source.');
  for(const hook of ['preinstall','install','postinstall','prepare'])if(packed.scripts?.[hook])throw new Error('Install-time script in release package.');
  const native=readJson('dist/vendor/native-build-manifest.json');
  for(const[name,digest]of Object.entries(native.artifacts))if(!files.has('dist/vendor/'+name)||hash(files.get('dist/vendor/'+name))!==digest)throw new Error('Release native runtime mismatch.');
  const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
  if(manifest.integrity!==integrity)throw new Error('npm integrity mismatch.');
  return {...manifest,distTag:assertReleaseTag(tag,pkg.version)};
}
import { createHash } from 'node:crypto';
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const tag=process.env.RELEASE_TAG??process.argv[2];
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const result=VerifyRelease(resolve(root,process.argv[3]??'artifacts'),{tag,sourceRevision:commit});
 console.log(JSON.stringify({name:result.name,version:result.version,filename:result.filename,sha256:result.sha256,distTag:result.distTag}));
}
