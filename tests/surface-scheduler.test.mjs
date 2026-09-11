import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceScheduler } from '../dist/lib/surface-scheduler.js';

const microtasks = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function setup(overrides = {}) {
  const frames = new Map(), created = [], errors = [], paints = [];
  let serial = 0, configuration = { width: 40, height: 30, backend: 'auto' };
  const make = () => { const surface = { IsDisposed: false, Flushes: 0, Disposals: 0,
    Flush() { assert(!this.IsDisposed); this.Flushes++; },
    Dispose() { this.IsDisposed = true; this.Disposals++; } };
    created.push(surface); return surface;
  };
  const scheduler = new SurfaceScheduler({
    getConfiguration: () => ({ ...configuration }),
    createSurface: async () => make(),
    paint: surface => paints.push(surface), onError: error => errors.push(error),
    requestFrame: callback => { const id = ++serial; frames.set(id, callback); return id; },
    cancelFrame: id => frames.delete(id), ...overrides
  });
  return { scheduler, frames, created, errors, paints, make,
    configure: change => { configuration = { ...configuration, ...change }; },
    async tick() { const entry = frames.entries().next().value; if (entry) { frames.delete(entry[0]); entry[1](); } await microtasks(); }
  };
}
test('ten thousand invalidations coalesce to one frame and one surface allocation', async () => {
  const t = setup(), pending = t.scheduler.Connect();
  for (let i = 0; i < 10000; i++) assert.equal(t.scheduler.Invalidate(), pending);
  assert.equal(t.frames.size, 1); await t.tick(); assert.equal(await pending, true);
  assert.equal(t.paints.length, 1); assert.equal(t.created.length, 1);
  assert.equal(t.scheduler.Statistics.Invalidations, 10001); t.scheduler.Disconnect();
});
test('unchanged dimensions/backend reuse both surface and canvas on successive frames', async () => {
  const t = setup(); t.scheduler.Connect(); await t.tick();
  for (let i = 0; i < 20; i++) { t.scheduler.Invalidate(); await t.tick(); }
  assert.equal(t.created.length, 1); assert.equal(t.created[0].Flushes, 21);
  assert.equal(t.scheduler.Statistics.ReusedSurfaces, 20); t.scheduler.Disconnect();
});
test('a resize disposes the old surface once after a valid replacement', async () => {
  const t = setup(); t.scheduler.Connect(); await t.tick(); const old = t.scheduler.Surface;
  t.configure({ width: 100 }); const result = t.scheduler.Invalidate(); await t.tick();
  assert.equal(await result, true); assert.equal(old.Disposals, 1); assert.equal(t.created.length, 2);
  t.scheduler.Disconnect(); assert.equal(t.created[1].Disposals, 1);
});
test('creation is single-flight and stale resized surfaces are released, never painted', async () => {
  let finish; const t = setup({ createSurface: () => new Promise(resolve => { finish = resolve; }) });
  const first = t.scheduler.Connect(); await t.tick();
  t.configure({ height: 60 }); const next = t.scheduler.Invalidate(); assert.equal(t.frames.size, 0);
  const stale = t.make(); finish(stale); await microtasks();
  assert.equal(await first, false); assert.equal(stale.Disposals, 1); assert.equal(t.paints.length, 0);
  await t.tick(); const good = t.make(); finish(good); await microtasks();
  assert.equal(await next, true); assert.equal(t.scheduler.Surface, good); t.scheduler.Disconnect();
});
test('disconnect cancels scheduled repaint and immediately resolves pending callers', async () => {
  const t = setup(); const result = t.scheduler.Connect(); t.scheduler.Disconnect();
  assert.equal(await result, false); assert.equal(t.frames.size, 0); assert.equal(t.created.length, 0);
});
test('disconnect during creation resolves callers and releases late resources', async () => {
  let finish; const t = setup({ createSurface: () => new Promise(resolve => { finish = resolve; }) });
  const result = t.scheduler.Connect(); await t.tick(); t.scheduler.Disconnect();
  assert.equal(await result, false); const late = t.make(); finish(late); await microtasks();
  assert.equal(late.Disposals, 1); assert.equal(t.paints.length, 0); assert.equal(t.scheduler.Surface, null);
});
test('reconnection does not adopt an earlier connection generation', async () => {
  let finish; const t = setup({ createSurface: () => new Promise(resolve => { finish = resolve; }) });
  t.scheduler.Connect(); await t.tick(); t.scheduler.Disconnect(); const next = t.scheduler.Connect();
  const stale = t.make(); finish(stale); await microtasks(); await t.tick();
  const current = t.make(); finish(current); await microtasks(); assert.equal(await next, true);
  assert.equal(t.paints.length, 1); assert.equal(stale.Disposals, 1); t.scheduler.Disconnect();
});
test('invalidating inside a paint callback schedules a later frame without recursion', async () => {
  let count = 0; const t = setup({ paint: () => { if (++count === 1) t.scheduler.Invalidate(); } });
  t.scheduler.Connect(); await t.tick(); assert.equal(count, 1); assert.equal(t.frames.size, 1);
  await t.tick(); assert.equal(count, 2); assert.equal(t.created.length, 1); t.scheduler.Disconnect();
});
test('explicit recreation invalidates resources even with unchanged size', async () => {
  const t = setup(); t.scheduler.Connect(); await t.tick();
  t.scheduler.Invalidate(true); await t.tick(); assert.equal(t.created.length, 2); t.scheduler.Disconnect();
});
test('a failed factory reports once and permits a later retry', async () => {
  let fail = true; const t = setup({ createSurface: async () => { if (fail) throw Error('factory'); return t.make(); } });
  const first = t.scheduler.Connect(); await t.tick(); assert.equal(await first, false);
  assert.equal(t.errors.length, 1); assert.equal(t.frames.size, 0);
  fail = false; const next = t.scheduler.Invalidate(); await t.tick(); assert.equal(await next, true); t.scheduler.Disconnect();
});
test('paint failure does not flush or leak resources, and errors never strand future frames', async () => {
  let fail = true; const t = setup({ paint: () => { if (fail) throw Error('paint'); } });
  const first = t.scheduler.Connect(); await t.tick(); assert.equal(await first, false);
  assert.equal(t.created[0].Flushes, 0); fail = false;
  const next = t.scheduler.Invalidate(); await t.tick(); assert.equal(await next, true);
  assert.equal(t.created.length, 1); assert.equal(t.errors.length, 1); t.scheduler.Disconnect();
});
test('errors from obsolete creations do not report against a disconnected component', async () => {
  let fail; const t = setup({ createSurface: () => new Promise((_, reject) => { fail = reject; }) });
  t.scheduler.Connect(); await t.tick(); t.scheduler.Disconnect(); fail(Error('obsolete')); await microtasks();
  assert.equal(t.errors.length, 0); assert.equal(t.frames.size, 0);
});
test('consumer-disposed surfaces are recreated; invalidation while disconnected is inert', async () => {
  const t = setup(); assert.equal(await t.scheduler.Invalidate(), false);
  t.scheduler.Connect(); await t.tick(); t.scheduler.Surface.Dispose(); t.scheduler.Invalidate(); await t.tick();
  assert.equal(t.created.length, 2); assert.equal(t.created[0].Disposals, 1); t.scheduler.Disconnect();
});
