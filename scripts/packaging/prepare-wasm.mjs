/** Deterministic JS-only post-link fix for the qualified Emscripten 4 loader.
 * Its INCOMING_MODULE_JS_API omitted instantiateWasm. Preserve the native binary
 * and explicitly record original/generated loader hashes instead of pretending
 * the post-linked glue is the original compiler output. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function PrepareWasm(directory = root) {
  const manifestPath = resolve(directory, 'dist/vendor/native-build-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const [name, hash] of Object.entries(manifest.artifacts))
    if (digest(readFileSync(resolve(directory, 'dist/vendor', name))) !== hash)
      throw new Error(`Native artifact integrity failed before loader preparation: ${name}`);
  const before = 'var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);';
  const after = 'var result=Module["wasmModule"]!==undefined?{instance:await WebAssembly.instantiate(Module["wasmModule"],info)}:await instantiateAsync(wasmBinary,wasmBinaryFile,info);';
  const oldCatch = 'readyPromiseReject(e);return Promise.reject(e)';
  const newCatch = 'readyPromiseReject(e);readyPromise.catch(()=>{});throw e';
  const planned = [], originals = {};
  for (const name of ['canvaskit.js','canvaskit.cjs']) {
    const file = resolve(directory, 'dist/vendor', name), text = readFileSync(file,'utf8');
    if (text.includes(after) && text.includes(newCatch)) continue;
    if (text.split(before).length !== 2 || text.split(oldCatch).length !== 2)
      throw new Error(`Unsupported CanvasKit loader; review the post-link transform: ${name}`);
    originals[name] = manifest.artifacts[name];
    planned.push({name,file,text:text.replace(before,after).replace(oldCatch,newCatch)});
  }
  if (planned.length && planned.length !== 2) throw new Error('Partially prepared loader pair.');
  if (planned.length) {
    for (const item of planned) {
      writeFileSync(item.file,item.text);
      manifest.artifacts[item.name] = digest(Buffer.from(item.text));
    }
    manifest.loaderTransformation = {
      name:'precompiled-module-v1', javaScriptOnly:true,
      nativeWasmSha256:manifest.artifacts['canvaskit.wasm'],
      originalArtifacts:originals,
      generatedArtifacts:Object.fromEntries(planned.map(p=>[p.name,manifest.artifacts[p.name]])),
      script:'scripts/packaging/prepare-wasm.mjs'
    };
    writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  }
  if (!manifest.loaderTransformation) throw new Error('Missing loader transformation provenance.');
  return manifest.loaderTransformation;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(PrepareWasm()));
