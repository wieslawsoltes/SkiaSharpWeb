import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { root, readJson, npm } from '../../scripts/packaging/common.mjs';
import { VerifyRelease } from '../../scripts/verify-release.mjs';
// Separate output fixtures: do not race another test's pack/build output.
test('release validator rejects modified archives, metadata, commits and tags',()=>{
 execFileSync(process.execPath,[resolve(root,'scripts/pack-release.mjs')],{cwd:root});
 const temp=mkdtempSync(join(tmpdir(),'skia release '));
 try{
  const meta=readJson('artifacts/package-manifest.json'),args={tag:'v'+meta.version,sourceRevision:meta.sourceRevision};
  cpSync(resolve(root,'artifacts'),temp,{recursive:true});
  assert.equal(VerifyRelease(temp,args).sha256,meta.sha256);
  assert.throws(()=>VerifyRelease(temp,{...args,sourceRevision:'different'}),/source commit/);
  assert.throws(()=>VerifyRelease(temp,{...args,tag:'main'}),/tag/);
  const tgz=join(temp,meta.filename),original=readFileSync(tgz);writeFileSync(tgz,Buffer.concat([original,Buffer.from('x')]));
  assert.throws(()=>VerifyRelease(temp,args),/SHA-256/);writeFileSync(tgz,original);
  const m=join(temp,'package-manifest.json'),text=readFileSync(m,'utf8');
  writeFileSync(m,JSON.stringify({...meta,filename:'../escape.tgz'}));assert.throws(()=>VerifyRelease(temp,args),/identity/);writeFileSync(m,text);
  writeFileSync(join(temp,'SHA256SUMS'),'0'.repeat(64)+'  '+meta.filename+'\n');assert.throws(()=>VerifyRelease(temp,args),/Checksum/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});

test('npm version synchronizes package, lockfile and runtime module without creating a tag',()=>{
 const temp=mkdtempSync(join(tmpdir(),'skia version '));
 try {
  mkdirSync(join(temp,'dist/package'),{recursive:true});mkdirSync(join(temp,'scripts'),{recursive:true});
  const pkg={name:'@wieslawsoltes/skiasharpweb',version:'0.5.0',type:'module',scripts:{version:'node scripts/sync-version.mjs && git add dist/package/version.js'}};
  writeFileSync(join(temp,'package.json'),JSON.stringify(pkg));
  writeFileSync(join(temp,'package-lock.json'),JSON.stringify({name:pkg.name,version:pkg.version,lockfileVersion:3,packages:{'':{name:pkg.name,version:pkg.version}}}));
  writeFileSync(join(temp,'dist/package/version.js'),"export const Version = '0.5.0';\n");
  cpSync(resolve(root,'scripts/sync-version.mjs'),join(temp,'scripts/sync-version.mjs'));
  const git=args=>execFileSync('git',args,{cwd:temp,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git(['init','--initial-branch=main']);git(['config','user.name','Package Test']);git(['config','user.email','package-test@example.invalid']);git(['add','.']);git(['commit','-m','fixture']);
  npm(['version','patch','--no-git-tag-version'],{cwd:temp,stdio:'pipe'});
  assert.equal(JSON.parse(readFileSync(join(temp,'package.json'))).version,'0.5.1');
  const lock=JSON.parse(readFileSync(join(temp,'package-lock.json')));assert.equal(lock.version,'0.5.1');assert.equal(lock.packages[''].version,'0.5.1');
  assert.match(readFileSync(join(temp,'dist/package/version.js'),'utf8'),/Version = '0\.5\.1'/);
  assert.equal(git(['tag','--list']).trim(),'');
 } finally {rmSync(temp,{recursive:true,force:true});}
});
