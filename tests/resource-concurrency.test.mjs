import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {Initialize} from '../dist/lib/index.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
function setup(){
 const original=globalThis.fetch,requests=[];globalThis.fetch=(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,finish:(values)=>resolve({ok:true,arrayBuffer:async()=>Uint8Array.from(values).buffer}),reject}));
 return{requests,close:()=>{globalThis.fetch=original;}};
}
const bytes=d=>{try{return [...d.AsSpan()];}finally{d.Dispose();}};
test('overlapping loads are deduplicated, but replacing URLs never serves stale bytes',async()=>{
 const env=setup(),p=new S.ResourceProvider();try{
  p.RegisterUrl('asset','first');const a=p.LoadAsync('asset'),alias=p.LoadAsync('asset');assert.equal(env.requests.length,1);
  p.RegisterUrl('asset','second');const b=p.LoadAsync('asset');assert.equal(env.requests.length,2);
  env.requests[0].finish([1]);assert.deepEqual(bytes(await a),[1]);assert.deepEqual(bytes(await alias),[1]);
  const extra=p.LoadAsync('asset');assert.equal(env.requests.length,2,'an old finally deleted the new pending request');
  env.requests[1].finish([2]);assert.deepEqual(bytes(await b),[2]);assert.deepEqual(bytes(await extra),[2]);assert.deepEqual(bytes(p.Load('asset')),[2]);
 }finally{p.Dispose();env.close();}
});
test('late resources cannot replace a registered byte buffer or resurrect a removed name',async()=>{
 const env=setup(),p=new S.ResourceProvider();try{
  p.RegisterUrl('x','first');const a=p.LoadAsync('x');p.Register('x',new Uint8Array([9]));env.requests[0].finish([1]);assert.deepEqual(bytes(await a),[1]);assert.deepEqual(bytes(p.Load('x')),[9]);
  p.RegisterUrl('x','second');const b=p.LoadAsync('x');assert(p.Remove('x'));env.requests[1].finish([2]);assert.deepEqual(bytes(await b),[2]);assert.equal(p.Load('x'),null);assert.deepEqual(p.ResourceNames,[]);
 }finally{p.Dispose();env.close();}
});
test('clearing a caching provider during a load cannot repopulate the cleared cache',async()=>{
 const env=setup(),p=new S.ResourceProvider(),cache=new S.CachingResourceProvider(p);try{
  p.RegisterUrl('x','first');const a=cache.LoadAsync('x');cache.Clear();env.requests[0].finish([1]);assert.deepEqual(bytes(await a),[1]);assert.equal(cache._entries.size,0);
  const b=await cache.LoadAsync('x');assert.deepEqual(bytes(b),[1]);assert.equal(cache._entries.size,1);
 }finally{cache.Dispose();p.Dispose();env.close();}
});
test('failed requests can be retried and URL option objects are registered by value',async()=>{
 const env=setup(),p=new S.ResourceProvider();try{
  const options={cache:'no-store'};p.RegisterUrl('x','url',options);options.cache='force-cache';const a=p.LoadAsync('x');assert.equal(env.requests[0].options.cache,'no-store');env.requests[0].reject(Error('network'));await assert.rejects(a,/network/);
  const b=p.LoadAsync('x');assert.equal(env.requests.length,2);env.requests[1].finish([3]);assert.deepEqual(bytes(await b),[3]);
 }finally{p.Dispose();env.close();}
});
test('streamed resource byte limits cancel oversized bodies and preserve retryable state',async()=>{
 const original=globalThis.fetch;let cancelled=0;globalThis.fetch=async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new Uint8Array(5));},cancel(){cancelled++;}})});
 const p=new S.ResourceProvider();try{p.RegisterUrl('x','url',{MaxBytes:4});await assert.rejects(p.LoadAsync('x'),/limit/);assert.equal(cancelled,1);assert.equal(p.Load('x'),null);assert.equal(p._pending.size,0);}finally{p.Dispose();globalThis.fetch=original;}
});
