#!/usr/bin/env python3
"""Apply the compiled SkiaSharp Web extension to the pinned Skia + Emscripten checkout."""
import argparse,pathlib,subprocess,shutil
p=argparse.ArgumentParser();p.add_argument('skia_checkout',type=pathlib.Path);p.add_argument('--emscripten',type=pathlib.Path,required=True);p.add_argument('--backend',choices=['combined'],default='combined');a=p.parse_args();source=pathlib.Path(__file__).resolve().parent;skia=a.skia_checkout.resolve()
expected='f446aec4ce9e0e95e0a504e875955de3eb521f75';actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=skia,text=True).strip()
if actual!=expected:raise SystemExit('Expected pinned Skia '+expected+'; found '+actual)
patch=source/'skia-webgpu.patch'
if subprocess.run(['git','apply','--reverse','--check',str(patch)],cwd=skia,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
 subprocess.run(['git','apply','--check',str(patch)],cwd=skia,check=True);subprocess.run(['git','apply',str(patch)],cwd=skia,check=True)
for file in source.glob('skiasharp_*'):
 if file.suffix in ['.cpp','.js']:
  target=skia/'modules/canvaskit'/file.name
  if not target.exists() or target.read_bytes()!=file.read_bytes():shutil.copyfile(file,target)
binding=skia/'modules/canvaskit/canvaskit_bindings.cpp'
for include in ['#include "skiasharp_memory.cpp"', '#include "skiasharp_completion.cpp"']:
 if include not in binding.read_text():binding.write_text(binding.read_text()+'\n'+include+'\n')
subprocess.run(['python3',str(source/'patch_emscripten_webgpu.py'),str(a.emscripten.resolve())],check=True)
subprocess.run(['python3',str(source/'patch_pdf_diagnostics.py'),str(skia)],check=True)
print('Prepared combined Graphite/Dawn, Ganesh/WebGL, raster, effects, fonts, documents and codec bindings.')
