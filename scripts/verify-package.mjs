import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { root, npm, readJson } from './packaging/common.mjs';
execFileSync(process.execPath,[resolve(root,'scripts/pack-release.mjs')],{cwd:root,stdio:'inherit'});
const meta=readJson('artifacts/package-manifest.json');
const consumer=mkdtempSync(join(tmpdir(),'skia consumer '));let passed=false;
try {
  writeFileSync(join(consumer,'package.json'),'{"name":"clean-package-consumer","version":"1.0.0","private":true,"type":"module"}');
  npm(['install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',resolve(root,'artifacts',meta.filename)],{cwd:consumer,stdio:'pipe'});
  copyFileSync(resolve(root,'tests/packaging/consumer.mjs'),join(consumer,'consumer.mjs'));
  execFileSync(process.execPath,[join(consumer,'consumer.mjs')],{cwd:consumer,stdio:'inherit'});
  execFileSync(process.execPath,[join(consumer,'node_modules/skiasharp-web/dist/package/copy-assets.mjs'),join(consumer,'public/skia')],{cwd:consumer,stdio:'inherit'});
  for(const ext of ['mts','cts'])copyFileSync(resolve(root,`tests/packaging/consumer.${ext}`),join(consumer,`consumer.${ext}`));
  mkdirSync(resolve(root,'test-output'),{recursive:true});
  writeFileSync(resolve(root,'test-output/package-verification.json'),JSON.stringify({passed:true,consumer,package:meta.filename,sha256:meta.sha256,fontsIncluded:false},null,2)+'\n');
  passed=true;
} finally {
  // Keep a successful install for type and browser tests in the same CI job.
  if(!passed)rmSync(consumer,{recursive:true,force:true});
}
