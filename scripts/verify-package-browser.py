#!/usr/bin/env python3
"""Validate the installed tarball, not source aliases, under an explicit browser CSP."""
import functools,http.server,json,pathlib,threading,shutil,os
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
state=json.loads((root/'test-output/package-verification.json').read_text())
consumer=pathlib.Path(state['consumer']);out=root/'test-output/package-browser';out.mkdir(parents=True,exist_ok=True)
shutil.copyfile(root/'tests/packaging/browser.mjs',consumer/'browser.mjs')
(consumer/'index.html').write_text('''<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:"><title>Installed SkiaSharp Web</title></head><body><h1>Installed-package rendering verification</h1><script type="module" src="./browser.mjs"></script></body></html>''')
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(consumer)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];requests=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),headless=True,args=['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface'])
  page=browser.new_page();page.on('pageerror',lambda error:errors.append(str(error)));page.on('request',lambda request:requests.append(request.url))
  try:
   base=f'http://127.0.0.1:{server.server_port}'
   page.goto(base+'/index.html');result=page.evaluate('async () => await window.packageResult')
   assert not errors,errors
   assert all(url.startswith(base+'/') for url in requests),requests
   assert not any(url.lower().endswith(('.ttf','.woff','.woff2','.otf')) for url in requests),requests
   assert any('/public/skia/canvaskit.wasm' in url for url in requests),requests
   result.update({'browserVersion':browser.version,'packageSha256':state['sha256'],'physicalGpuQualified':False,'requests':requests,'errors':errors})
   (out/'report.json').write_text(json.dumps(result,indent=2));page.screenshot(path=str(out/'package.png'))
   print(json.dumps(result))
  except Exception as error:
   (out/'failure.json').write_text(json.dumps({'error':str(error),'errors':errors,'requests':requests},indent=2));raise
  finally:browser.close()
finally:server.shutdown()
