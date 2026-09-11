#!/usr/bin/env python3
"""Exercise the font-free optimization lab and native GPU/document behavior."""
import argparse,functools,http.server,json,os,pathlib,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output',default='test-output/optimization-browser');p.add_argument('--executable',default=os.environ.get('CHROMIUM_EXECUTABLE'));p.add_argument('--require-physical-gpu',action='store_true');args=p.parse_args()
out=ROOT/args.output;out.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
report={'pageErrors':[],'physicalGPU':False,'passed':False}
try:
 with sync_playwright() as p:
  flags=['--no-sandbox','--enable-unsafe-webgpu']
  if not args.require_physical_gpu:flags+=['--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']
  browser=p.chromium.launch(headless=True,executable_path=args.executable,args=flags)
  page=browser.new_page(viewport={'width':1450,'height':1080},accept_downloads=True)
  page.on('pageerror',lambda error:report['pageErrors'].append(str(error)))
  try:
   page.goto(f'http://127.0.0.1:{server.server_port}/dist/optimization.html',wait_until='load')
   page.wait_for_function('window.optimizationLab?.view?.Surface',timeout=90000)
   assert page.locator('#error').is_hidden(),page.locator('#error').inner_text()
   report['version']=page.evaluate('window.optimizationLab.S.Version');report['browser']=browser.version
   page.screenshot(path=str(out/'geometry-lab-dark.png'),full_page=True)
   controls=[]
   for backend in ['canvas','webgl','webgpu']:
    page.select_option('#backend',backend)
    page.wait_for_function('b=>window.optimizationLab.view.Surface.Backend===b',arg=backend,timeout=60000)
    page.evaluate('window.optimizationLab.view.InvalidateSurface()')
    assert page.locator('#error').is_hidden(),page.locator('#error').inner_text()
    controls.append({'backend':backend,'mode':page.locator('#mode').inner_text()})
   report['controls']=controls
   page.locator('#width').evaluate('e=>{e.value=21;e.dispatchEvent(new Event("input",{bubbles:true}));}')
   page.select_option('#cap','Square');page.check('#controls');page.uncheck('#dash');page.click('#theme')
   page.evaluate('window.optimizationLab.view.InvalidateSurface()');page.screenshot(path=str(out/'geometry-lab-light.png'),full_page=True)
   report['component']=page.evaluate('''async()=>{const view=window.optimizationLab.view;await view.InvalidateSurface();const before=view.Statistics;await Promise.all(Array.from({length:1000},()=>view.InvalidateSurface()));const after=view.Statistics;return {before,after};}''')
   assert report['component']['after']['Frames']-report['component']['before']['Frames']==1
   report['benchmark']=page.evaluate('window.optimizationLab.benchmarks()')
   page.check('#blur')
   with page.expect_download() as info:page.click('#export')
   info.value.save_as(out/'native-geometry.pdf')
   report['documentMessage']=page.locator('#document-status').inner_text()
   report['strictRejected']=page.evaluate('''()=>{try{window.optimizationLab.exportPDF({blur:true,strict:true});return false;}catch(e){return /raster decision/.test(e.message);}}''')
   assert report['strictRejected']
   report['qualification']=page.evaluate('''async physical=>{const {RunQualification}=await import('./lib/qualification.js');return (await RunQualification(window.optimizationLab.S,{requirePhysical:physical,iterations:100})).report;}''',args.require_physical_gpu)
   assert report['qualification']['passed'],report['qualification']['errors']
   report['physicalGPU']=report['qualification']['physicalGPU']
   report['precision']=page.evaluate('''async()=>{const {RunPrecision}=await import('../tests/browser-precision.mjs');return RunPrecision(window.optimizationLab.S);}''')
   page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'geometry-lab-mobile.png'),full_page=True)
   assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'mobile horizontal overflow'
   assert not report['pageErrors'],report['pageErrors']
   report['passed']=True
  finally:browser.close()
except Exception as error:
 report['error']=str(error)
finally:
 server.shutdown();(out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
raise SystemExit(0 if report['passed'] else 1)
