import { RegisterWebComponent } from './lib/index.js';
const $ = selector => document.querySelector(selector);
const view = $('#view');
let S, sprite, playing = false, frame = 0, disposed = false, time = 0;
const format = n => Number(n).toLocaleString();
const fail = error => { $('#error').textContent = error.message || String(error); $('#error').hidden = false; };
view.addEventListener('surfaceerror', event => fail(event.detail));
view.addEventListener('paintsurface', event => {
  if (!S || !sprite || disposed) return;
  try {
    $('#error').hidden = true;
    const start = performance.now(), { Canvas: canvas, Surface: surface, Info: info } = event.detail;
    canvas.Clear(S.SKColor.Parse('#0E1823'));
    const count = Number($('#count').value);
    for (let i = 0; i < count; i++) {
      const x = ((i * 37 + time * 26) % (info.Width + 24)) - 12;
      const y = ((i * 67 + Math.sin(time + i * .02) * 18 + info.Height) % info.Height) - 12;
      canvas.DrawBitmap(sprite, x, y);
    }
    $('#draw-time').textContent = (performance.now() - start).toFixed(2) + ' ms';
    const cache = S.SKGraphics.GetBitmapCacheStatistics(), stats = view.Statistics;
    $('#cache-rate').textContent = format(cache.Hits) + ' / ' + format(cache.Misses);
    $('#frames').textContent = format(stats.Frames + 1) + ' / ' + format(stats.Invalidations);
    $('#surfaces').textContent = format(stats.CreatedSurfaces) + ' / ' + format(cache.RetainedBytes) + ' B';
    $('#status').textContent = `${surface.Backend} · ${surface.RenderMode} · ${info.Width} × ${info.Height} · cache budget ${format(cache.MaxBytes)} bytes`;
  } catch (error) { fail(error); }
});
function stop() { playing = false; cancelAnimationFrame(frame); $('#animate').textContent = 'Animate'; }
function tick(now) { if (!playing || disposed) return; time = now / 1000; void view.InvalidateSurface(); frame = requestAnimationFrame(tick); }
$('#animate').onclick = () => { if (playing) stop(); else { playing = true; $('#animate').textContent = 'Pause'; frame = requestAnimationFrame(tick); } };
$('#renderer').onchange = event => view.setAttribute('backend', event.target.value);
$('#count').onchange = () => view.InvalidateSurface();
$('#cache').onchange = () => { if (!S) return; S.SKGraphics.SetBitmapCacheLimit($('#cache').checked ? 32 * 1024 * 1024 : 0); void view.InvalidateSurface(); };
$('#burst').onclick = async () => { stop(); await Promise.all(Array.from({ length: 100 }, () => view.InvalidateSurface())); };
$('#trace').onclick = () => {
  if (!S) return;
  if (!S.SKGraphics.GetCapabilities().NativeMemoryDump) { $('#memory').textContent = 'The loaded runtime does not contain the native memory-trace binding. Rebuild using native/build_native.py.'; return; }
  const trace = new S.SKMemoryTrace(true, true);
  try { S.SKGraphics.DumpMemoryStatistics(trace); $('#memory').textContent = trace.ToJson(); }
  catch (error) { fail(error); } finally { trace.Dispose(); }
};
$('#export').onclick = async () => {
  if (!view.Surface || disposed) return; let image, data;
  try { image = await view.Surface.SnapshotAsync(); if (disposed) return; data = image.Encode(S.SKEncodedImageFormat.Png, 100);
    const url = URL.createObjectURL(new Blob([data.ToArray()], { type: 'image/png' }));
    const link = document.createElement('a'); link.href = url; link.download = 'skiasharp-performance.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { fail(error); } finally { data?.Dispose(); image?.Dispose(); }
};
window.addEventListener('pagehide', event => {
  stop(); if (event.persisted) return; disposed = true; view.remove(); sprite?.Dispose(); sprite = null; S?.SKGraphics.PurgeBitmapCache();
});
try {
  S = await RegisterWebComponent({ fonts: false });
  if (!disposed) {
    sprite = new S.SKBitmap(24, 24);
    const canvas = new S.SKCanvas(sprite), paint = new S.SKPaint({ Color: S.SKColor.Parse('#5EDBB9'), IsAntialias: true });
    try { canvas.Clear(S.SKColors.Transparent); canvas.DrawCircle(12, 12, 11, paint); paint.Color = S.SKColor.Parse('#D1FFF1'); canvas.DrawCircle(9, 8, 3, paint); }
    finally { paint.Dispose(); canvas.Dispose(); }
    sprite.SetImmutable(); await view.InvalidateSurface();
    window.performanceLab = { S, view, get sprite() { return sprite; } };
  }
} catch (error) { fail(error); }
