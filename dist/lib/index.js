import { installGpuRecords } from './gpu-records.js';
import { installSurfaceFormats } from './surface-formats.js';
import { createCore } from './core.js';
import { createPaths } from './paths.js';
import { createFonts } from './fonts.js';
import { createImages } from './images.js';
import { createCanvasAPI } from './canvas.js';
import { createWebGPUBackend } from './webgpu.js';
import { createRegions } from './regions.js';
import { createEffectExtensions } from './effects.js';
import { createPathEffectExtensions } from './path-effects.js';
import { createAnimationAPI } from './animation.js';
import { installOverloads } from './overloads.js';
import { installCanvasEffects } from './canvas-effects.js';
import { createDocuments } from './documents.js';
import { createGpuAPI } from './gpu.js';
import { installLayerEffects } from './layer-effects.js';
import { createSpecializedAPI } from './specialized.js';
import { installConformance } from './conformance.js';
import { installAssetExtensions } from './assets.js';

let defaultRuntime;
let defaultInitialization;
let loaderPromise;
export function Initialize(options = {}) {
  if (options.isolated) return initializeRuntime(options);
  if (defaultRuntime) return Promise.resolve(defaultRuntime);
  return defaultInitialization ??= initializeRuntime(options).catch(error => {
    defaultInitialization = undefined;
    throw error;
  });
}
async function initializeRuntime(options = {}) {
  if (defaultRuntime && !options.isolated) return defaultRuntime;
  const root = new URL('../', import.meta.url);
  let K = options.CanvasKit;
  if (!K) {
    if (!globalThis.CanvasKitInit) {
      if (typeof document === 'undefined') throw new Error('In Node, pass an initialized CanvasKit instance to Initialize({ CanvasKit }).');
      await (loaderPromise ??= new Promise((resolve, reject) => {
        const s = document.createElement('script'); s.src = options.scriptUrl || new URL('vendor/canvaskit.js', root).href;
        s.onload = resolve; s.onerror = () => reject(new Error('Could not load the bundled Skia engine.')); document.head.append(s);
      }).catch(error => { loaderPromise = undefined; throw error; }));
    }
    K = await globalThis.CanvasKitInit({ locateFile: file => new URL(file, options.wasmBaseUrl || new URL('vendor/', root)).href });
  }
  const api = createCore(K);
  Object.assign(api, createPaths(K, api));
  Object.assign(api, createFonts(K, api));
  Object.assign(api, createImages(K, api));
  Object.assign(api, createCanvasAPI(K, api, createWebGPUBackend));
  Object.assign(api, createRegions(K, api));
  Object.assign(api, createEffectExtensions(K, api));
  Object.assign(api, createPathEffectExtensions(K, api));
  Object.assign(api, createAnimationAPI(K, api));
  Object.assign(api, createGpuAPI(K, api));
  installOverloads(K, api);
  installCanvasEffects(K, api);
  installLayerEffects(K, api);
  Object.assign(api, createSpecializedAPI(K, api));
  installAssetExtensions(K, api);
  Object.assign(api, createDocuments(K, api));
  installConformance(K, api);
  installSurfaceFormats(K, api);
  installGpuRecords(K, api);
  api.CanvasKit = K;
  api.Version = '0.3.0';
  api.BackendCapabilities = Object.freeze({ WebGL: 'Skia GPU renderer', Canvas: 'Skia software rasterizer presented through Canvas 2D', WebGPU: 'Native Skia Graphite/Dawn; injected runtimes without Graphite use the primitive/raster presenter' });
  if (options.fonts !== false) {
    const fonts = options.fonts || [
      { url: new URL('fonts/DejaVuSans.ttf', root).href, family: 'DejaVu Sans' },
      { url: new URL('fonts/DejaVuSerif.ttf', root).href, family: 'DejaVu Serif' },
      { url: new URL('fonts/DejaVuSansMono.ttf', root).href, family: 'DejaVu Sans Mono' }
    ];
    for (const font of fonts) {
      const bytes = font.data || new Uint8Array(await (await fetch(font.url).then(r => { if (!r.ok) throw new Error('Font request failed: ' + r.status); return r; })).arrayBuffer());
      api.SKFontManager.Default.RegisterFont(bytes, font.family).Dispose();
    }
  }
  if (!options.isolated) defaultRuntime = api;
  return api;
}

export async function RegisterWebComponent(options = {}) {
  const api = await Initialize(options);
  if (typeof customElements === 'undefined' || customElements.get('skia-canvas')) return api;
  class SkiaCanvasElement extends HTMLElement {
    static observedAttributes = ['backend', 'width', 'height'];
    constructor() {
      super(); this._generation = 0; this.attachShadow({mode:'open'});
      this.shadowRoot.innerHTML = '<style>:host{display:block;min-height:160px}canvas{display:block;width:100%;height:100%}</style><canvas part="canvas"></canvas>';
    }
    connectedCallback() { this._observer = new ResizeObserver(() => this.InvalidateSurface()); this._observer.observe(this); this.InvalidateSurface(); }
    disconnectedCallback() { this._generation++; this._observer?.disconnect(); this.Surface?.Dispose(); this.Surface = null; }
    attributeChangedCallback() { if (this.isConnected) this.InvalidateSurface(); }
    async InvalidateSurface() {
      const generation = ++this._generation;
      await Promise.resolve(); if (generation !== this._generation || !this.isConnected) return;
      const old = this.shadowRoot.querySelector('canvas'); const element = old.cloneNode(false);
      const dpr = globalThis.devicePixelRatio || 1;
      element.width = Math.round(+(this.getAttribute('width') || Math.max(1, this.clientWidth * dpr)));
      element.height = Math.round(+(this.getAttribute('height') || Math.max(1, this.clientHeight * dpr)));
      try {
        const requestedBackend=this.getAttribute('backend') || 'auto';
        if(this.Surface && !this.Surface.IsDisposed && this.Surface.Width===element.width && this.Surface.Height===element.height && this._requestedBackend===requestedBackend){
          this.dispatchEvent(new CustomEvent('paintsurface',{detail:{Surface:this.Surface,Info:new api.SKImageInfo(element.width,element.height),Canvas:this.Surface.Canvas}}));
          this.Surface.Flush();return;
        }
        const surface = await api.SKSurface.Create(element, {backend:this.getAttribute('backend') || 'auto'});
        if (generation !== this._generation || !this.isConnected) { surface.Dispose(); return; }
        this.Surface?.Dispose(); old.replaceWith(surface.Element||element); this.Surface = surface;this._requestedBackend=requestedBackend;
        this.dispatchEvent(new CustomEvent('paintsurface', {detail:{Surface:surface,Info:new api.SKImageInfo(element.width,element.height),Canvas:surface.Canvas}}));
        surface.Flush();
      } catch(error) { this.dispatchEvent(new CustomEvent('surfaceerror',{detail:error})); }
    }
  }
  customElements.define('skia-canvas', SkiaCanvasElement);
  return api;
}

export default Initialize;
