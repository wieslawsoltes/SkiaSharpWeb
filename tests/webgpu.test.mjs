import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebGPUBackend } from '../dist/lib/webgpu.js';

// These portable tests exercise resource management and the public API without
// claiming hardware or shader-output validation. Real browsers compile WGSL.
function fixture(t, options = {}) {
  const calls = [];
  let loseDevice;
  let nextResource = 0;
  const device = {
    lost: new Promise(resolve => { loseDevice = resolve; }),
    limits: { maxTextureDimension2D: 8192, maxBufferSize: 268435456 },
    pushErrorScope(filter) { calls.push({ type: 'pushErrorScope', filter }); },
    async popErrorScope() { calls.push({ type: 'popErrorScope' }); return options.validationError || null; },
    createShaderModule(descriptor) {
      calls.push({ type: 'shader', descriptor });
      return { async getCompilationInfo() { return { messages: options.shaderMessages || [] }; } };
    },
    async createRenderPipelineAsync(descriptor) {
      calls.push({ type: 'pipeline', descriptor });
      if (options.pipelineError) throw options.pipelineError;
      return { getBindGroupLayout() { return {}; } };
    },
    createSampler(descriptor) { calls.push({ type: 'sampler', descriptor }); return {}; },
    createTexture(descriptor) {
      const id = ++nextResource;
      calls.push({ type: 'texture', id, descriptor });
      return {
        createView() { return { textureId: id }; },
        destroy() { calls.push({ type: 'destroyTexture', id }); },
      };
    },
    createBuffer(descriptor) {
      const id = ++nextResource;
      calls.push({ type: 'buffer', id, descriptor });
      return { destroy() { calls.push({ type: 'destroyBuffer', id }); } };
    },
    createBindGroup(descriptor) { calls.push({ type: 'bindGroup', descriptor }); return {}; },
    createCommandEncoder(descriptor) {
      calls.push({ type: 'encoder', descriptor });
      return {
        beginRenderPass(passDescriptor) {
          calls.push({ type: 'renderPass', descriptor: passDescriptor });
          return {
            setPipeline() {}, setBindGroup() {}, setVertexBuffer() {},
            draw(count, instances = 1) { calls.push({ type: 'draw', count, instances }); },
            end() { calls.push({ type: 'endPass' }); },
          };
        },
        finish() { return {}; },
      };
    },
    queue: {
      writeTexture(target, data, layout, size) {
        calls.push({ type: 'upload', target, bytes: new Uint8Array(data), layout, size });
      },
      writeBuffer(buffer, offset, data, dataOffset, byteLength) {
        calls.push({ type: 'vertices', offset, data: new Float32Array(data.slice(dataOffset, dataOffset + byteLength)) });
      },
      submit(buffers) { calls.push({ type: 'submit', count: buffers.length }); },
    },
    destroy() { calls.push({ type: 'destroyDevice' }); },
  };
  const context = {
    configure(descriptor) { calls.push({ type: 'configure', descriptor }); },
    getCurrentTexture() { return { createView() { return {}; } }; },
    unconfigure() { calls.push({ type: 'unconfigure' }); },
  };
  const canvas = {
    width: 300, height: 150,
    getContext(type) {
      assert.equal(type, 'webgpu');
      return options.contextUnavailable ? null : context;
    },
  };
  const gpu = {
    async requestAdapter(descriptor) {
      calls.push({ type: 'adapter', descriptor });
      if (options.adapterUnavailable) return null;
      return { async requestDevice(descriptor) { calls.push({ type: 'device', descriptor }); return device; } };
    },
    getPreferredCanvasFormat() { return 'bgra8unorm'; },
  };
  const replacements = {
    navigator: { gpu: options.gpuUnavailable ? undefined : gpu },
    GPUTextureUsage: { RENDER_ATTACHMENT: 16, TEXTURE_BINDING: 4, COPY_DST: 2 },
    GPUBufferUsage: { VERTEX: 32, COPY_DST: 8 },
  };
  for (const [name, value] of Object.entries(replacements)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else delete globalThis[name];
    });
  }
  return { canvas, context, device, calls, loseDevice, of: type => calls.filter(call => call.type === type) };
}

async function initialized(t, options) {
  const f = fixture(t, options);
  const backend = await createWebGPUBackend(f.canvas);
  t.after(() => backend.dispose());
  return { ...f, backend };
}

const rgba = [1, 0, 0, 1];

test('initializes validated pipelines and premultiplied canvas configuration', async t => {
  const f = await initialized(t);
  assert.equal(f.backend.device, f.device);
  assert.equal(f.backend.context, f.context);
  assert.equal(f.backend.kind, 'webgpu');
  assert.equal(f.backend.mode, 'ready');
  assert.equal(f.backend.format, 'bgra8unorm');
  assert.equal(f.backend.width, 300);
  assert.equal(f.backend.height, 150);
  assert.equal(f.of('pushErrorScope').length, 1);
  assert.equal(f.of('popErrorScope').length, 1);
  assert.equal(f.of('pipeline').length, 2);
  assert.equal(f.of('configure').at(-1).descriptor.alphaMode, 'premultiplied');
  const native = f.of('pipeline').find(call => call.descriptor.fragment.targets[0].blend);
  assert.equal(native.descriptor.vertex.buffers[0].stepMode, 'instance');
  assert.equal(native.descriptor.vertex.buffers[0].arrayStride, 52);
  assert.deepEqual(native.descriptor.fragment.targets[0].blend, {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  });
});

