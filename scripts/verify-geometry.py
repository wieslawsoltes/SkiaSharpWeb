#!/usr/bin/env python3
"""Real browser interactions for native paint expansion and text-path overloads."""
import functools,http.server,json,os,pathlib,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1];out=root/'test-output/geometry';out.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),headless=True,args=['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface'])
  page=browser.new_page(viewport={'width':1400,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(f'http://127.0.0.1:{server.server_port}/geometry.html');page.wait_for_function('!!window.geometryLab',timeout=90000)
   results=[]
   for backend in ['canvas','webgl','webgpu']:
    page.select_option('#backend',backend);page.wait_for_function('(b)=>geometryLab.view.Surface.Backend===b',arg=backend,timeout=60000)
    page.fill('#text','AΩ🙂 · native');page.select_option('#align','1');page.locator('#bend').fill('110');page.locator('#bend').dispatch_event('input')
    page.evaluate('geometryLab.view.InvalidateSurface()');r=page.evaluate('geometryLab.latest');assert r['StrokeExpansion']['Native'] and r['TextOutline']['Verbs']>0;assert r['BreakText']['ReturnType']=='number'
    results.append({'backend':backend,'mode':page.evaluate('geometryLab.view.Surface.RenderMode'),'result':r})
   page.locator('#stroke').fill('0');page.locator('#stroke').dispatch_event('input');page.evaluate('geometryLab.view.InvalidateSurface()');assert page.evaluate('geometryLab.latest.StrokeExpansion.Hairline')
   page.locator('#stroke').fill('8');page.locator('#stroke').dispatch_event('input');page.evaluate('geometryLab.view.InvalidateSurface()')
   with page.expect_download() as download:page.click('#pdf')
   download.value.save_as(out/'geometry-contracts.pdf')
   page.screenshot(path=str(out/'geometry-lab.png'),full_page=True)
   assert not errors,errors
   (out/'browser.json').write_text(json.dumps({'passed':True,'physicalGPU':False,'browser':browser.version,'backends':results,'errors':errors},indent=2))
  finally:browser.close()
finally:server.shutdown()
