#!/usr/bin/env python3
"""Restore only a hash-verified engine built from this checkout's native sources."""
import hashlib,json,pathlib,shutil,sys
root=pathlib.Path(__file__).resolve().parents[1]
folder=pathlib.Path(sys.argv[1]).resolve()
manifests=list(folder.rglob('native-build-manifest.json'))
if len(manifests)!=1:raise SystemExit('Expected exactly one native build manifest.')
manifest=manifests[0];metadata=json.loads(manifest.read_text())
if metadata['skiaRevision']!='f446aec4ce9e0e95e0a504e875955de3eb521f75' or metadata['emscriptenVersion']!='4.0.8':raise SystemExit('Unexpected native toolchain/source pin.')
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
for file in (root/'native').iterdir():
 if file.suffix in {'.cpp','.js','.py','.patch'}:
  expected=metadata['extensionSources'].get(file.name)
  if not expected or sha(file)!=expected:raise SystemExit('Build does not match current native source: '+file.name)
for name in ['canvaskit.js','canvaskit.cjs','canvaskit.wasm']:
 source=manifest.parent/name
 if sha(source)!=metadata['artifacts'][name]:raise SystemExit('Artifact hash mismatch: '+name)
 if name.endswith('.wasm') and source.read_bytes()[:8]!=b'\0asm\x01\0\0\0':raise SystemExit('Invalid WebAssembly module header.')
 shutil.copyfile(source,root/'dist/vendor'/name)
shutil.copyfile(manifest,root/'dist/vendor/native-build-manifest.json')
shutil.copyfile(manifest,root/'native/native-build-manifest.json')
print(json.dumps({'restored':metadata['artifacts'],'nativeSourcesVerified':True},indent=2))
