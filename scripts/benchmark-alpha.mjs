/** Interleaved opacity benchmark against the prior per-pixel color decoder. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{performance}from'node:perf_hooks';
import{Initialize}from'../dist/lib/index.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
const w=512,h=512,row=w*4+16,bytes=new Uint8Array(row*h).fill(255);
for(let y=0;y<h;y++)bytes.fill(0,y*row+w*4,(y+1)*row);
const p=new S.SKPixmap(new S.SKImageInfo(w,h,K.ColorType.RGBA_8888,K.AlphaType.Unpremul),bytes,row);
function previous(){for(let y=0;y<p.Height;y++)for(let x=0;x<p.Width;x++)if(p.GetPixelColorF(x,y).Alpha<1)return false;return true;}
function current(){return p.ComputeIsOpaque();}
const samples={previous:[],current:[]},rounds=21,warmup=5,measure=f=>{const start=performance.now();assert.equal(f(),true);return performance.now()-start;};
try{
 for(let i=0;i<warmup;i++){measure(previous);measure(current);}
 for(let i=0;i<rounds;i++)for(const name of i%2?['current','previous']:['previous','current'])samples[name].push(measure(name==='previous'?previous:current));
 bytes[(h-1)*row+(w-1)*4+3]=254;assert.equal(previous(),false);assert.equal(current(),false);
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],before=median(samples.previous),after=median(samples.current);
 const report={version:S.Version,node:process.version,dimensions:[w,h],rowBytes:row,warmupRounds:warmup,measuredRounds:rounds,previousMedianMs:before,currentMedianMs:after,speedup:before/after,pixelsEqual:true,scope:'CPU alpha scan only, valid RGBA8 storage, including padded rows; not rendering/GPU throughput',samples};
 console.log(JSON.stringify(report,null,2));if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
}finally{p.Dispose();}
