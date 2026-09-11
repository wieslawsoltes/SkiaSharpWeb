#!/usr/bin/env python3
"""Run live Chromium rendering/UI tests. Software and physical evidence are separate."""
import argparse,asyncio,functools,http.server,json,pathlib,threading
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--physical',action='store_true');p.add_argument('--output',default='test-output/browser');args=p.parse_args()
out=ROOT/args.output;out.mkdir(parents=True,exist_ok=True)
class QuietHandler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
async def main():
 async with async_playwright() as p:
  flags=[] if args.physical else ['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']
  browser=await p.chromium.launch(headless=True,args=flags)
  context=await browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
  page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   await page.goto(base+'/tests/browser.html',wait_until='load')
   report=await page.evaluate('async physical => (await import("./browser-runtime.mjs")).Run({software:!physical,requirePhysical:physical})',args.physical)
   report['browserVersion']=browser.version
   (out/'rendering.json').write_text(json.dumps(report,indent=2))
   await page.goto(base+'/dist/index.html',wait_until='load')
   await page.wait_for_function('Boolean(window.graphicsLab?.surface)',timeout=120000)
   await page.screenshot(path=str(out/'graphics-lab.png'),full_page=True)
   ui=[]
   for backend,label in [('canvas','Canvas'),('webgl','WebGL'),('webgpu','WebGPU')]:
    await page.select_option('#backend',backend)
    await page.wait_for_function('(b)=>window.graphicsLab.surface.Backend===b && document.querySelector("#loading").hidden',arg=backend,timeout=60000)
    assert not await page.locator('#error').is_visible(), await page.locator('#error').inner_text()
    ui.append({'backend':backend,'mode':await page.locator('#mode').inner_text()})
   await page.evaluate('window.graphicsLab.select("typography")')
   await page.fill('#text','Browser Ω مرحبا')
   await page.click('#theme');await page.click('#animate');await page.wait_for_timeout(150);await page.click('#animate')
   await page.select_option('#export-format','png')
   async with page.expect_download(timeout=30000) as download_info:await page.click('#export')
   download=await download_info.value;await download.save_as(str(out/'browser-export.png'))
   await page.fill('#search','font');assert await page.locator('#navigation button').count()>0
   assert not errors, errors
   (out/'ui.json').write_text(json.dumps({'controls':ui,'download':download.suggested_filename,'pageErrors':errors},indent=2))
  except Exception as e:
   (out/'failure.json').write_text(json.dumps({'error':str(e),'pageErrors':errors},indent=2))
   await page.screenshot(path=str(out/'failure.png'),full_page=True)
   raise
  finally:await browser.close()
try:asyncio.run(main())
finally:server.shutdown()
