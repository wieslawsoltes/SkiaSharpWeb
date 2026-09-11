#!/usr/bin/env python3
"""Extend Emscripten 4.0.8 WebGPU enum bridge for features consumed by pinned Skia.
Adds matching C, C++ and JavaScript values; preserves every existing ABI value.
"""
from pathlib import Path
import sys,re
def write_if_changed(path,text):
 if path.read_text()!=text:path.write_text(text)
root=Path(sys.argv[1]); features=[('CoreFeaturesAndLimits','core-features-and-limits'),('TextureFormatsTier1','texture-formats-tier1'),('TextureFormatsTier2','texture-formats-tier2'),('Float32Blendable','float32-blendable'),('DualSourceBlending','dual-source-blending')];formats=[('R16Unorm','r16unorm'),('R16Snorm','r16snorm'),('RG16Unorm','rg16unorm'),('RG16Snorm','rg16snorm'),('RGBA16Unorm','rgba16unorm'),('RGBA16Snorm','rgba16snorm')]
for include in [root/'system/include/webgpu',root/'cache/sysroot/include/webgpu']:
 for filename in ['webgpu.h','webgpu_cpp.h']:
  p=include/filename;s=p.read_text()
  for kind,entries,start in [('FeatureName',features,12),('TextureFormat',formats,96)]:
   if filename=='webgpu.h':
    if 'WGPU'+kind+'_'+entries[0][0] not in s:s=s.replace('    WGPU'+kind+'_Force32', ''.join(f'    WGPU{kind}_{name} = 0x{i:08X},\n' for i,(name,_) in enumerate(entries,start))+'    WGPU'+kind+'_Force32')
   else:
    pattern=r'(enum class '+kind+r' : uint32_t \{)(.*?)(\n    \};)'
    def update(m):
     if entries[0][0] in m[2]:return m[0]
     return m[1]+m[2]+''.join(f'\n        {name} = 0x{i:08X},' for i,(name,_) in enumerate(entries,start))+m[3]
    s=re.sub(pattern,update,s,flags=re.S)
  write_if_changed(p,s)
p=root/'src/lib/libwebgpu.js';s=p.read_text()
for kind,entries in [('FeatureName',features),('TextureFormat',formats)]:
 pattern=r'('+kind+r': \[)(.*?)(\n    \],)'
 def update(m):
  if repr(entries[0][1]) in m[2]:return m[0]
  return m[1]+m[2]+''.join(f'\n      {name!r},' for _,name in entries)+m[3]
 s=re.sub(pattern,update,s,flags=re.S)
write_if_changed(p,s)
# The upstream generic Device importer omitted the default queue wrapper metadata.
p=root/'src/lib/libhtml5_webgpu.js';s=p.read_text();old="{{{ html5_gpu.makeImportExport('device', 'Device') }}}";new='''{{{ html5_gpu.makeImportExport('device', 'Device') }}}
LibraryHTML5WebGPU.emscripten_webgpu_import_device = (handle) => {
  const device = JsValStore.get(handle);
  return WebGPU.mgrDevice.create(device, {queueId: WebGPU.mgrQueue.create(device.queue)});
};'''
if 'const device = JsValStore.get(handle)' not in s:s=s.replace(old,new)
write_if_changed(p,s)
p=root/'src/lib/libwebgpu.js';s=p.read_text();old='''          if (o.refcount <= 0) {
            delete this.objects[id];''';new='''          if (o.refcount <= 0) {
            if (o.queueId) WebGPU.mgrQueue.release(o.queueId);
            delete this.objects[id];'''
if 'if (o.queueId) WebGPU.mgrQueue.release(o.queueId)' not in s:s=s.replace(old,new)
write_if_changed(p,s)
