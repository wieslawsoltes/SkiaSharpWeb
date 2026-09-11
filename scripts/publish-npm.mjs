/** Called only by the opt-in, protected-environment publishing job. */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { VerifyRelease } from './verify-release.mjs';
import { root, npm } from './packaging/common.mjs';
const version=npm(['--version']).trim().split('.').map(Number);
if(version[0]<11||(version[0]===11&&(version[1]<5||(version[1]===5&&version[2]<1))))throw new Error('Trusted publication requires npm >=11.5.1.');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const manifest=VerifyRelease(resolve(root,'artifacts'),{tag:process.env.RELEASE_TAG,sourceRevision:commit});
let existing;
try {existing=JSON.parse(npm(['view',`${manifest.name}@${manifest.version}`,'dist.integrity','--json','--registry=https://registry.npmjs.org/']));}
catch(error){let code;try{code=JSON.parse(String(error.stdout)).error?.code;}catch{}if(code!=='E404')throw error;}
if(existing){if(existing!==manifest.integrity)throw new Error('Registry version already exists with different integrity. Refusing replacement.');console.log('The exact verified package is already published; no changes made.');}
else {
 npm(['publish',resolve(root,'artifacts',manifest.filename),'--ignore-scripts','--access=public',`--tag=${manifest.distTag}`,'--registry=https://registry.npmjs.org/'],{stdio:'inherit'});
 console.log(`Published ${manifest.name}@${manifest.version} to ${manifest.distTag}.`);
}
