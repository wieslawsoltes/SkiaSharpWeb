const ensure = (condition, message) => { if (!condition) throw new Error(message); };
export async function RunPrecision(S) {
  const K = S.CanvasKit, element = document.createElement('canvas'); element.width = 16; element.height = 16;
  const host = await S.SKSurface.Create(element, { backend: 'webgpu', allowFallback: false });
  const context = host.GraphiteContext, device = context.Device;
  const errors = [], onError = e => errors.push(e.error.message); device.addEventListener('uncapturederror', onError);
  const report = { checks: [], nativeMemoryDump: S.SKGraphics.GetCapabilities().NativeMemoryDump, errors };
  let recorder, texture, backend, surface, space, raw, pool;
  try {
    recorder = context.CreateRecorder(); texture = device.createTexture({ size: [4, 4], format: 'rgba16float', usage: 23 });
    backend = S.SKGraphiteBackendTexture.CreateDawn(texture); space = S.SKColorSpace.CreateSrgbLinear();
    surface = S.SKSurface.CreateGraphite(recorder, backend, K.ColorType.RGBA_F16, space);
    ensure(surface, 'Native F16 Graphite surface creation failed');
    surface.Canvas.Clear(new S.SKColorF(2, .125, .5, 1)); surface.Flush();
    const options = new S.SKGraphiteSubmitInfo({ Sync: true }); await context.SubmitAsync(options);
    ensure(options.Sync, 'SubmitAsync mutated its options'); report.checks.push('asynchronous Sync=true submission');
    let callbacks = 0;
    const result = await context.RequestReadPixels(surface, new S.SKImageInfo(4, 4, K.ColorType.RGBA_F32, K.AlphaType.Premul, space), new S.SKRectI(0, 0, 4, 4), 'Src', 'Nearest', () => callbacks++);
    ensure(result, 'Native F16-to-F32 Graphite readback failed');
    try { const f = result.GetPixelSpan(Float32Array); report.nativeF16Pixel = [...f.slice(0, 4)];
      ensure(Math.abs(f[0] - 2) < .002 && Math.abs(f[1] - .125) < .002 && Math.abs(f[2] - .5) < .002 && f[3] === 1, 'HDR color was quantized during native readback');
      ensure(callbacks === 1 && result.RowBytes === 64, 'Readback callback/stride contract');
    } finally { result.Dispose(); }
    report.checks.push('native F16 Graphite rendering and F32 HDR readback');
    raw = device.createTexture({ size: [2, 2], format: 'rgba32float', usage: 3 });
    const source = new Float32Array([2.5, -.25, .1234567, 1, 3, 4, 5, .5, 6, 7, 8, 1, 9, 10, 11, .75]);
    device.queue.writeTexture({ texture: raw }, source, { bytesPerRow: 32 }, [2, 2]);
    pool = new S.SKGPUReadbackPool(device, { MaxBytes: 512, Capacity: 1 });
    for (let i = 0; i < 8; i++) { const r = await S.ReadWebGPUTexture(device, raw, { pool });
      try { const out = r.GetPixelSpan(Float32Array); ensure(out.every((v, n) => Object.is(v, source[n])), 'F32 raw bits changed'); } finally { r.Dispose(); }
    }
    report.pool = pool.GetStatistics(); ensure(report.pool.Allocations === 1 && report.pool.Reuses === 7, 'Staging buffer was not reused');
    report.checks.push('exact F32 texture copies and staging-buffer reuse');
    const cache = new S.SKGraphiteImageCache({ Capacity: 2, MaxBytes: 32 }), image = S.SKImage.FromPixels(new S.SKImageInfo(2, 2), new Uint8Array(16).fill(255));
    try {
      for (let i = 0; i < 10; i++) { const alias = S.SKImage._fromNative(image._native.clone()); try { const upload = cache.FindOrCreate(recorder, alias); upload.Dispose(); } finally { alias.Dispose(); } }
      report.cache = cache.GetStatistics(); ensure(report.cache.Uploads === 1 && report.cache.Hits === 9, 'Native image aliases were uploaded more than once');
      if (report.cache.NativeIdentity) ensure(report.cache.AliasComparisons === 0, 'Native image IDs did not avoid scanning');
    } finally { cache.Dispose(); image.Dispose(); }
    report.checks.push('native texture cache aliases and byte budgets');
    if (report.nativeMemoryDump) { const trace = new S.SKMemoryTrace(); try { S.SKGraphics.DumpMemoryStatistics(trace); report.memoryRows = trace.Entries.length; ensure(report.memoryRows > 0, 'Native memory trace was empty'); } finally { trace.Dispose(); } }
    ensure(errors.length === 0, errors.join('\n')); return report;
  } finally {
    pool?.Dispose(); raw?.destroy();
    await context.SubmitAsync(); surface?.Dispose(); backend?.Dispose(); recorder?.Dispose(); texture?.destroy(); space?.Dispose();
    device.removeEventListener('uncapturederror', onError); await host.DisposeAsync();
  }
}
