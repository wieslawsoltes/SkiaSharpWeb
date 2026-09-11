/** Evidence-specific additions to the pinned declaration audit; no blanket upgrades. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=JSON.parse(fs.readFileSync(path.join(root,'docs/overload-conformance.json')));
const evidence='tests/optimization-round.test.mjs';
const reviewed=[];
for(const row of baseline.entries){
 let reason;
 if(row.type==='SkiaSharp.SKPaint' && ['GetFillPath','GetFastBounds','Style','BlendMode'].includes(row.name))
  reason='Native paint geometry overload, destination, alias, hairline and enum-form tests. Numeric, named and native paint enums have consistent native behavior.';
 if(row.type==='SkiaSharp.SKData' && (row.name==='CreateCopy' && !row.signature.includes('IntPtr') || row.name==='ToArray'))
  reason='Checked byte-span length, view offsets, independent copies and mutation boundaries are exercised. Browser byte-size bounds remain explicit.';
 if(reason && row.status==='partial')reviewed.push({id:row.id,signature:row.signature,previousStatus:row.status,status:'implemented',evidence,reason});
}
const counts={...baseline.statusCounts};for(const row of reviewed){counts[row.previousStatus]--;counts[row.status]++;}
const output={version:'0.5.0',upstreamCommit:baseline.commit,sourceBaseline:'49c7a4e294caaac6663f2c784342e8867a598281',recoveredPatchBaseline:'c81722688843c24354d728f93ad8a6307cccc598',declarations:baseline.declarations,baselineCounts:baseline.statusCounts,reviewedCounts:counts,reviewedDeclarations:reviewed.length,scope:'Finite tests of the documented portable JavaScript adaptations, not universal .NET equivalence or an exhaustive differential proof.',excluded:'Native pointer/COM APIs, unexercised overload branches and declarations without new behavior evidence retain their previous classifications.',entries:reviewed};
if(Object.values(counts).reduce((a,b)=>a+b,0)!==3995)throw Error('Declaration inventory changed.');
fs.writeFileSync(path.join(root,'docs/OPTIMIZATION-CONFORMANCE-0.5.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({reviewed:reviewed.length,counts},null,2));
