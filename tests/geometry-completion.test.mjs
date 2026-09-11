import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Initialize} from '../dist/lib/index.js';
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:[{family:'DejaVu Sans',data:fs.readFileSync(new URL('../dist/fonts/DejaVuSans.ttf',import.meta.url))}],isolated:true});
function scope(fn){const list=[];try{return fn(x=>(list.push(x),x));}finally{for(const x of list.reverse())x?.Dispose();}}
const numeric=x=>x?.value??x;
test('numeric paint style/cap/join/blend values match declared enum objects in native state',()=>scope(own=>{
 const p=own(new S.SKPaint({Style:1,StrokeCap:2,StrokeJoin:1,BlendMode:3,StrokeWidth:4}));
 assert.equal(numeric(p.Style),1);assert.equal(numeric(p.StrokeCap),2);assert.equal(numeric(p.StrokeJoin),1);assert.equal(numeric(p.BlendMode),3);
 const path=own(new S.SKPath().AddRect(new S.SKRect(10,10,20,20))),outline=own(p.GetFillPath(path));assert.deepEqual(outline.Bounds.ToArray(),[8,8,22,22]);
 p.Style=2;assert.deepEqual(own(p.GetFillPath(path)).Bounds.ToArray(),[8,8,22,22]);
 p.Style='Stroke';assert.equal(p.IsStroke,true);
 assert.throws(()=>{p.Style='nonsense';},TypeError);assert.equal(p.IsStroke,true);
}));
test('setting BlendMode releases stale custom blender metadata and clone state',()=>scope(own=>{
 const p=own(new S.SKPaint()),blender=own(S.SKBlender.Create(S.SKBlendMode.Src));p.Blender=blender;
 assert(p._effects.Blender);p.BlendMode=3;assert.equal(p.Blender,null);assert.equal(p._effects.Blender,undefined);
 const copy=own(p.Clone());assert.equal(numeric(copy.BlendMode),3);assert.equal(copy.Blender,null);
}));
test('all eighteen fill-path call shapes use native cull and resolution matrices',()=>scope(own=>{
 assert(S.SKPaint.HasNativePathExpansion,'Compiled path contracts required');
 const p=own(new S.SKPaint({Style:1,StrokeWidth:6})),src=own(new S.SKPath().MoveTo(-30,4).CubicTo(60,120,90,-50,170,40)),effect=own(S.SKPathEffect.CreateDash([7,3],2));p.PathEffect=effect;
 const cull=new S.SKRect(0,0,100,100),matrix=S.SKMatrix.CreateScale(1.25,.75);
 for(const suffix of [[],[2],[matrix],[cull],[cull,2],[cull,matrix]]){
  const hasCull=suffix[0]===cull,transform=suffix[hasCull?1:0],m=typeof transform==='number'?S.SKMatrix.CreateScale(transform,transform):transform??S.SKMatrix.Identity;
  const expected=K.SkiaSharpPaintGetFillPath(p._native,src._native,hasCull?cull.ToArray():null,m.Values);
  for(const mode of ['return','path','builder']){const dst=mode==='return'?null:own(new(mode==='path'?S.SKPath:S.SKPathBuilder)().MoveTo(999,999));const result=p.GetFillPath(src,...(dst?[dst]:[]),...suffix),out=dst??own(result);
   assert.equal(dst?result:true,expected.Success);assert.deepEqual(out.Points.flatMap(p=>p.ToArray()),expected.Points);assert.equal(out.VerbCount,expected.Verbs.length);
  }
 }
}));
test('hairline fill-path null/false results preserve SKPath but replace SKPathBuilder',()=>scope(own=>{
 const p=own(new S.SKPaint({Style:1,StrokeWidth:0})),src=own(new S.SKPath().MoveTo(10,10).LineTo(70,40)),dst=own(new S.SKPath().MoveTo(3,4)),builder=own(new S.SKPathBuilder().MoveTo(3,4));
 assert.equal(p.GetFillPath(src),null);assert.equal(p.GetFillPath(src,dst),false);assert.deepEqual(dst.Points.map(p=>p.ToArray()),[[3,4]]);
 assert.equal(p.GetFillPath(src,builder),false);assert.deepEqual(builder.Points.map(p=>p.ToArray()),[[10,10],[70,40]]);
}));
test('native fast bounds include blur/stroke effects and reset output when unsupported',()=>scope(own=>{
 const p=own(new S.SKPaint({Style:1,StrokeWidth:5})),blur=own(S.SKMaskFilter.CreateBlur(S.SKBlurStyle.Normal,3));p.MaskFilter=blur;
 const bounds=new S.SKRect(10,20,50,80),out=new S.SKRect();assert(p.GetFastBounds(bounds,out));
 assert.deepEqual(out.ToArray(),K.SkiaSharpPaintFastBounds(p._native,bounds.ToArray()).Bounds);assert(out.Left<7.5);
 p.PathEffect=own(S.SKPathEffect.Create1DPath(own(new S.SKPath().AddCircle(0,0,2)),10,0,0));
 const expected=K.SkiaSharpPaintFastBounds(p._native,bounds.ToArray());assert.equal(p.GetFastBounds(bounds,out),expected.Success);assert.deepEqual(out.ToArray(),expected.Bounds);
}));
test('fill/bounds reject disposed values without replacing caller geometry',()=>scope(own=>{
 const p=own(new S.SKPaint()),src=own(new S.SKPath()),dst=own(new S.SKPath());src.Dispose();assert.throws(()=>p.GetFillPath(src),/disposed/);
 assert.throws(()=>p.GetFillPath(null),TypeError);assert.throws(()=>p.GetFastBounds(null),TypeError);
 p.Dispose();assert.throws(()=>p.GetFastBounds(new S.SKRect()),/disposed/);
}));
test('warped glyphs retain curved verbs instead of fixed-step line sampling',()=>scope(own=>{
 const f=own(new S.SKFont(null,24)),follow=own(new S.SKPath().MoveTo(0,60).CubicTo(80,0,160,120,240,60)),path=own(f.GetTextPathOnPath('ABΩ',follow));
 assert(path.PointCount>0);const iterator=own(path.CreateRawIterator()),pts=[];let curves=0,lines=0;
 for(;;){const v=numeric(iterator.Next(pts));if(v===6)break;if(v===1)lines++;if(v===2||v===3||v===4)curves++;}
 assert(curves>0);assert.equal(lines,0);assert(path.PointCount<500);
}));
test('text-on-path origin, alignment, encoded input and explicit glyph-position overloads agree',()=>scope(own=>{
 const f=own(new S.SKFont(null,20)),follow=own(new S.SKPath().MoveTo(0,70).LineTo(400,70)),text='AΩ',glyphs=f.GetGlyphs(text),widths=f.GetGlyphWidths(glyphs),origin=new S.SKPoint(9,3),positions=f.GetGlyphPositions(glyphs,origin);
 for(const align of [0,1,2]){const simple=own(f.GetTextPathOnPath(text,follow,align,origin)),explicit=own(f.GetTextPathOnPath(glyphs,widths,positions,follow,align)),encoded=own(f.GetTextPathOnPath(new TextEncoder().encode(text),0,follow,align,origin));
  assert.deepEqual(simple.Points,explicit.Points);assert.deepEqual(simple.Points,encoded.Points);
 }
 assert.throws(()=>f.GetTextPathOnPath(glyphs,[],positions,follow),/equal/);
}));
test('warped canvas overload preserves pixels and font ownership',()=>scope(own=>{
 const f=own(new S.SKFont(null,24)),p=own(new S.SKPaint(f)),follow=own(new S.SKPath().MoveTo(0,40).QuadTo(110,0,220,50)),a=own(S.SKSurface.Create(new S.SKImageInfo(240,100))),b=own(S.SKSurface.Create(new S.SKImageInfo(240,100)));
 const path=own(f.GetTextPathOnPath('Curves',follow,0,new S.SKPoint(4,2)));a.Canvas.DrawPath(path,p);b.Canvas.DrawTextOnPath('Curves',follow,new S.SKPoint(4,2),true,f,p);
 const ia=own(a.Snapshot()),ib=own(b.Snapshot());assert.deepEqual(ia.ReadPixels(),ib.ReadPixels());assert.equal(f.IsDisposed,false);
}));
test('BreakText returns primitive counts while BreakTextDetails retains the named convenience result',()=>scope(own=>{
 const f=own(new S.SKFont(null,24)),out={};const width=f.MeasureText('AΩ')+.01;
 assert.equal(typeof f.BreakText('AΩ🙂',width),'number');assert.equal(f.BreakText('AΩ🙂',width,out),2);assert.equal(out.Text,'AΩ');
 assert.equal(f.BreakTextDetails('AΩ🙂',width).Text,'AΩ');
 for(const max of [-1,0,NaN,-Infinity])assert.equal(f.BreakText('abc',max),0);
 assert.equal(f.BreakText('A🙂',Infinity),3);assert.equal(f.BreakText('',Infinity),0);
}));
test('BreakText byte counts preserve UTF encodings and raw glyph IDs, without decoding IDs as text',()=>scope(own=>{
 const f=own(new S.SKFont(null,24)),text='AΩ🙂',limit=f.MeasureText('AΩ')+.01;
 for(const encoding of [0,1,2]){let bytes;
  if(encoding===0)bytes=new TextEncoder().encode(text);else{bytes=new Uint8Array((encoding===1?text.length:Array.from(text).length)*(encoding===1?2:4));const d=new DataView(bytes.buffer);if(encoding===1)for(let i=0;i<text.length;i++)d.setUint16(i*2,text.charCodeAt(i),true);else Array.from(text).forEach((c,i)=>d.setUint32(i*4,c.codePointAt(0),true));}
  assert.equal(f.BreakText(bytes,encoding,limit),[3,4,8][encoding]);assert.equal(f.BreakText(bytes,encoding,Infinity),bytes.length);
 }
 const glyphs=f.GetGlyphs(text),data=new Uint8Array(glyphs.buffer),out={};assert.equal(f.BreakText(data,3,limit,out),4);assert.equal(out.Text,null);
 const p=own(new S.SKPaint(f));p.TextEncoding=3;assert.equal(p.BreakText(data,limit),4);
 assert.throws(()=>f.BreakText(new Uint8Array([1]),3,100),/aligned/);
}));
