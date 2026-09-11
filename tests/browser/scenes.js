async function verifyScenes({ backend, width = 480, height = 300 }) {
  const S = window.SkiaSharp;
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  const surface = await S.SKSurface.Create(element, { backend, allowFallback: false });
  const reference = S.SKSurface.Create(new S.SKImageInfo(width, height));
  const errors = [], results = [];
  const device = surface.GraphiteContext?.Device;
  const onError = event => errors.push(event.error.message);
  device?.addEventListener('uncapturederror', onError);
  const info = device?.adapterInfo;
  const options = { amount: 7, count: 200, time: .63, weight: 740, palette: 1, surface };
  const ink = p => { let n = 0; for (let i = 0; i < p.length; i += 4) if (Math.max(Math.abs(p[i] - 14), Math.abs(p[i + 1] - 24), Math.abs(p[i + 2] - 35)) > 24) n++; return n; };
  const draw = (target, scene) => {
    const c = target.Canvas; c.RestoreToCount(1); c.ResetMatrix(); c.Clear(S.SKColor.Parse('#0E1823'));
    const saved = c.Save();
    try { scene.draw(c, width, height, options); if (c.SaveCount !== saved + 1) throw new Error('Unbalanced scene save/restore'); }
    finally { c.RestoreToCount(saved); }
  };
  try {
    if (surface.Backend !== backend) throw new Error('Unexpected fallback to ' + surface.Backend);
    if (backend === 'webgpu' && surface.RenderMode !== 'skia-graphite-webgpu') throw new Error('WebGPU must use native Graphite, not raster uploads');
    for (const scene of window.graphicsLab.scenes) {
      console.log('verify ' + backend + ': ' + scene.id);
      let image, expectedImage;
      const start = performance.now();
      try {
        draw(surface, scene); await surface.FlushAsync(); image = await surface.SnapshotAsync();
        draw(reference, scene); reference.Flush(); expectedImage = reference.Snapshot();
        const actual = image.ReadPixels(), expected = expectedImage.ReadPixels();
        if (!actual || actual.length !== expected.length) throw new Error('Missing or incorrectly sized readback');
        let total = 0; for (let i = 0; i < actual.length; i++) total += Math.abs(actual[i] - expected[i]);
        const meanAbsoluteError = total / actual.length, actualInk = ink(actual), referenceInk = ink(expected);
        if (meanAbsoluteError >= 12) throw new Error('Raster difference exceeds tolerance: ' + meanAbsoluteError);
        if (actualInk < referenceInk * .8) throw new Error('Rendered scene lost visible content');
        const uploadBytes = surface._graphitePresenter?.statistics.lastUploadBytes ?? null;
        if (backend === 'webgpu' && uploadBytes !== 0) throw new Error('CPU-frame upload on native Graphite');
        results.push({ scene: scene.id, passed: true, meanAbsoluteError, actualInk, referenceInk, uploadBytes, elapsedMs: performance.now() - start });
      } catch (error) { results.push({ scene: scene.id, passed: false, error: error.stack }); }
      finally { image?.Dispose(); expectedImage?.Dispose(); }
    }
    // Validate actual browser presentation independently of snapshot readback.
    surface.Canvas.Clear(S.SKColors.White);
    const paint = new S.SKPaint({ Color: S.SKColors.Red, IsAntialias: false });
    try { surface.Canvas.DrawRect(0, 0, width / 2, height, paint); }
    finally { paint.Dispose(); }
    await surface.FlushAsync();
    const canvas = surface.Element || element;
    canvas.id = 'verification-canvas';
    canvas.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;z-index:2147483647;`;
    document.body.append(canvas);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__verificationSurface = surface;
    return { backend, mode: surface.RenderMode, results, errors, adapter: info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description, isFallbackAdapter: info.isFallbackAdapter } : null };
  } catch (error) {
    if (surface.DisposeAsync) await surface.DisposeAsync(); else surface.Dispose();
    throw error;
  } finally { reference.Dispose(); device?.removeEventListener('uncapturederror', onError); }
}
