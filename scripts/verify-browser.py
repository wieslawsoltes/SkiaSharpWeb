#!/usr/bin/env python3
"""Real Chromium rendering/presentation checks. No mocked GPU calls.
Install: python -m pip install playwright==1.57.0 Pillow==11.3.0
         python -m playwright install --with-deps chromium
Run: python scripts/verify-browser.py --output test-output/browser
Hardware qualification: add --require-physical-gpu on a GPU runner.
"""
import argparse, functools, http.server, json, os, pathlib, threading, time
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'test-output/browser')
parser.add_argument('--require-physical-gpu', action='store_true')
parser.add_argument('--headed', action='store_true')
parser.add_argument('--executable', default=os.environ.get('CHROMIUM_EXECUTABLE'))
args = parser.parse_args(); args.output.mkdir(parents=True, exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
handler = functools.partial(Handler, directory=str(ROOT / 'dist'))
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
report = {'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'physicalGPU': False, 'backends': [], 'errors': [], 'controls': []}
try:
    with sync_playwright() as p:
        flags = ['--no-sandbox', '--enable-unsafe-webgpu']
        if not args.require_physical_gpu:
            flags += ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-vulkan=swiftshader', '--enable-features=Vulkan', '--disable-vulkan-surface']
        browser = p.chromium.launch(executable_path=args.executable, headless=not args.headed, args=flags)
        report['browser'] = browser.version
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
        page.on('console', lambda message: print(message.type + ': ' + message.text, flush=True))
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/', wait_until='networkidle', timeout=90000)
        page.wait_for_function('!!window.graphicsLab', timeout=90000)
        assert page.locator('#error').is_hidden(), page.locator('#error').inner_text()
        report['version'] = page.evaluate('window.SkiaSharp.Version')
        report['sceneCount'] = page.evaluate('window.graphicsLab.scenes.length')
        assert report['sceneCount'] >= 44
        adapter = page.evaluate('''async()=>{const a=await navigator.gpu?.requestAdapter();if(!a)return null;const i=a.info;return {vendor:i.vendor,architecture:i.architecture,device:i.device,description:i.description,isFallbackAdapter:i.isFallbackAdapter};}''')
        report['adapter'] = adapter
        label = json.dumps(adapter).lower()
        report['physicalGPU'] = bool(adapter and not adapter.get('isFallbackAdapter', True) and not any(x in label for x in ('swiftshader', 'llvmpipe', 'software')))
        if args.require_physical_gpu: assert report['physicalGPU'], 'A physical non-fallback GPU is required'
        source = (ROOT / 'tests/browser/scenes.js').read_text()
        for backend in ['webgpu', 'webgl', 'canvas']:
            try:
                page.evaluate('() => { window.__verifyScenes = (' + source + '); }')
                page.evaluate("settings => { window.__browserResult=null; window.__browserError=null; void window.__verifyScenes(settings).then(r=>window.__browserResult=r).catch(e=>window.__browserError=e.stack); }", {'backend': backend})
                page.wait_for_function('window.__browserResult || window.__browserError', timeout=180000)
                failure = page.evaluate('window.__browserError')
                if failure: raise RuntimeError(failure)
                entry = page.evaluate('window.__browserResult')
                page.locator('#verification-canvas').screenshot(path=str(args.output / (backend + '.png')))
                image = Image.open(args.output / (backend + '.png')).convert('RGB')
                left = image.getpixel((40, 40)); right = image.getpixel((440, 40))
                entry['presentedPixels'] = {'left': left, 'right': right}
                entry['presentationPassed'] = left[0] > 240 and left[1] < 15 and left[2] < 15 and min(right) > 240
                assert entry['presentationPassed'], f'{backend} HTML presentation is incorrect: {left}, {right}'
                report['backends'].append(entry)
                report['errors'].extend(backend + ': ' + error for error in entry['errors'])
            except Exception as error:
                report['errors'].append(backend + ': ' + str(error))
            finally:
                page.evaluate('''()=>{const s=window.__verificationSurface;if(s){s.Dispose();s.Element?.remove();delete window.__verificationSurface;}}''')
        page.locator('#theme').click(); report['controls'].append('theme')
        page.locator('#search').fill('font'); assert page.locator('nav button').count() > 0
        page.locator('#search').fill(''); report['controls'].append('search')
        page.select_option('#backend', 'canvas')
        page.wait_for_function("window.graphicsLab.surface.Backend==='canvas' && document.querySelector('#loading').hidden")
        page.evaluate("window.graphicsLab.select('skottie')")
        page.locator('#timeline').evaluate("e => { e.value = '35'; e.dispatchEvent(new Event('input', {bubbles:true})); }")
        report['controls'].append('timeline')
        page.locator('#animate').click(); page.wait_for_timeout(100); page.locator('#animate').click()
        report['controls'].append('animation')
        assert page.locator('#error').is_hidden(), page.locator('#error').inner_text()
        page.screenshot(path=str(args.output / 'graphics-lab.png'), full_page=True)
        page.goto(f'http://127.0.0.1:{server.server_port}/performance.html', wait_until='networkidle', timeout=90000)
        page.wait_for_function('!!window.performanceLab', timeout=90000)
        report['component'] = page.evaluate('''async()=>{
          const {view,S}=window.performanceLab;await view.InvalidateSurface();
          const before=view.Statistics;
          await Promise.all(Array.from({length:100},()=>view.InvalidateSurface()));
          const after=view.Statistics;
          return {before,after,cache:S.SKGraphics.GetBitmapCacheStatistics(),mode:view.Surface.RenderMode};
        }''')
        assert report['component']['after']['Frames'] - report['component']['before']['Frames'] == 1
        assert report['component']['cache']['Hits'] > 0
        assert report['component']['cache']['RetainedBytes'] > 0
        assert page.locator('#error').is_hidden(), page.locator('#error').inner_text()
        page.screenshot(path=str(args.output / 'performance-lab.png'), full_page=True)
        browser.close()
except Exception as error:
    report['errors'].append(str(error))
finally:
    server.shutdown()
    report['passedScenes'] = sum(sum(r['passed'] for r in b['results']) for b in report['backends'])
    report['failedScenes'] = sum(sum(not r['passed'] for r in b['results']) for b in report['backends'])
    report['passed'] = not report['errors'] and not report['failedScenes'] and len(report['backends']) == 3
    (args.output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
raise SystemExit(0 if report['passed'] else 1)
