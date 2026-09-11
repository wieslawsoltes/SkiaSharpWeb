/** Publish current, evidence-reviewed 0.5 documentation; never downgrade versions. */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
const pkg=JSON.parse(read('package.json'));
if(!pkg.version.startsWith('0.5.'))throw Error('This publisher is only for the qualified 0.5 release.');
pkg.scripts.coverage='node scripts/coverage.mjs && node scripts/audit-v05.mjs';
pkg.scripts['verify:geometry']='python3 scripts/verify-geometry.py';
pkg.scripts['verify:qualification']='python3 scripts/verify-qualification.py';
pkg.scripts['benchmark:alpha']='node scripts/benchmark-alpha.mjs';
pkg.scripts['soak']='node --expose-gc scripts/soak-runtime.mjs';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
for(const script of ['scripts/coverage.mjs','scripts/audit-v05.mjs']){
 const run=spawnSync(process.execPath,[script],{stdio:'inherit'});if(run.status!==0)process.exit(run.status??1);
}
const audit=JSON.parse(read('docs/overload-conformance.json')),c=audit.statusCounts;
if(!audit.review05.runtimeMatches||c.implemented!==1982||c.partial!==1063||c['not-applicable']!==872||c.missing!==78)throw Error('Qualified source or audit changed; review the release evidence before publication.');
write('docs/CONFORMANCE_VERIFICATION.md',`# Conformance verification — 0.5\n\nAll 3,995 pinned declaration IDs are retained: **${c.implemented} implemented, ${c.partial} partial/unverified, ${c['not-applicable']} browser-inapplicable and ${c.missing} missing**. These are declaration counts, not feature percentages.\n\nThe 0.5 review upgrades 46 previously partial declarations using targeted native/.NET tests. One additional change corrects an inventory error: the public SKPathMeasure constructor has an IntPtr.Zero base initializer, not a pointer argument. It remains partial because the corpus does not exercise arbitrary resScale. Source and runtime SHA-256 checks prevent these reviews from silently certifying edited code.\n\nThe missing group contains 64 native Vulkan/Metal/Direct3D declarations and 14 CLR native-object/locking/COM declarations. Portable GPU descriptor value objects are distinct from importing a desktop device or process address. The earlier 144-to-78 reduction reflects newly available descriptor records, many still partial—not new browser driver interfaces.\n\nQualification run 34627270171 passed 374 integration tests and 193,931 comparisons against independently executed SkiaSharp 4.154. Corpus sizes and exact provenance are in [VERIFICATION-0.5.json](./VERIFICATION-0.5.json). The reviewed families are paint expansion/fast bounds, contour-preserving text paths, numeric BreakText, canonical glyph callbacks, path-measure queries and SVG flags. The legacy paint BreakText overload family and untested branches remain partial.\n\n[REVIEW-0.5.json](./REVIEW-0.5.json) records individual before/after changes; [OVERLOAD_CONFORMANCE.md](./OVERLOAD_CONFORMANCE.md) lists every declaration. Finite differential testing is not an exhaustive proof, and SwiftShader is not physical-GPU qualification.\n`);
const replace=(file,before,after)=>{let text=read(file);if(text.includes(before))write(file,text.replace(before,after));else if(!text.includes(after))throw Error('Documentation context changed: '+file);};
replace('docs/DOCUMENTS.md','Native Skia does not expose a per-operation rasterization log through this bridge; `RasterFallbacks` is therefore `null` and `RasterFallbackReporting` is `"UnavailableNative"`. This deliberately differs from a known empty fallback list.','The qualified 0.5 runtime instruments native SkPDF raster-decision sites. `RasterFallbacks` contains the recorded events, `RasterFallbackReporting` is "NativeDecisionSites", and `RasterDiagnostics` includes total/dropped counts and the bounded event list. This reports native decision sites rather than promising one event for every public draw call. Older injected engines without these bindings still report null/unavailable and cannot enable native strict-vector publication.');
replace('docs/API_USAGE.md','The default native PDF backend reports `RasterFallbacks = null` because Skia does not expose this telemetry.','The qualified native PDF backend exposes instrumented decision events through `RasterFallbacks` and bounded totals through `RasterDiagnostics`. A native event is not necessarily one public draw operation. An older injected engine reports null/unavailable.');
replace('docs/API_USAGE.md','| `SKFont.BreakText(...)` with output arguments | Read the returned result object\'s text/measurement fields |','| `SKFont.BreakText(...)` | Returns a primitive count; read measured width from the mutable output. `BreakTextDetails(...)` returns the convenience object. |');
replace('docs/API_USAGE.md','`BreakText(text,width)` returns its measurement object, while an explicit mutable output supports the count-return form.','`BreakText(text,width)` returns a primitive count in 0.5; `BreakTextDetails(text,width)` returns the measurement object. Optional mutable outputs expose width/text fields. Empty input preserves an existing width output slot, matching the pinned managed implementation.');
replace('docs/OVERLOAD_USAGE.md','`BreakText(text, width)` retains `{ Count, CodepointCount, MeasuredWidth, Text }`; numeric coercion returns `Count`. To use the C#-style count return, supply an output:','`BreakText(text, width)` returns a primitive count in 0.5. Use `BreakTextDetails(text, width)` for `{ Count, CodepointCount, MeasuredWidth, Text }`. Strings count UTF-16 code units and encoded buffers count bytes. An optional mutable output receives the width; empty input preserves an existing width slot. For example:');
let index=read('dist/index.html').replace('v0.4.0','v0.5.0');
if(!index.includes('href="./geometry.html"'))index=index.replace('<div class="top-actions">','<div class="top-actions"><a href="./geometry.html">Geometry lab ↗</a>');write('dist/index.html',index);
let qualification=read('dist/qualification.html');if(!qualification.includes('href="./geometry.html"'))qualification=qualification.replace('<nav>','<nav><a href="./geometry.html">Geometry Lab</a>');write('dist/qualification.html',qualification);
const sync=spawnSync(process.execPath,['scripts/sync-docs.mjs'],{stdio:'inherit'});if(sync.status!==0)process.exit(sync.status??1);
// Retire the legacy top-level copy too, so the deployed app cannot serve stale
// claims that native raster diagnostics are unavailable.
write('dist/VERIFICATION.md',read('docs/VERIFICATION.md'));
console.log(JSON.stringify({version:pkg.version,statusCounts:c,qualificationRun:34627270171}));
