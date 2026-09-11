/** Assemble metadata only. Never rebuild/modify the qualified native binaries. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { root, readJson, walk, digest } from './packaging/common.mjs';
import { Version } from '../dist/package/version.js';
import { Initialize } from '../dist/package/node.js';
const pkg=readJson('package.json'),native=readJson('dist/vendor/native-build-manifest.json');
if(pkg.version!==Version||readJson('package-lock.json').version!==Version)throw new Error('Version drift; run npm version or node scripts/sync-version.mjs.');
if(pkg.private||pkg.name!=='skiasharp-web'||pkg.license!=='MIT')throw new Error('Unexpected package identity or private flag.');
for(const[name,sha]of Object.entries(native.artifacts))if(digest('dist/vendor/'+name)!==sha)throw new Error(`Native artifact integrity failed: ${name}`);
const S=await Initialize({fonts:false,isolated:true});
if(S.Version!==Version)throw new Error('Runtime/package version drift.');
for(const name of ['SkiaSharpGraphicsDumpMemoryStatistics','SkiaSharpPaintGetFillPath','SkiaSharpFontGetPaths'])if(typeof S.CanvasKit[name]!=='function')throw new Error(`Required native export missing: ${name}`);
const typed=new Set(['Version','CanvasKit','BackendCapabilities','SKSurface','SKPaint','SKImageInfo','SKColor','SKColors','SKRect','SKPoint','SKData']);
const declarations=Object.keys(S).filter(k=>!typed.has(k)&&!k.startsWith('_')).sort().map(k=>`  ${JSON.stringify(k)}: ${typeof S[k]==='function'&&S[k].prototype?'RuntimeClass':'any'};`);
writeFileSync(resolve(root,'dist/package/runtime.d.ts'),'// Generated from the actual initialized namespace; advanced members remain permissive.\nimport type { RuntimeClass } from "./index.js";\nexport interface RuntimeNamespace {\n'+declarations.join('\n')+'\n}\n');
// Preserve every available bundled notice, including the full native dependency texts.
const notices=['native/THIRD_PARTY_LICENSES.txt','dist/vendor/LICENSE-canvaskit',...walk('dist/licenses').filter(p=>!/\.(json|symbols|h)$/.test(p))];
writeFileSync(resolve(root,'dist/package/THIRD_PARTY_NOTICES.txt'),notices.map(p=>`\n===== ${p} =====\n\n${readFileSync(resolve(root,p),'utf8')}`).join('\n'));
const components=[{type:'library',name:'Skia',version:native.skiaRevision,externalReferences:[{type:'vcs',url:'https://skia.googlesource.com/skia'}]},
  ...walk('dist/licenses').filter(p=>p.endsWith('/package.json')).map(p=>{const m=readJson(p);return {type:'library',name:m.name,version:m.version,purl:`pkg:npm/${m.name.replace('@','%40')}@${m.version}`,...(typeof m.license==='string'?{licenses:[{license:{name:m.license}}]}:{})};})];
writeFileSync(resolve(root,'dist/package/sbom.cdx.json'),JSON.stringify({bomFormat:'CycloneDX',specVersion:'1.6',version:1,metadata:{component:{type:'library',name:pkg.name,version:pkg.version},properties:[{name:'scope',value:'Bundled runtime and preserved npm dependency manifests; not a complete native compiler dependency graph.'}]},components},null,2)+'\n');
const files=[...walk('dist/lib'),...walk('dist/vendor'),...walk('dist/package'),...walk('dist/licenses')].filter(p=>p!=='dist/package/build-manifest.json').sort();
for(const file of files)if(/\.(ttf|otf|woff2?|ttc|otc|eot|pfa|pfb)$/i.test(file))throw new Error(`Font binary unexpectedly enters package: ${file}`);
writeFileSync(resolve(root,'dist/package/build-manifest.json'),JSON.stringify({schemaVersion:1,name:pkg.name,version:Version,nativeRevision:native.skiaRevision,nativeArtifacts:native.artifacts,fontsIncluded:false,files:Object.fromEntries(files.map(p=>[p,digest(p)]))},null,2)+'\n');
console.log(`Built ${pkg.name}@${Version}: ${files.length} runtime/type/notice files, native hashes verified, no fonts.`);
