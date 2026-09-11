/** Consume an independently executed .NET corpus, never JS-generated expectations. */
import fs from 'node:fs';import {createRequire}from'node:module';import{Initialize}from'../dist/lib/index.js';
const reference=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(reference.format!==2||!reference.assembly.startsWith('SkiaSharp,'))throw Error('Expected the .NET contract corpus.');
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,isolated:true,fonts:[{family:'DejaVu Sans',data:fs.readFileSync(new URL('../dist/fonts/DejaVuSans.ttf',import.meta.url))}]});
const failures=[];let comparisons=0;
const numeric=v=>v==='NaN'?NaN:v==='Infinity'?Infinity:v==='-Infinity'?-Infinity:v;
function check(actual,expected,path) {
 if(Array.isArray(expected)){if(actual?.length!==expected.length){failures.push({path,actual,expected});return;}expected.forEach((v,i)=>check(actual[i],v,path+'/'+i));return;}
 if(expected!==null&&typeof expected==='object'){for(const [key,v]of Object.entries(expected))check(actual?.[key],v,path+'/'+key);return;}
 comparisons++;
 if(typeof actual==='bigint')actual=actual.toString();
 let same=Object.is(actual,expected);
 if(typeof actual==='number') {const e=numeric(expected);same=Object.is(actual,e)||Number.isFinite(actual)&&Number.isFinite(e)&&Math.abs(actual-e)<=.0002+Math.abs(e)*.0002;}
 if(!same&&failures.length<200)failures.push({path,actual,expected});
}
for(const [i,c]of reference.descriptors.entries()) {
 const Type=S[c.name];if(!Type){failures.push({path:'descriptor/'+c.name,error:'Missing constructor'});continue;}
 let value;
 if(c.input===null)value=new Type();else if(Type.FromJSON)value=Type.FromJSON(c.input);else{value=new Type();Object.assign(value,c.input);}
 for(const [key,expected]of Object.entries(c.values))check(value[key],expected,'descriptor/'+i+'/'+key);
 if(value.Clone){const clone=value.Clone();check(value.Equals(clone),true,'descriptor/'+i+'/cloneEquals');check(value.GetHashCode()===clone.GetHashCode(),true,'descriptor/'+i+'/hashInvariant');}
}
for(const [i,c]of reference.measures.entries()){
 const path=new S.SKPath();if(c.i!==0){path.MoveTo(10,20).LineTo(40+c.i,60);if(c.i%2===0)path.QuadTo(80,100,100,10);path.MoveTo(3,5).LineTo(30,41);}
 const m=new S.SKPathMeasure(path,c.force);path.Dispose();
 try{for(const [j,contour]of c.contours.entries()){check(m.Length,contour.length,`measure/${i}/${j}/length`);check(m.IsClosed,contour.closed,`measure/${i}/${j}/closed`);for(const [k,s]of contour.samples.entries()){const d=numeric(s.distance);check(!!m.GetPositionAndTangent(d),s.ok,`measure/${i}/${j}/${k}/ok`);check(m.GetPosition(d).ToArray(),s.position,`measure/${i}/${j}/${k}/position`);check(m.GetTangent(d).ToArray(),s.tangent,`measure/${i}/${j}/${k}/tangent`);s.matrices.forEach((expected,f)=>check(m.GetMatrix(d,f).Values,expected,`measure/${i}/${j}/${k}/matrix/${f}`));}check(m.NextContour(),j<c.contours.length-1,`measure/${i}/${j}/next`);}}finally{m.Dispose();}
}
for(const [i,c]of reference.segments.entries()){
 const source=new S.SKPath().MoveTo(10,10).LineTo(100,10),m=new S.SKPathMeasure(source),d=new(c.builder?S.SKPathBuilder:S.SKPath)().MoveTo(1,1).LineTo(2,3);
 try{check(m.GetSegment(10,40,d,c.move),c.result,'segment/'+i+'/result');check(d.Points.map(p=>p.ToArray()),c.points,'segment/'+i+'/points');check(d.VerbCount,c.verbs,'segment/'+i+'/verbs');}finally{source.Dispose();m.Dispose();d.Dispose();}
}
for(const [i,c]of reference.pixels.entries()){
 const type=S.SKColorType[c.color];if(!type){failures.push({path:'pixels/'+i,error:'Unknown format '+c.color});continue;}
 const p=new S.SKPixmap(new S.SKImageInfo(3,2,type,K.AlphaType[c.alpha]),Buffer.from(c.data,'base64'),c.rowBytes);
 try{const values=[];for(let y=0;y<2;y++)for(let x=0;x<3;x++)values.push(p.GetPixelAlpha(x,y));check(values,c.values,'pixels/'+i+'/alpha');check(p.ComputeIsOpaque(),c.opaque,'pixels/'+i+'/opaque');}finally{p.Dispose();}
}
if(!S.SKFont.HasCanonicalPathCallbacks)failures.push({path:'fontPaths',error:'New native canonical callback extension not loaded'});
else for(const [i,c]of reference.glyphPaths.entries()){
 const font=new S.SKFont(null,c.size,c.scale,c.skew),rows=[];
 try{font.GetGlyphPaths(c.glyphs,(p,m)=>rows.push({hasPath:p!==null,matrix:m.Values,points:p?.Points.map(p=>p.ToArray())??null,verbs:p?.VerbCount??null}));check(rows,c.rows,'fontPaths/'+i);}finally{font.Dispose();}
}
const geometry=p=>p===null?null:{points:p.Points.map(p=>p.ToArray()),verbs:p.VerbCount,fill:p.FillType?.value??p.FillType,bounds:p.Bounds.ToArray()};
function follow(shape){const p=new S.SKPath();if(shape===0)return p;p.MoveTo(0,60);if(shape===1)p.LineTo(260,60);if(shape===2)p.QuadTo(110,-40,260,60);if(shape===3)p.ConicTo(120,-60,260,60,.6);if(shape>=4)p.CubicTo(80,-30,190,150,260,60);if(shape===5)p.MoveTo(280,30).LineTo(550,30);return p;}
if(!S.SKPaint.HasNativePathExpansion)failures.push({path:'paint',error:'Native path expansion is required'});
for(const [i,c]of(reference.fillPaths??[]).entries()){
 const p=new S.SKPaint({Style:c.style,StrokeWidth:c.width,StrokeCap:1,StrokeJoin:2,StrokeMiter:3}),source=follow(4).LineTo(-40,35),dst=new S.SKPath().MoveTo(999,998),b=new S.SKPathBuilder(dst);let result;
 try{const pe=c.effect===1?S.SKPathEffect.CreateDash([7,3],2):c.effect===2?S.SKPathEffect.CreateCorner(9):null;p.PathEffect=pe;pe?.Dispose();
  const cull=new S.SKRect(0,0,120,100),m=S.SKMatrix.CreateScale(1.25,.75),suffix=[[],[2],[m],[cull],[cull,2],[cull,m]][c.form];
  result=p.GetFillPath(source,...suffix);check(geometry(result),c.result,'fill/'+i+'/return');check(p.GetFillPath(source,dst,...suffix),c.pathOk,'fill/'+i+'/pathOk');check(geometry(dst),c.destination,'fill/'+i+'/destination');check(p.GetFillPath(source,b,...suffix),c.builderOk,'fill/'+i+'/builderOk');check(geometry(b),c.builder,'fill/'+i+'/builder');
 }finally{result?.Dispose();p.Dispose();source.Dispose();dst.Dispose();b.Dispose();}
}
for(const [i,c]of(reference.fastBounds??[]).entries()){
 const p=new S.SKPaint({Style:c.style,StrokeWidth:5,StrokeJoin:0,StrokeMiter:3}),stamp=new S.SKPath().AddCircle(0,0,3),out=new S.SKRect();let effect;
 try{if(c.effect===1)p.MaskFilter=effect=S.SKMaskFilter.CreateBlur(S.SKBlurStyle.Normal,3);if(c.effect===2)p.ImageFilter=effect=S.SKImageFilter.CreateBlur(2,4);if(c.effect===3)p.PathEffect=effect=S.SKPathEffect.CreateDash([7,3],2);if(c.effect===4)p.PathEffect=effect=S.SKPathEffect.Create1DPath(stamp,10,0,0);
  check(p.GetFastBounds(new S.SKRect(10,20,50,80),out),c.ok,'fastBounds/'+i+'/ok');check(out.ToArray(),c.bounds,'fastBounds/'+i+'/bounds');
 }finally{effect?.Dispose();p.Dispose();stamp.Dispose();}
}
for(const [i,c]of(reference.textPaths??[]).entries()){
 const font=new S.SKFont(null,c.size,c.scale,.15),path=follow(c.shape),origin=new S.SKPoint(c.ox,3),glyphs=font.GetGlyphs(c.text),widths=font.GetGlyphWidths(glyphs),positions=[];let x=Math.fround(c.ox),a,b;
 for(const w of widths){positions.push(new S.SKPoint(x,3));x=Math.fround(x+w);}
 try{a=font.GetTextPathOnPath(c.text,path,c.align,origin);b=font.GetTextPathOnPath(glyphs,widths,positions,path,c.align);check(geometry(a),c.result,'textPath/'+i+'/string');check(geometry(b),c.explicitResult,'textPath/'+i+'/glyphs');}
 finally{a?.Dispose();b?.Dispose();font.Dispose();path.Dispose();}
}
for(const [i,c]of(reference.textBreaks??[]).entries()){
 const font=new S.SKFont(null,c.size,c.scale,.15),out={};
 try{const limit=numeric(c.limit);check(font.BreakText(c.text,limit,out),c.count,'break/'+i+'/string/count');check(out.Value,c.width,'break/'+i+'/string/width');
  for(const form of c.forms){check(font.BreakText(Buffer.from(form.bytes,'base64'),form.encoding,limit,out),form.count,'break/'+i+'/'+form.encoding+'/count');check(out.Value,form.width,'break/'+i+'/'+form.encoding+'/width');}
 }finally{font.Dispose();}
}

const report={assembly:reference.assembly,comparisons,failures,passed:failures.length===0,caseCounts:Object.fromEntries(['descriptors','measures','segments','pixels','glyphPaths','fillPaths','fastBounds','textPaths','textBreaks'].map(k=>[k,reference[k]?.length??0]))};
console.log(JSON.stringify(report,null,2));if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