test('rejects unavailable GPU and adapter without allocating a device', async t => {
  await t.test('GPU missing', async t => {
    const f = fixture(t, { gpuUnavailable: true });
    await assert.rejects(createWebGPUBackend(f.canvas), /WebGPU is unavailable/);
    assert.equal(f.of('device').length, 0);
  });
  await t.test('adapter missing', async t => {
    const f = fixture(t, { adapterUnavailable: true });
    await assert.rejects(createWebGPUBackend(f.canvas), /adapter/);
    assert.equal(f.of('device').length, 0);
  });
});

test('cleans up a device when context, shader, or pipeline initialization fails', async t => {
  for (const [name, options, message] of [
    ['context', { contextUnavailable: true }, /context/],
    ['shader', { shaderMessages: [{ type: 'error', message: 'test shader failure' }] }, /test shader failure/],
    ['pipeline', { pipelineError: new Error('test pipeline failure') }, /test pipeline failure/],
    ['validation', { validationError: { message: 'test validation failure' } }, /test validation failure/],
  ]) {
    await t.test(name, async t => {
      const f = fixture(t, options);
      await assert.rejects(createWebGPUBackend(f.canvas), message);
      assert.equal(f.of('destroyDevice').length, 1);
    });
  }
});

test('uploads tightly packed RGBA rows and preserves byte offsets and premultiplication', async t => {
  const f = await initialized(t);
  const storage = new Uint8Array(8 + 65 * 2 * 4 + 8);
  const source = storage.subarray(8, storage.length - 8);
  source.fill(11, 0, 260);
  source.fill(22, 260);
  // A translucent premultiplied pixel must be uploaded unchanged.
  source.set([64, 32, 16, 128], 0);
  f.backend.presentPixels(source, 65, 2);
  const upload = f.of('upload').at(-1);
  assert.equal(upload.layout.bytesPerRow, 260);
  assert.equal(upload.layout.rowsPerImage, 2);
  assert.deepEqual(Array.from(upload.bytes.subarray(0, 4)), [64, 32, 16, 128]);
  assert.equal(upload.bytes[259], 11);
  assert.equal(upload.bytes[260], 22);
  assert.equal(upload.bytes[519], 22);
  assert.equal(upload.bytes.length, 520);
  assert.deepEqual(upload.size, { width: 65, height: 2, depthOrArrayLayers: 1 });
  assert.equal(f.of('draw').at(-1).count, 3);
  assert.equal(f.backend.mode, 'skia-raster-upload');
});

test('accepts aligned, clamped, and ArrayBuffer pixels; reuses and resizes textures', async t => {
  const f = await initialized(t);
  f.backend.presentPixels(new Uint8ClampedArray(64 * 2 * 4), 64, 2);
  assert.equal(f.of('upload').at(-1).layout.bytesPerRow, 256);
  f.backend.presentPixels(new ArrayBuffer(64 * 2 * 4), 64, 2);
  assert.equal(f.of('texture').length, 1);
  f.backend.presentPixels(new Uint8Array(4), 1, 1);
  assert.equal(f.of('texture').length, 2);
  assert.equal(f.of('destroyTexture').length, 1);
  assert.equal(f.canvas.width, 1);
  assert.equal(f.canvas.height, 1);
});

test('replaces draws before the last clear, premultiplies clear, and preserves primitive order', async t => {
  const f = await initialized(t);
  f.backend.presentPrimitives([
    { type: 'rect', rect: [0, 0, 1, 1], color: rgba },
    { type: 'clear', color: [1, 0, 0, 0.5] },
    { type: 'rect', rect: [10, 20, 30, 40], color: [1, 0, 0, 1] },
    { type: 'circle', cx: 55, cy: 55, r: 10, color: [0, 1, 0, 0.5] },
    { type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, width: 2, color: [0, 0, 1, 1] },
  ], 100, 100);
  const attachment = f.of('renderPass').at(-1).descriptor.colorAttachments[0];
  assert.deepEqual(attachment.clearValue, { r: 0.5, g: 0, b: 0, a: 0.5 });
  assert.equal(attachment.loadOp, 'clear');
  assert.equal(f.of('draw').at(-1).count, 6);
  assert.equal(f.of('draw').at(-1).instances, 3);
  const vertices = f.of('vertices').at(-1).data;
  assert.equal(vertices.length, 3 * 13);
  // Reconstruct the first corner from the uploaded center and basis vectors.
  const lx=-(vertices[10]+1),ly=-(vertices[11]+1);
  assert.ok(Math.abs(vertices[0]+lx*vertices[2]+ly*vertices[4]+0.82)<1e-6);
  assert.ok(Math.abs(vertices[1]+lx*vertices[3]+ly*vertices[5]-0.62)<1e-6);
  assert.deepEqual(Array.from(vertices.subarray(6,10)), [1,0,0,1]);
  assert.deepEqual(Array.from(vertices.subarray(13+6,13+10)), [0,1,0,0.5]);
  assert.deepEqual(Array.from(vertices.subarray(26+6,26+10)), [0,0,1,1]);
  assert.equal(f.backend.mode, 'native-primitives');
});

