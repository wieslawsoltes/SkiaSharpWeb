/** Graphite value records and an owned, bounded native image cache.
 * Install after createGpuAPI and the image overload adapters. Browser handles
 * are GPU objects; native process addresses cannot cross the JavaScript ABI. */
export function installGpuRecords(K, api) {
  if (api.SKGraphiteImageCache && api.SKGraphiteDawnBackendContextInit) return api;
  const identities = new WeakMap();
  let nextIdentity = 1;
  const identity = value => {
    let id = identities.get(value);
    if (!id) { id = nextIdentity++; identities.set(value, id); }
    return id;
  };
  const unsupported = message => { throw new api.SKNotSupportedError(message); };
  const reference = value => value == null ? null : value;
  const equal = (left, right) => left === right || (typeof left === 'number' && typeof right === 'number' && Number.isNaN(left) && Number.isNaN(right));
  const hash = values => {
    let result = 2166136261;
    for (const value of values) {
      const type = typeof value;
      const text = value == null ? 'null' : (type === 'object' || type === 'function') ? `ref:${identity(value)}` : `${type}:${String(value)}`;
      for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
      result = Math.imul(result ^ 255, 16777619);
    }
    return result | 0;
  };
  const rect = value => value == null ? [0, 0, 0, 0] : value.ToArray?.() ?? [value.Left, value.Top, value.Right, value.Bottom];
  function valueRecord(Type, fields) {
    Type.prototype.Equals = function (other) {
      if (!(other instanceof Type)) return false;
      const left = fields(this), right = fields(other);
      return left.every((value, index) => equal(value, right[index]));
    };
    Type.prototype.GetHashCode = function () { return hash(fields(this)); };
  }
  valueRecord(api.SKGraphiteContextOptions, v => [!!v.DisableDriverCorrectnessWorkarounds, v.InternalMultisampleCount, v.GpuBudgetInBytes, !!v.RequireOrderedRecordings, !!v.SetBackendLabels]);
  valueRecord(api.SKGraphiteSubmitInfo, v => [!!v.Sync, !!v.MarkBoundary, v.FrameID]);
  valueRecord(api.SKGraphiteInsertRecordingInfo, v => [reference(v.Recording), reference(v.TargetSurface), v.TargetTranslationX, v.TargetTranslationY, ...rect(v.TargetClip)]);

  function browserHandle(value, kind) {
    if (value == null) return null;
    if (typeof value === 'number' || typeof value === 'bigint') return unsupported(`${kind} requires a browser GPU object; native pointer addresses are unsupported.`);
    const member = { Device: 'createCommandEncoder', Queue: 'submit', Instance: 'requestAdapter' }[kind];
    if (typeof value !== 'object' || typeof value[member] !== 'function') throw new TypeError(`${kind} must be a GPU${kind === 'Instance' ? '' : kind} object.`);
    return value;
  }
  class SKGraphiteDawnBackendContextInit {
    constructor(options = {}) {
      if (typeof options?.createCommandEncoder === 'function') options = { Device: options };
      this.Instance = options.Instance ?? null;
      this.Device = options.Device ?? null;
      this.Queue = options.Queue ?? this.Device?.queue ?? null;
      this.NonYielding = options.NonYielding ?? true;
    }
    get Instance() { return this._instance; }
    set Instance(value) { this._instance = browserHandle(value, 'Instance'); }
    get Device() { return this._device; }
    set Device(value) { this._device = browserHandle(value, 'Device'); }
    get Queue() { return this._queue; }
    set Queue(value) { this._queue = browserHandle(value, 'Queue'); }
    get NonYielding() { return this._nonYielding; }
    set NonYielding(value) { this._nonYielding = !!value; }
    // The existing browser context factory consumes this alias; validate the
    // complete record when materializing it, after object-initializer setters.
    get WgpuDevice() {
      if (!this.Device) throw new TypeError('Device must be set before creating a Graphite context.');
      if (this.Queue !== this.Device.queue) return unsupported('Queue must be the selected GPUDevice.queue.');
      if (!this.NonYielding) return unsupported('Browser Graphite contexts require NonYielding=true; use asynchronous submission.');
      return this.Device;
    }
    get WgpuInstance() { return this.Instance; }
    get WgpuQueue() { return this.Queue; }
  }
  valueRecord(SKGraphiteDawnBackendContextInit, v => [v.Instance, v.Device, v.Queue, v.NonYielding]);

  function ownedImage(native, recorder) {
    if (!native) return null;
    const result = api.SKImage._fromNative(native);
    result._textureBacked = true;
    result.TextureImportMode = 'graphite-cache';
    result._gpuOwner = recorder;
    recorder._surfaces.add(result);
    const dispose = result.Dispose.bind(result);
    result.Dispose = () => {
      if (result.IsDisposed) return;
      dispose();
      recorder._surfaces.delete(result);
    };
    return result;
  }
  class SKGraphiteImageCache {
    constructor() {
      this._entries = new Map();
      this._lookup = new WeakMap();
      this._serial = 0;
      this._hits = 0;
      this._uploads = 0;
      this._evictions = 0;
    }
    FindOrCreate(recorder, image, mipmapped = false) {
      if (!(recorder instanceof api.SKGraphiteRecorder)) throw new TypeError('recorder must be an SKGraphiteRecorder.');
      if (!(image instanceof api.SKImage)) throw new TypeError('image must be an SKImage.');
      recorder.ThrowIfDisposed();
      recorder.Context?.ThrowIfDisposed();
      image.ThrowIfDisposed();
      if (image._gpuOwner instanceof api.SKGraphiteRecorder && image._gpuOwner !== recorder) throw new Error('The source texture belongs to another Graphite recorder.');
      if (!K.SkiaSharpImageToGraphiteTexture) return unsupported('Graphite image caching requires the compiled native Graphite extension.');
      mipmapped = !!mipmapped;
      const lookup = `${identity(recorder)}:${mipmapped}`;
      let slots = this._lookup.get(image);
      if (!slots) this._lookup.set(image, slots = new Map());
      let key = slots.get(lookup), entry = this._entries.get(key);
      // A second JS wrapper can own the same immutable SkImage. Embind alias
      // comparison preserves that native identity without exposing raw pointers.
      if (!entry) for (const [candidate, value] of this._entries) {
        if (value.recorder === recorder && value.mipmapped === mipmapped && value.source.isAliasOf(image._native)) {
          key = candidate; entry = value; slots.set(lookup, key); break;
        }
      }
      if (entry) {
        this._entries.delete(key); this._entries.set(key, entry);
        this._hits++;
        return ownedImage(entry.uploaded._native.clone(), recorder);
      }
      const native = K.SkiaSharpImageToGraphiteTexture(recorder._native, image._native, mipmapped);
      if (!native) return null;
      const uploaded = ownedImage(native, recorder);
      let source;
      try { source = image._native.clone(); } catch (error) { uploaded.Dispose(); throw error; }
      while (this._entries.size >= 256) {
        const oldestKey = this._entries.keys().next().value;
        const oldest = this._entries.get(oldestKey);
        this._entries.delete(oldestKey); oldest.uploaded.Dispose(); oldest.source.delete(); this._evictions++;
      }
      key = ++this._serial;
      this._entries.set(key, { source, uploaded, recorder, mipmapped });
      slots.set(lookup, key);
      this._uploads++;
      return ownedImage(uploaded._native.clone(), recorder);
    }
    // As in the upstream cache, Dispose releases all owned entries and is
    // idempotent. Caller-owned results and pending recordings retain their refs.
    Dispose() {
      for (const value of this._entries.values()) { value.uploaded.Dispose(); value.source.delete(); }
      this._entries.clear(); this._lookup = new WeakMap();
    }
    GetStatistics() { return { Count: this._entries.size, Hits: this._hits, Uploads: this._uploads, Evictions: this._evictions, Capacity: 256 }; }
    [Symbol.dispose]() { this.Dispose(); }
  }
  Object.assign(api, { SKGraphiteImageCache, SKGraphiteDawnBackendContextInit });
  return api;
}
