import { RegisterWebComponent } from './engine/package/browser.js';
// The preserved engine directory keeps every native module and WASM URL local and correctly relative.
const native = await RegisterWebComponent({ fonts: false });
const arities = { clear: 0, rect: 4, circle: 3, line: 4, oval: 4, roundRect: 6, save: 0, restore: 0, translate: 2, scale: 2, rotate: 1, clipRect: 4 };
function validate(commands) {
  if (!Array.isArray(commands)) throw new TypeError('DrawCommands must be an array.');
  let saves = 0;
  for (const command of commands) {
    if (!Object.hasOwn(arities, command.op)) throw new TypeError(`Unknown drawing operation: ${command.op}`);
    const values = command.values ?? [];
    if (values.length !== arities[command.op] || !values.every(Number.isFinite)) throw new TypeError(`Invalid numeric arguments for ${command.op}.`);
    if (command.op === 'save') saves++;
    if (command.op === 'restore' && --saves < 0) throw new Error('A drawing batch cannot restore outside its own save scope.');
    if (command.color != null) native.SKColor.Parse(command.color);
    if (command.strokeWidth != null && (!Number.isFinite(command.strokeWidth) || command.strokeWidth < 0)) throw new RangeError('Stroke width must be finite and nonnegative.');
  }
  if (saves !== 0) throw new Error('Drawing batch save/restore operations must balance.');
  return commands;
}
function draw(canvas, commands) {
  const saved = canvas.Save();
  try {
    for (const command of commands) {
      const values = command.values ?? [];
      switch (command.op) {
        case 'clear': canvas.Clear(native.SKColor.Parse(command.color ?? '#00000000')); continue;
        case 'save': canvas.Save(); continue;
        case 'restore': canvas.Restore(); continue;
        case 'translate': canvas.Translate(...values); continue;
        case 'scale': canvas.Scale(...values); continue;
        case 'rotate': canvas.RotateDegrees(values[0]); continue;
        case 'clipRect': canvas.ClipRect(native.SKRect.Create(...values)); continue;
      }
      const paint = new native.SKPaint();
      try {
        paint.Color = native.SKColor.Parse(command.color ?? '#000000');
        paint.IsAntialias = command.antialias !== false;
        paint.StrokeWidth = command.strokeWidth ?? 1;
        paint.Style = command.stroke ? native.SKPaintStyle.Stroke : native.SKPaintStyle.Fill;
        switch (command.op) {
          case 'rect': canvas.DrawRect(...values, paint); break;
          case 'circle': canvas.DrawCircle(...values, paint); break;
          case 'line': canvas.DrawLine(...values, paint); break;
          case 'oval': canvas.DrawOval(native.SKRect.Create(...values), paint); break;
          case 'roundRect': canvas.DrawRoundRect(native.SKRect.Create(...values.slice(0, 4)), values[4], values[5], paint); break;
        }
      } finally { paint.Dispose(); }
    }
  } finally { canvas.RestoreToCount(saved); }
}
export class SkiaCanvasController extends EventTarget {
  constructor(element) {
    super(); this.Element = element; this.commands = []; this.render = null; this.disposed = false; this.paintError = null;
    this.paint = event => {
      if (this.disposed) return;
      this.paintError = null;
      try {
        const { Canvas, Info } = event.detail;
        draw(Canvas, this.commands);
        if (this.render) {
          const result = this.render(native, Canvas, Info);
          if (result?.then) { result.catch(error => this.report(error)); throw new TypeError('The native render callback must be synchronous. Use a browser module function.'); }
        }
        this.dispatchEvent(new CustomEvent('paint', { detail: { width: Info.Width, height: Info.Height, backend: this.Surface?.Backend } }));
      } catch (error) { this.paintError = error; this.report(error); }
    };
    this.error = event => { this.paintError = event.detail; this.report(event.detail); };
    this.lost = event => this.dispatchEvent(new CustomEvent('devicelost', { detail: { reason: event.detail?.reason ?? 'unknown', message: event.detail?.message ?? '' } }));
    element.addEventListener('paintsurface', this.paint); element.addEventListener('surfaceerror', this.error); element.addEventListener('devicelost', this.lost);
  }
  report(error) { this.dispatchEvent(new CustomEvent('surfaceerror', { detail: { name: error?.name ?? 'Error', message: error?.message ?? String(error) } })); }
  check() { if (this.disposed) throw new Error('The Skia canvas has been disposed.'); }
  get Surface() { this.check(); return this.Element.Surface; }
  get Canvas() { return this.Surface?.Canvas ?? null; }
  GetInfo() { const surface = this.Surface; return { width: surface?.Width ?? 0, height: surface?.Height ?? 0, backend: surface?.Backend ?? '', statistics: this.Element.Statistics }; }
  Configure(options) {
    this.check(); const commands = validate(options.drawCommands ?? this.commands);
    const render = Object.hasOwn(options, 'render') ? options.render : this.render;
    if (render != null && typeof render !== 'function') throw new TypeError('Render must be a browser callback descriptor.');
    for (const name of ['width', 'height']) {
      const value = options[name];
      if (value != null && (!Number.isSafeInteger(value) || value < 1)) throw new RangeError(`${name} must be a positive integer.`);
    }
    const backend = options.backend ?? 'auto';
    if (!['auto', 'canvas', 'webgl', 'webgpu'].includes(backend)) throw new RangeError(`Unknown backend: ${backend}`);
    this.commands = commands; this.render = render;
    for (const name of ['width', 'height']) { if (options[name] == null) this.Element.removeAttribute(name); else this.Element.setAttribute(name, String(options[name])); }
    this.Element.setAttribute('backend', backend);
  }
  async Invalidate() {
    this.check(); const painted = await this.Element.InvalidateSurface();
    if (this.paintError) throw this.paintError;
    if (!painted && !this.disposed) throw new Error('The Skia surface did not complete its frame.');
    return painted;
  }
  async Draw(commands) { this.check(); this.commands = validate(commands); return this.Invalidate(); }
  async Flush() { this.check(); if (!this.Surface) throw new Error('The surface is not ready.'); await this.Surface.FlushAsync(); }
  async Snapshot(format = 'Png', quality = 100) {
    this.check(); await this.Flush(); const image = await this.Surface.SnapshotAsync();
    try { const data = image.Encode(format, quality); try { return data.ToArray(); } finally { data.Dispose(); } }
    finally { image.Dispose(); }
  }
  async ReadPixel(x, y) {
    this.check(); const surface = this.Surface;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= surface.Width || y >= surface.Height) throw new RangeError('Pixel coordinates are outside the surface.');
    await surface.FlushAsync();
    const image = await surface.SnapshotAsync();
    try {
      const info = new native.SKImageInfo(1, 1, native.CanvasKit.ColorType.RGBA_8888, native.CanvasKit.AlphaType.Unpremul);
      const bytes = image.ReadPixels(info, null, null, x, y);
      if (!bytes || bytes.length < 4) throw new Error('Native Skia pixel readback failed.');
      return new Uint8Array(bytes).slice(0, 4);
    } finally { image.Dispose(); }
  }
  async Dispose() {
    if (this.disposed) return; const surface = this.Element.Surface; this.disposed = true;
    this.Element.removeEventListener('paintsurface', this.paint); this.Element.removeEventListener('surfaceerror', this.error); this.Element.removeEventListener('devicelost', this.lost);
    this.Element.remove(); this.commands = []; this.render = null;
    if (surface) await surface.DisposeAsync();
  }
}
export const api = { ...native, SkiaCanvasController };
export async function mount(host, options) {
  const element = document.createElement('skia-canvas'); element.style.cssText = 'display:block;width:100%;height:100%';
  const controller = new SkiaCanvasController(element);
  try { controller.Configure(options); host.append(element); await controller.Invalidate(); return controller; }
  catch (error) { await controller.Dispose(); throw error; }
}
export async function update(controller, options) { controller.Configure(options); await controller.Invalidate(); }
