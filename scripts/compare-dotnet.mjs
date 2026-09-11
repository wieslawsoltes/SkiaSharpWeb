/** Compare an independently executed .NET corpus to the shipped JS/WASM API. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Initialize} from '../dist/lib/index.js';
const input=process.argv[2];if(!input)throw new Error('Usage: node scripts/compare-dotnet.mjs reference.json [report.json]');
const reference=JSON.parse(readFileSync(input,'utf8'));
if(reference.format!==1||!reference.assembly?.startsWith('SkiaSharp,'))throw new Error('Unrecognized independent reference corpus');
const K=await createRequire(import.meta.url)('../dist/vendor/canvaskit.cjs')({wasmBinary:readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});
let comparisons=0;const failures=[];
function check(actual,expected,path){
  if(Array.isArray(expected)){if(!actual||actual.length!==expected.length){failures.push({path,actual,expected});return;}for(let i=0;i<expected.length;i++)check(actual[i],expected[i],path+'['+i+']');return;}
  comparisons++;
  const same=typeof expected==='number'?Number.isFinite(actual)&&Math.abs(actual-expected)<=.0002+Math.abs(expected)*.001:actual===expected;
  if(!same&&failures.length<200)failures.push({path,actual,expected});
}
for(const [i,f]of reference.matrices.entries()){
  const a=new S.SKMatrix(f.input),b=new S.SKMatrix(f.other),r=new S.SKRect(...f.rectangle),other=new S.SKRect(...f.otherRectangle),point=new S.SKPoint(...f.point);
  const inv=new S.SKMatrix(),invertible=a.TryInvert(inv),expected=f.expected,p='matrix/'+i+'/';
  check(invertible,expected.invertible,p+'invertible');if(invertible)check(inv.Values,expected.inverse,p+'inverse');
  check(a.MapPoint(point).ToArray(),expected.mappedPoint,p+'point');check(a.MapVector(point).ToArray(),expected.mappedVector,p+'vector');
  check(a.MapRect(r).ToArray(),expected.mappedRect,p+'bounds');check(a.MapRadius(3),expected.radius,p+'radius');
  check(a.PreConcat(b).Values,expected.pre,p+'pre');check(a.PostConcat(b).Values,expected.post,p+'post');
  check(S.SKRect.Intersect(r,other).ToArray(),expected.intersection,p+'intersection');check(r.Contains(point.X,point.Y),expected.contains,p+'contains');check(r.IntersectsWith(other),expected.intersects,p+'intersects');
}
for(const [i,f]of reference.paths.entries()){
  const a=new S.SKPath(),b=new S.SKPath();let result;
  try{a.AddRect(new S.SKRect(...f.rectangle));b.AddCircle(...f.circle);result=a.Op(b,S.SKPathOp[f.operation]);
    check(result.IsEmpty,f.empty,'path/'+i+'/empty');check(result.Bounds.ToArray(),f.bounds,'path/'+i+'/bounds');
    for(const [j,s]of f.samples.entries())check(result.Contains(...s.point),s.contains,'path/'+i+'/contains/'+j);
  }finally{result?.Dispose();a.Dispose();b.Dispose();}
}
const report={assembly:reference.assembly,seed:reference.seed,matrices:reference.matrices.length,pathOperations:reference.paths.length,comparisons,tolerance:{absolute:.0002,relative:.001},failureCount:failures.length,failures,passed:failures.length===0};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
