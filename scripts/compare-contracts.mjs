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
const report={assembly:reference.assembly,comparisons,failures,passed:failures.length===0,caseCounts:Object.fromEntries(['descriptors','measures','segments','pixels','glyphPaths'].map(k=>[k,reference[k].length]))};
console.log(JSON.stringify(report,null,2));if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
