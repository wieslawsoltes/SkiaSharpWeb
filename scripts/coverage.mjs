import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Initialize} from '../dist/lib/index.js';
const require=createRequire(import.meta.url);
const K=await require('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false});
const inventory=JSON.parse(fs.readFileSync(new URL('../docs/upstream-public-api.json',import.meta.url),'utf8'));
const entries=Object.entries(S).filter(([k])=>/^(?:SK|GR)[A-Z]/.test(k));
for(const namespace of ['Skottie','Resources','SceneGraph'])for(const [name,value]of Object.entries(S[namespace]??{}))entries.push([namespace+'.'+name,value]);
const types={};for(const [name,value]of entries){
 const getNames=obj=>Object.getOwnPropertyNames(obj).filter(k=>!['constructor','length','name','prototype','caller','arguments'].includes(k)&&!k.startsWith('_'));
 types[name]={kind:typeof value==='function'?'class':'enum-or-values',staticMembers:getNames(value),instanceMembers:typeof value==='function'?getNames(value.prototype||{}):[]};
}
const nativeBuild=JSON.parse(fs.readFileSync(new URL('../native/native-build-manifest.json',import.meta.url),'utf8'));
const report={title:'Exported JavaScript API inventory',libraryVersion:S.Version,canvasKitBuild:'custom combined Graphite/Ganesh/raster',skiaRevision:nativeBuild.skiaRevision,emscriptenVersion:nativeBuild.emscriptenVersion,upstreamCommit:'b33cf54f24edc5347567c95b1924c447669c1de8',notice:'Name presence is not overload or behavioral parity. This reports SK/GR names and Skottie/Resources/SceneGraph namespace entries; aliases may occur more than once. Inheritance and instance fields are not expanded. Consult COMPATIBILITY.md and docs/overload-conformance.json for declaration-level status.',exportedNames:Object.keys(types).length,types};
fs.writeFileSync(new URL('../dist/compatibility.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`Exported ${report.exportedNames} API entries. Upstream inventory and declaration status are included separately.`);
