#!/usr/bin/env python3
"""Exercise the shipped qualification lab and preserve actual browser evidence."""
import functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1];out=root/'test-output/qualification';out.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface'])
  page=browser.new_page(viewport={'width':1440,'height':1100});page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(f'http://127.0.0.1:{server.server_port}/qualification.html')
   page.wait_for_function('!!window.qualificationLab',timeout=90000)
   page.uncheck('#hardware');page.fill('#iterations','100');page.click('#run')
   page.wait_for_function('window.qualificationLab.latest!==undefined',timeout=120000)
   report=page.evaluate('qualificationLab.latest.report');(out/'report.json').write_text(json.dumps(report,indent=2))
   assert report['passed'],report['errors'];assert not report['physicalGPU'],'Software run mislabeled physical'
   assert len(report['backends'])==3 and all(b['iterations']==100 for b in report['backends'])
   for name in ['vector','filtered']:
    with page.expect_download() as download:page.click('#'+name)
    download.value.save_as(out/(name+'.pdf'))
   with page.expect_download() as download:page.click('#report')
   download.value.save_as(out/'downloaded-report.json')
   page.set_input_files('#font',str(root/'dist/fonts/DejaVuSans.ttf'))
   page.wait_for_function('document.querySelector("#font-result").textContent.includes("canonicalNativeCallbacks")',timeout=30000)
   font=json.loads(page.locator('#font-result').inner_text());assert font['canonicalNativeCallbacks'];assert any(row['hasOutline'] for row in font['rows'])
   (out/'font-inspection.json').write_text(json.dumps(font,indent=2))
   page.screenshot(path=str(out/'qualification-lab.png'),full_page=True)
   negative=page.evaluate('async()=> (await qualificationLab.Run({requirePhysical:true,iterations:1})).report')
   assert not negative['passed'] and any('Physical GPU qualification' in error for error in negative['errors'])
   (out/'software-rejection.json').write_text(json.dumps(negative,indent=2))
   assert not errors,errors
  except Exception as e:
   (out/'failure.json').write_text(json.dumps({'error':str(e),'pageErrors':errors},indent=2));page.screenshot(path=str(out/'failure.png'),full_page=True);raise
  finally:browser.close()
finally:server.shutdown()
