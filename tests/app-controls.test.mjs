import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(process.env.SKIA_APP_SCRIPT??new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function setup({init=null,exportData=null}={}){
  const events={},elements=new Map(),state={draws:[],surfaceDisposed:0,animationDisposed:0,fontDisposed:0,downloads:[]};
  class Element{
    constructor(id=''){this.id=id;this.value='';this.children=[];this.hidden=false;this.style={};this.dataset={};this.classList={add(){},remove(){}};}
    set innerHTML(value){this.children=Array.from({length:3},()=>new Element());}setAttribute(){}append(e){this.children.push(e);}replaceChildren(){this.children=[];}cloneNode(){return new Element(this.id);}replaceWith(e){elements.set('#'+this.id,e);}focus(){}click(){if(this.download)state.downloads.push(this.download);}
  }
  const get=key=>{if(!elements.has(key))elements.set(key,new Element(key.slice(1)));return elements.get(key);};get('#backend').value='canvas';get('#export-format').value='pdf';
  const canvas=()=>({RestoreToCount(){},ResetMatrix(){},Clear(){},Save(){return 1;}});
  const doc={BeginPage:canvas,EndPage(){},ToData:()=>exportData??{ToArray:()=>new Uint8Array([1]),Dispose(){}},Dispose(){}};
  const api={SKColor:{Parse:x=>x},SKSurface:{Create:async e=>({Canvas:canvas(),Element:e,Backend:'canvas',FallbackReasons:[],Flush(){},Dispose(){state.surfaceDisposed++;}})},SKDocument:{CreatePdf:()=>doc,CreateXps:()=>doc}};
  const scene=(id,group)=>({id,group,title:id,tag:id,description:id,code:id,draw(c,w,h,o){state.draws.push({id,time:o.time});}});
  const animation={Animation:{Duration:{TotalSeconds:8}},scenes:[scene('skottie','Animation & resources')],Dispose(){state.animationDisposed++;},async loadAnimation(){}};
  const env={console,Uint8Array,Blob,URL:{createObjectURL:()=>'',revokeObjectURL(){}},performance:{now:()=>0},history:{replaceState(){}},location:{hash:'#skottie'},localStorage:{getItem:()=>null,setItem(){}},navigator:{clipboard:{writeText:async()=>{}}},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},document:{querySelector:get,querySelectorAll:()=>[],createElement:()=>new Element(),documentElement:{dataset:{}},addEventListener(){},activeElement:{tagName:'BODY'}},window:{addEventListener(name,fn){events[name]=fn;}},Initialize:()=>init??Promise.resolve(api),createScenes:()=>[scene('primitives','Drawing')],createAssetScenes:()=>[],createAdvancedScenes:()=>[],createRegionEffectScenes:()=>[scene('region_boolean','Regions & extended effects')],createFontScenes:async()=>({scenes:[],Dispose(){state.fontDisposed++;}}),createAnimationScenes:()=>animation};
  const ready=vm.runInNewContext('(async()=>{'+source+'})()',env);return {ready,env,events,state,get,api};
}
test('Animation timeline uses uploaded duration and its final position stays at the end',async()=>{
  const a=setup();await a.ready;a.get('#timeline').oninput({target:{value:'50'}});assert.equal(a.state.draws.at(-1).time,4);a.get('#timeline').oninput({target:{value:'100'}});assert(a.state.draws.at(-1).time>7.99&&a.state.draws.at(-1).time<8);assert(Number(a.get('#timeline').value)>99.9);
});
test('Back-forward cache keeps native resources live; actual page teardown disposes them',async()=>{
  const a=setup();await a.ready;a.events.pagehide({persisted:true});assert.equal(a.state.surfaceDisposed,0);assert.equal(a.state.animationDisposed,0);a.env.window.graphicsLab.draw();const count=a.state.draws.length;a.events.pagehide({persisted:false});assert.equal(a.state.surfaceDisposed,1);assert.equal(a.state.animationDisposed,1);assert.equal(a.state.fontDisposed,1);a.env.window.graphicsLab.draw();assert.equal(a.state.draws.length,count);
});
test('Late initialization cannot recreate native resources after page teardown',async()=>{
  let resolve;const initial=new Promise(r=>resolve=r),a=setup({init:initial});a.events.pagehide({persisted:false});resolve(a.api);await a.ready;assert.equal(a.state.draws.length,0);assert.equal(a.env.window.graphicsLab,undefined);
});
test('Async document export retains the selected scene name when navigation changes',async()=>{
  let resolve;const data=new Promise(r=>resolve=r),a=setup({exportData:data});await a.ready;const exporting=a.get('#export').onclick();assert.equal(a.get('#export').disabled,true);a.env.window.graphicsLab.select('region_boolean');resolve({ToArray:()=>new Uint8Array([1]),Dispose(){}});await exporting;assert.deepEqual(a.state.downloads,['skiasharp-skottie.pdf']);assert.equal(a.get('#export').disabled,false);
});
