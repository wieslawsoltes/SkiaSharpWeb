/** Apply reviewed 0.4 certificates without removing any pinned declaration. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Initialize} from '../dist/lib/index.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const executed=spawnSync(process.execPath,[path.join(root,'scripts/audit-conformance.mjs')],{cwd:root,stdio:'inherit',env:process.env});
if(executed.status!==0)process.exit(executed.status??1);
const out=process.env.SKIA_AUDIT_OUT??path.join(root,'docs');
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(path.join(root,'dist/vendor/canvaskit.wasm'))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
const report=JSON.parse(fs.readFileSync(path.join(out,'overload-conformance.json'),'utf8'));
const originalIds=report.entries.map(e=>e.id),changes=[];
for(const e of report.entries){
 if(e.status==='not-applicable')continue;
 let reason=null;
 if(e.name==='DumpMemoryStatistics'&&e.type==='SkiaSharp.SKGraphics'&&S.SKGraphics.GetCapabilities().NativeMemoryDump || e.name==='DumpMemoryStatistics'&&e.type==='SkiaSharp.GRContext'&&S.SKGraphics.GetCapabilities().GaneshMemoryDump)
  reason='Compiled native Skia memory-trace callbacks; numeric/string/backing ownership and ulong-to-BigInt behavior have unit tests. Chromium executes both graphics and Ganesh traces with nonempty native rows (browser lifecycle workflow).';
 if(e.type==='SkiaSharp.SKCanvas'&&['SetMatrix','ResetMatrix','LocalClipBounds','GetLocalClipBounds','IsClipRect'].includes(e.name)&&K.SkiaSharpNative?.Canvas?.SetMatrix)
  reason='Native SkCanvas setMatrix and clip accessors, not inverse-concat approximations. Singular reset, matrix44 row-vector adaptation, transformed clip bounds, circle/rectangle classification and saved-state restoration pass native-canvas-boundary tests.';
 if(e.type==='SkiaSharp.SKGraphiteContext'&&e.name==='RequestReadPixels')
  reason='Both callback signatures dispatch rescale gamma/mode and preserve native byte stride, color/alpha/color-space and ownership. Unit checks include failures and disposal; Chromium Graphite F16-to-F32 HDR pixels match a color-managed raster reference. JavaScript returns an awaitable Promise in addition to invoking the callback.';
 if(reason){changes.push({id:e.id,before:e.status,after:'implemented',reason});e.status='implemented';e.reason=reason;e.statusWithoutNameNormalization='implemented';}
}
if(report.declarations!==3995||new Set(originalIds).size!==3995)throw Error('Pinned declaration inventory changed');
report.statusCounts=Object.fromEntries(['implemented','partial','not-applicable','missing'].map(s=>[s,report.entries.filter(e=>e.status===s).length]));
report.review04={changes,evidence:['tests/runtime-performance.test.mjs','tests/native-canvas-boundaries.test.mjs','tests/gpu-readback.test.mjs','tests/browser-precision.mjs'],note:'Evidence-specific upgrades, not a claim of exhaustive .NET or physical GPU conformance.'};
report.generatedAt=new Date().toISOString();
fs.writeFileSync(path.join(out,'overload-conformance.json'),JSON.stringify(report,null,2)+'\n');
const old=fs.readFileSync(path.join(out,'OVERLOAD_CONFORMANCE.md'),'utf8');
let header=old.split('## Signature rows')[0];
for(const [status,count]of Object.entries(report.statusCounts))header=header.replace(new RegExp('\\| '+status+' \\| \\d+ \\|'),`| ${status} | ${count} |`);
header+='## Release 0.4 review\n\nNative memory tracing, singular matrix/clip accessors, and asynchronous HDR readback have additional concrete tests. Other partial branches remain partial; desktop interop is not relabeled as implemented.\n\n';
const lines=[header,'## Signature rows',''],esc=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
for(const type of new Set(report.entries.map(e=>e.type))){lines.push('### '+type,'','| Declaration | Status | JavaScript mapping / reason |','| --- | --- | --- |');for(const e of report.entries.filter(e=>e.type===type))lines.push(`| \`${esc(e.signature)}\` | ${e.status} | \`${esc(e.mapping)}\` — ${esc(e.reason)} |`);lines.push('');}
fs.writeFileSync(path.join(out,'OVERLOAD_CONFORMANCE.md'),lines.join('\n')+'\n');
const groups={};for(const e of report.entries.filter(e=>e.status==='missing')){const name=/(?:Vk|Mtl|D3D|SilkNet)/.test(e.type)?'Vulkan, Metal and Direct3D native platform interop':/(?:SKNativeObject|SKAutoCoInitialize|PlatformLock)/.test(e.type)?'CLR native-object, locking and COM integration':'Other missing declarations';const g=groups[name]??={count:0,types:{},entries:[]};g.count++;g.types[e.type]=(g.types[e.type]??0)+1;g.entries.push(e);}
fs.writeFileSync(path.join(out,'remaining-declarations.json'),JSON.stringify(groups,null,2)+'\n');
console.log(JSON.stringify({declarations:report.declarations,statusCounts:report.statusCounts,reviewed:changes.length,missing:Object.fromEntries(Object.entries(groups).map(([k,g])=>[k,g.count]))}));
