#!/usr/bin/env python3
"""Build the exact bundled native engine. Requires Python3, git, tar/xz and network."""
import argparse,concurrent.futures,hashlib,json,os,pathlib,shutil,subprocess,sys
SKIA='f446aec4ce9e0e95e0a504e875955de3eb521f75';EMSDK='5eb0bde7585670252e8ba05e9d361627bffd08b5';VERSION='4.0.8'
p=argparse.ArgumentParser();p.add_argument('--work-dir',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,default=pathlib.Path('native/out'));p.add_argument('--jobs',type=int,default=8);p.add_argument('--build-dir',default='out/skiasharp_web');a=p.parse_args();work=a.work_dir.resolve();out=a.output.resolve();source=pathlib.Path(__file__).resolve().parent;work.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
def run(args,cwd=None,**kwargs):return subprocess.run([str(x) for x in args],cwd=cwd,check=True,**kwargs)
def checkout(url,revision,folder):
 if not (folder/'.git').exists():folder.mkdir(parents=True,exist_ok=True);run(['git','init','-q',folder]);run(['git','remote','add','origin',url],folder)
 current=subprocess.run(['git','rev-parse','HEAD'],cwd=folder,text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL).stdout.strip()
 if current==revision:return
 if subprocess.check_output(['git','status','--porcelain'],cwd=folder,text=True).strip():raise RuntimeError('Refusing to replace modified checkout '+str(folder))
 run(['git','fetch','--depth=1','origin',revision],folder);run(['git','checkout','--detach',revision],folder)
skia=work/'skia';sdk=work/'emsdk'
checkout('https://github.com/google/skia.git',SKIA,skia);checkout('https://github.com/emscripten-core/emsdk.git',EMSDK,sdk)
env=os.environ.copy();env['TAR_OPTIONS']='--no-same-owner';run([sys.executable,sdk/'emsdk.py','install',VERSION],env=env);run([sys.executable,sdk/'emsdk.py','activate',VERSION],env=env)
# Only dependencies used by this combined browser build; native Dawn/Chromium are unnecessary.
namespace={'Var':lambda _:''};exec(compile((skia/'DEPS').read_text(),str(skia/'DEPS'),'exec'),namespace)
names={'buildtools','brotli','delaunator-cpp','expat','freetype','harfbuzz','highway','icu','libjpeg-turbo','libpng','libwebp','wuffs','zlib'}
jobs=[]
for path,url in namespace['deps'].items():
 if path.split('/')[-1] in names:
  remote,revision=url.rsplit('@',1);jobs.append((remote,revision,skia/path))
with concurrent.futures.ThreadPoolExecutor(max_workers=min(a.jobs,6)) as pool:
 for future in [pool.submit(checkout,*job) for job in jobs]:future.result()
if not (skia/'bin/gn').exists():run([sys.executable,skia/'bin/fetch-gn'],skia)
if not (skia/'third_party/ninja/ninja').exists():run([sys.executable,skia/'bin/fetch-ninja'],skia)
run([sys.executable,source/'prepare_native.py',skia,'--emscripten',sdk/'upstream/emscripten'])
env.update({'SKIA_EMSDK_DIR':str(sdk),'NATIVE_BUILD_JOBS':str(a.jobs),'BUILD_DIR':a.build_dir})
run(['bash',skia/'modules/canvaskit/compile.sh','webgpu'],skia,env=env)
built=skia/a.build_dir
for name in ['canvaskit.js','canvaskit.wasm']:shutil.copyfile(built/name,out/name)
shutil.copyfile(out/'canvaskit.js',out/'canvaskit.cjs')
manifest={'skiaRevision':SKIA,'emsdkRevision':EMSDK,'emscriptenVersion':VERSION,'backends':['Graphite/Dawn/WebGPU','Ganesh/WebGL','Skia raster'],'artifacts':{name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in ['canvaskit.js','canvaskit.cjs','canvaskit.wasm']},'extensionSources':{file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(source.iterdir()) if file.is_file()}}
(out/'native-build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Built engine:',out)
