import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { root, readJson } from '../../scripts/packaging/common.mjs';
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
