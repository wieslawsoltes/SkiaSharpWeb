/** Refresh reviewed audit tables without replacing concurrent documentation edits. */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
const pkg=JSON.parse(read('package.json'));
pkg.version='0.4.0';
pkg.scripts.coverage='node scripts/coverage.mjs && node scripts/audit-v04.mjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
for(const script of ['scripts/coverage.mjs','scripts/audit-v04.mjs']){
 const r=spawnSync(process.execPath,[script],{stdio:'inherit'});
 if(r.status!==0)process.exit(r.status??1);
}
const audit=JSON.parse(read('docs/overload-conformance.json')),c=audit.statusCounts;
if(c.implemented!==1936||c.partial!==1042||c.missing!==144)throw Error('Audit changed; review release counts before publishing.');
const updateCounts=text=>text.replace(/1,932/g,'1,936').replace(/1,04[56]/g,'1,042').replace(/145 missing/g,'144 missing').replace(/343 (Node )?tests/g,(_,node)=>'345 '+(node??'')+'tests');
for(const path of ['README.md','COMPATIBILITY.md','docs/VERIFICATION.md']){
 let text=updateCounts(read(path));
 const target=path.startsWith('docs/')?'./RELEASE-0.4.md':'./docs/RELEASE-0.4.md';
 if(!text.includes('Additional 0.4 precision and audit evidence'))text+=`\n## Additional 0.4 precision and audit evidence\n\n[Release details](${target}) include HDR data ownership, cache budgets, native matrix/clip tests, the bitmap benchmark and evidence-specific conformance reviews. Existing verification and provenance above are retained.\n`;
 write(path,text);
}
write('docs/CONFORMANCE_VERIFICATION.md',`# Conformance verification — 0.4\n\nThe pinned inventory contains all 3,995 original declarations: **${c.implemented} implemented, ${c.partial} partial/unverified, ${c['not-applicable']} browser-inapplicable and ${c.missing} missing**. These are declaration counts, not feature percentages.\n\nThe 0.4 review adds concrete certificates for native memory callbacks, singular matrix/clip accessors and both asynchronous Graphite readback signatures. Eleven rows were reviewed; four additional rows change to implemented compared with the unextended audit rules. Other argument-space, pointer, hash and format differences stay explicit. Original IDs, signatures and lexical corrections are preserved.\n\nThe 144 missing rows are 130 desktop Vulkan/Metal/Direct3D declarations and 14 CLR native-object/locking/COM declarations. They are listed in remaining-declarations.json, not silently relabeled as completed web APIs.\n\nFresh .NET 3.119.0 and 4.154 preview executions each pass 39,224 seeded geometry comparisons; text/value/font references are checked separately. Chromium runs 44 scenes per rendering backend and additional HDR/cache/lifecycle checks. SwiftShader is a software GPU adapter; neither physical-GPU validation nor exhaustive .NET/OpenType/Lottie conformance is claimed.\n\nSee [the release evidence](./RELEASE-0.4.md) and [the complete audit](./OVERLOAD_CONFORMANCE.md). Run npm run coverage to regenerate this release's signature rows.\n`);
const r=spawnSync(process.execPath,['scripts/sync-docs.mjs'],{stdio:'inherit'});
if(r.status!==0)process.exit(r.status??1);
