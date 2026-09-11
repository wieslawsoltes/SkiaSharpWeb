/** Add evidence-specific 0.5 reviews; preserve all 3,995 pinned declaration IDs. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Initialize} from '../dist/lib/index.js';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.SKIA_AUDIT_OUT??path.join(root,'docs');
const previous=spawnSync(process.execPath,[path.join(root,'scripts/audit-v04.mjs')],{cwd:root,stdio:'inherit',env:process.env});
if(previous.status!==0)process.exit(previous.status??1);
const digest=p=>createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const evidence=JSON.parse(fs.readFileSync(path.join(root,'docs/VERIFICATION-0.5.json'),'utf8'));
const report=JSON.parse(fs.readFileSync(path.join(out,'overload-conformance.json'),'utf8'));
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(path.join(root,'dist/vendor/canvaskit.wasm'))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
const runtimeMatches=evidence.runtimeSha256===digest('dist/vendor/canvaskit.wasm');
const verified=(...files)=>runtimeMatches&&evidence.contracts.passed&&evidence.integration.failed===0&&files.every(p=>evidence.testedSourceSha256[p]===digest(p));
const contracts=['tools/contract-reference/Program.cs','scripts/compare-contracts.mjs'];
const geometry=verified(...contracts,'dist/lib/core.js','dist/lib/paint-completion.js','tests/geometry-completion.test.mjs')&&S.SKPaint.HasNativePathExpansion;
const contours=verified(...contracts,'dist/lib/text-path-completion.js','tests/geometry-completion.test.mjs');
const measure=verified(...contracts,'dist/lib/path-measure-completion.js','tests/completion-contracts.test.mjs');
const counts=verified(...contracts,'dist/lib/text-measure-completion.js','tests/geometry-completion.test.mjs');
const callbacks=verified(...contracts,'dist/lib/font-path-callbacks.js')&&S.SKFont.HasCanonicalPathCallbacks;
const documents=verified('dist/lib/document-completion.js','tests/document-observability.test.mjs');
const ids=report.entries.map(e=>e.id),changes=[];
function review(e,status,reason,kind='tested implementation'){
 changes.push({id:e.id,before:e.status,after:status,kind,reason});e.status=status;e.reason=reason;e.statusWithoutNameNormalization=status;
}
for(const e of report.entries){
 // An initializer mentioning IntPtr.Zero is not a pointer parameter. Correct
 // this single reviewed inventory false-positive, without implying new code.
 if(e.type==='SkiaSharp.SKPathMeasure'&&e.kind==='constructor'&&e.signature.includes('(SKPath path, bool forceClosed')&&e.status==='not-applicable'){
  review(e,'partial','Portable path/forceClosed/resScale constructor exists; IntPtr.Zero occurs only in the upstream base initializer, not its parameters. Tested corpus covers default resScale; arbitrary resolution-scale behavior remains unverified.','inventory classification correction');continue;
 }
 if(e.status==='not-applicable')continue;
 let reason=null;
 if(geometry&&e.type==='SkiaSharp.SKPaint'&&e.name==='GetFillPath')reason='All eighteen return/path/builder overload shapes call native FillPathWithPaint with cull and resolution matrix. Independent .NET corpus: 162 cases, three destination forms each, including exact geometry and distinct hairline failure/transaction behavior.';
 if(geometry&&e.type==='SkiaSharp.SKPaint'&&e.name==='GetFastBounds')reason='Native paint fast bounds and mutable result; 15 independently executed .NET style/effect cases include unsupported bounds and empty-output behavior. No JavaScript geometric approximation.';
 if(callbacks&&e.type==='SkiaSharp.SKFont'&&e.name==='GetGlyphPaths')reason='Compiled canonical native glyph-path callbacks retain contour coordinates and the native callback matrix separately. Twelve independently executed .NET size/scale/skew sets compare path geometry and matrices; callback lifetime tests are retained.';
 if(contours&&e.type==='SkiaSharp.SKFont'&&e.name==='GetTextPathOnPath')reason='Pinned managed first-contour algorithm preserves quadratic/conic/cubic verbs and Float32 operations, not fixed-step polylines. Independent .NET corpus: 216 origin/alignment/curve/font cases, string and explicit glyph-position forms; unit tests additionally compare UTF8 and glyph IDs. Valid-buffer span adaptations are documented; malformed input is not universally certified.';
 if(counts&&e.type==='SkiaSharp.SKFont'&&e.name==='BreakText')reason='Primitive integer result with UTF16 string units or encoded buffer bytes, measured-width output, and direct glyph IDs. Independent .NET corpus: 216 cases across string and four encodings; includes NaN limits, non-BMP text, size/scale and preserved empty-input output slots. BreakTextDetails retains the former convenience object.';
 if(measure&&e.type==='SkiaSharp.SKPathMeasure'&&['Length','IsClosed','GetPositionAndTangent','GetPosition','GetTangent','GetMatrix','GetSegment','NextContour'].includes(e.name))reason='Native contour queries with corrected convenience/out dispatch. Independent .NET cases cover empty/multiple/forced-closed contours, finite/NaN/infinite distances, all four matrix flags, and path-replace versus builder-append segments. Unit tests also cover failed-query destinations and lifetime.';
 if(documents&&e.type==='SkiaSharp.SKSvgCanvas'&&e.name==='Create')reason='Native SVG stream writer implements both default and flags overloads; default preserves text nodes, ConvertTextToPaths outlines glyphs. Independent XML and native output tests validate text/path selection, offset bounds, rejected flags, stream failure and borrowed-canvas lifetime.';
 if(reason&&e.status!=='implemented')review(e,'implemented',reason);
 if(counts&&e.type==='SkiaSharp.SKPaint'&&e.name==='BreakText'&&e.status==='partial')e.reason='Delegates to numeric SKFont.BreakText using paint font and TextEncoding. Primitive counts and GlyphId byte input are tested. Unified mutable width/text result objects replace C# out parameters; the full legacy paint overload family has not been independently compared.';
}
if(report.declarations!==3995||new Set(ids).size!==3995||ids.some((id,i)=>report.entries[i].id!==id))throw Error('Pinned inventory changed.');
report.statusCounts=Object.fromEntries(['implemented','partial','not-applicable','missing'].map(s=>[s,report.entries.filter(e=>e.status===s).length]));
report.review05={qualificationRun:evidence.qualificationRun,runtimeMatches,changes,note:'Finite evidence review, not exhaustive overload or physical-GPU certification. Source/runtime hashes prevent these reviews from silently carrying over to changed implementations.'};
report.generatedAt=new Date().toISOString();
fs.writeFileSync(path.join(out,'overload-conformance.json'),JSON.stringify(report,null,2)+'\n');
let header=fs.readFileSync(path.join(out,'OVERLOAD_CONFORMANCE.md'),'utf8').split('## Signature rows')[0];
for(const[status,count]of Object.entries(report.statusCounts))header=header.replace(new RegExp('\\| '+status+' \\| \\d+ \\|'),`| ${status} | ${count} |`);
header+='## Release 0.5 review\n\nNative paint expansion, curved glyph contours, numeric text counts, canonical font callbacks, path-measure results and SVG flags have targeted evidence. One constructor initializer was incorrectly treated as a pointer parameter; its classification correction is recorded separately. Remaining partial and native-platform rows are retained.\n\n';
const lines=[header,'## Signature rows',''],escape=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
for(const type of new Set(report.entries.map(e=>e.type))){lines.push('### '+type,'','| Declaration | Status | JavaScript mapping / reason |','| --- | --- | --- |');for(const e of report.entries.filter(e=>e.type===type))lines.push(`| \`${escape(e.signature)}\` | ${e.status} | \`${escape(e.mapping)}\` — ${escape(e.reason)} |`);lines.push('');}
fs.writeFileSync(path.join(out,'OVERLOAD_CONFORMANCE.md'),lines.join('\n')+'\n');
fs.writeFileSync(path.join(out,'REVIEW-0.5.json'),JSON.stringify(report.review05,null,2)+'\n');
console.log(JSON.stringify({declarations:report.declarations,statusCounts:report.statusCounts,reviewed:changes.length,runtimeMatches}));