test('clear-only and empty frames submit a clear without allocating vertices', async t => {
  const f = await initialized(t);
  f.backend.presentPrimitives([{ type: 'clear', color: [0, 0.5, 1, 0.25] }], 20, 20);
  assert.deepEqual(f.of('renderPass').at(-1).descriptor.colorAttachments[0].clearValue,
    { r: 0, g: 0.125, b: 0.25, a: 0.25 });
  f.backend.presentPrimitives([], 20, 20);
  assert.deepEqual(f.of('renderPass').at(-1).descriptor.colorAttachments[0].clearValue,
    { r: 0, g: 0, b: 0, a: 0 });
  assert.equal(f.of('buffer').length, 0);
  assert.equal(f.of('draw').length, 0);
  assert.equal(f.of('submit').length, 2);
});

test('reuses native vertex buffers and skips empty geometry', async t => {
  const f = await initialized(t);
  const command = { type: 'circle', cx: 10, cy: 10, r: 5, color: rgba };
  f.backend.presentPrimitives([command], 30, 30);
  f.backend.presentPrimitives([command, command], 30, 30);
  assert.equal(f.of('buffer').length, 1);
  const draws = f.of('draw').length;
  f.backend.presentPrimitives([
    { ...command, r: 0 },
    { type: 'rect', rect: [0, 0, 0, 10], color: rgba },
    { type: 'line', x1: 1, y1: 1, x2: 1, y2: 1, width: 2, color: rgba },
    { ...command, color: [1, 1, 1, 0] },
  ], 30, 30);
  assert.equal(f.of('draw').length, draws);
});

test('rejects invalid dimensions, short pixels, malformed commands, and buffer overflow', async t => {
  const f = await initialized(t);
  assert.throws(() => f.backend.resize(0, 1), /positive integers/);
  assert.throws(() => f.backend.resize(1.5, 1), /positive integers/);
  assert.throws(() => f.backend.resize(8193, 1), /positive integers/);
  assert.throws(() => f.backend.presentPixels(new Uint8Array(3), 1, 1), /at least 4/);
  assert.throws(() => f.backend.presentPixels(new Float32Array(4), 1, 1), /Pixel data/);
  assert.throws(() => f.backend.presentPrimitives(null, 1, 1), /array/);
  assert.throws(() => f.backend.presentPrimitives([{ type: 'path', color: rgba }], 1, 1), /Unsupported/);
  assert.throws(() => f.backend.presentPrimitives([{ type: 'circle', cx: 0, cy: 0, r: NaN, color: rgba }], 1, 1), /finite/);
  assert.throws(() => f.backend.presentPrimitives([{ type: 'clear', color: [1, 1, 1] }], 1, 1), /four RGBA/);
  f.device.limits.maxBufferSize = 4;
  assert.throws(() => f.backend.presentPrimitives([{ type: 'circle', cx: 0, cy: 0, r: 1, color: rgba }], 1, 1), /buffer limit/);
  assert.equal(f.of('submit').length, 0);
});

test('reports device loss and blocks further submissions', async t => {
  const f = fixture(t);
  let notification;
  const backend = await createWebGPUBackend(f.canvas, { onDeviceLost: info => { notification = info; } });
  t.after(() => backend.dispose());
  const info = { message: 'simulated device removal', reason: 'unknown' };
  f.loseDevice(info);
  await Promise.resolve();
  assert.equal(notification, info);
  assert.throws(() => backend.resize(1, 1), /device was lost/);
  assert.throws(() => backend.presentPixels(new Uint8Array(4), 1, 1), /device was lost/);
  assert.throws(() => backend.presentPrimitives([], 1, 1), /device was lost/);
  assert.equal(f.of('submit').length, 0);
});

test('disposes resources once and suppresses later device-loss callbacks', async t => {
  const f = fixture(t);
  let notified = false;
  const backend = await createWebGPUBackend(f.canvas, { onDeviceLost: () => { notified = true; } });
  backend.presentPixels(new Uint8Array(4), 1, 1);
  backend.presentPrimitives([{ type: 'circle', cx: 1, cy: 1, r: 1, color: rgba }], 2, 2);
  backend.dispose();
  backend.dispose();
  assert.equal(backend.mode, 'disposed');
  assert.equal(f.of('destroyTexture').length, 1);
  assert.equal(f.of('destroyBuffer').length, 1);
  assert.equal(f.of('destroyDevice').length, 1);
  assert.equal(f.of('unconfigure').length, 1);
  assert.throws(() => backend.resize(1, 1), /disposed/);
  assert.throws(() => backend.presentPixels(new Uint8Array(4), 1, 1), /disposed/);
  f.loseDevice({ message: 'destroyed', reason: 'destroyed' });
  await Promise.resolve();
  assert.equal(notified, false);
});
