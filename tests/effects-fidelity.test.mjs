import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createCore} from '../dist/lib/core.js';
import {createPaths} from '../dist/lib/paths.js';
import {createRegions} from '../dist/lib/regions.js';
import {createEffectExtensions} from '../dist/lib/effects.js';
import {createPathEffectExtensions} from '../dist/lib/path-effects.js';
import {createCanvasAPI} from '../dist/lib/canvas.js';
import {installLayerEffects} from '../dist/lib/layer-effects.js';
const engineDirectory=process.env.SKIA_TEST_ENGINE_DIRECTORY;
const K=await createRequire(import.meta.url)(engineDirectory?engineDirectory+'/canvaskit.cjs':'../dist/vendor/canvaskit.cjs')({wasmBinary:readFileSync(engineDirectory?engineDirectory+'/canvaskit.wasm':new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=createCore(K);for(const create of [createPaths,createRegions,createEffectExtensions,createPathEffectExtensions,createCanvasAPI])Object.assign(S,create(K,S));installLayerEffects(K,S);
const forceSoftware=fn=>{const native=K.SkiaSharpNative?.Effects;if(native)K.SkiaSharpNative.Effects=undefined;try{return fn();}finally{if(native)K.SkiaSharpNative.Effects=native;}};
const fixture=JSON.parse(readFileSync(new URL('./effects-fixtures/native-reference.json',import.meta.url)));
const hex=data=>Buffer.from(data.ToArray?.()??data).toString('hex');
const identity=[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0];
test('Float32 filter chains retain sub-byte increments and premultiplied interpolation',()=>{
 const m=identity.slice();m[14]=.0001;const increment=S.SKColorFilter.CreateHslaColorMatrix(m);let chain=increment;
 for(let i=1;i<20;i++){const next=S.SKColorFilter.CreateCompose(increment,chain);if(chain!==increment)chain.Dispose();chain=next;}
 const input=Float32Array.of(.25,.25,.25,1),result=chain.ApplyFloatPixels(input);
 assert(Math.abs(result[0]-.252)<3e-6);assert(result[0]!==Math.round(result[0]*255)/255);
 const finalBytes=chain.ApplyPixels(Uint8Array.of(64,64,64,255));assert.equal(finalBytes[0],65);
 assert.deepEqual(input,Float32Array.of(.25,.25,.25,1));chain.Dispose();increment.Dispose();
});
test('native and software filter boundaries retain Float32 input precision',()=>{
 const n=S.SKColorFilter.CreateColorMatrix(identity),soft=S.SKColorFilter.CreateHslaColorMatrix(identity),both=S.SKColorFilter.CreateCompose(soft,n),p=Float32Array.of(.123456,.234567,.345678,.456789),result=both.ApplyFloatPixels(p);
 for(let i=0;i<4;i++)assert(Math.abs(result[i]-p[i])<3e-6);n.Dispose();soft.Dispose();both.Dispose();
});
test('high contrast uses the native linear-light working format',()=>{
 const toLinear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4,toSrgb=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
 const f=forceSoftware(()=>S.SKColorFilter.CreateHighContrast(false,S.SKHighContrastConfigInvertStyle.InvertBrightness,0)),input=Float32Array.of(.1,.4,.8,.12345),result=f.ApplyFloatPixels(input);
 for(let i=0;i<3;i++)assert(Math.abs(result[i]-toSrgb(1-toLinear(input[i])))<2e-6);assert(Math.abs(result[3]-input[3])<1e-7);f.Dispose();
});
test('native F32 surfaces preserve HDR color through software layers and re-use released buffers',()=>{
 const surface=S.makeEffectSurface(8,8),canvas=new S.SKCanvas(surface.getCanvas(),{Width:8,Height:8}),matrix=forceSoftware(()=>S.SKColorFilter.CreateHslaColorMatrix(identity)),paint=new S.SKPaint({ColorFilter:matrix}),red=new S.SKPaint({Color:new S.SKColorF(.123456,.234567,.345678,1)});
 const before=S.EffectDiagnostics.SurfaceAllocations;canvas.SaveLayer({Paint:paint,Flags:16});canvas.DrawRect(0,0,8,8,red);canvas.Restore();let values=S.readEffectPixels(surface.getCanvas(),8,8);assert(Math.abs(values[0]-.123456)<3e-6);
 canvas.SaveLayer({Paint:paint,Flags:16});canvas.DrawRect(0,0,8,8,red);canvas.Restore();assert(S.EffectDiagnostics.SurfaceReuses>0);assert(S.EffectDiagnostics.SurfaceAllocations<=before+1);canvas.Dispose();surface.dispose();paint.Dispose();red.Dispose();matrix.Dispose();S.PurgeEffectCache();
});
test('native region serialization roundtrips actual SkRegion bytes including vertical gaps',()=>{
 const region=new S.SKRegion();region.SetRects([[10,10,20,20],[30,10,40,20],[15,30,25,40]].map(r=>new S.SKRectI(...r)));assert.equal(hex(region.Serialize()),fixture.complexRegionHex);
 const decoded=S.SKRegion.Deserialize(Uint8Array.from(Buffer.from(fixture.complexRegionHex,'hex')));assert(decoded.Equals(region));
 const legacy=region.SerializePortable(),legacyDecoded=S.SKRegion.Deserialize(legacy);assert(legacyDecoded.Equals(region));region.Dispose();decoded.Dispose();legacyDecoded.Dispose();
});
test('36 native scan-conversion references match curve, winding and inverse regions exactly',()=>{
 for(const [index,f] of fixture.regions.entries()){const path=new S.SKPath();if(f.kind==='circle')path.AddCircle(f.x,f.y,f.r);else{path.MoveTo(...f.points.slice(0,2));if(f.kind==='cubic')path.CubicTo(...f.points.slice(2));else for(let j=2;j<f.points.length;j+=2)path.LineTo(...f.points.slice(j,j+2));path.Close();}path.FillType=K.FillType.values[f.fill];
 const clip=new S.SKRegion(new S.SKRectI(-16,-16,32,32)),region=new S.SKRegion();region.SetPath(path,clip);assert.deepEqual([...region].map(r=>r.ToArray()),f.rects,`native fixture ${index}`);assert.equal(hex(region.Serialize()),f.serialized,`native serialization fixture ${index}`);region.Dispose();clip.Dispose();path.Dispose();}
});
test('corner effect preserves native Bezier verbs and matches independent native Skia output',()=>{
 for(const [index,f] of fixture.corners.entries()){const path=new S.SKPath();for(const [verb,...args] of f.commands){if(verb===0)path.MoveTo(...args);else if(verb===1)path.LineTo(...args);else if(verb===2)path.QuadTo(...args);else if(verb===4)path.CubicTo(...args);else path.Close();}const effect=S.SKPathEffect.CreateCorner(f.radius),result=S.applyPathEffect(path,effect),actual=Array.from(result._native.toCmds()),expected=f.expected.flat();assert.equal(actual.length,expected.length,`corner fixture ${index} verbs`);for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<1e-5,`corner fixture ${index} value ${i}: ${actual[i]} expected ${expected[i]}`);result.Dispose();effect.Dispose();path.Dispose();}
});
test('image-filter crop and convolution follow translated and scaled local coordinates',()=>{
 const surface=S.SKSurface.Create(new S.SKImageInfo(80,40)),c=surface.Canvas,crop=S.SKImageFilter.CreateCrop(new S.SKRect(2,2,8,8)),paint=new S.SKPaint({Color:S.SKColors.Red,ImageFilter:crop});c.Clear(S.SKColors.Blue);c.Translate(20,10);c.Scale(2,2);c.DrawRect(0,0,20,20,paint);let data=c.ReadPixels(new S.SKImageInfo(80,40,S.SKColorType.Rgba8888,S.SKAlphaType.Unpremul));const pix=(x,y)=>Array.from(data.slice((y*80+x)*4,(y*80+x)*4+4));assert.deepEqual(pix(25,15),[255,0,0,255]);assert.deepEqual(pix(22,15),[0,0,255,255]);assert.deepEqual(pix(37,15),[0,0,255,255]);paint.Dispose();crop.Dispose();surface.Dispose();
});
test('software color capture allocates only device-clip bounds',()=>{
 S.PurgeEffectCache();const surface=S.SKSurface.Create(new S.SKImageInfo(1200,800)),c=surface.Canvas,f=forceSoftware(()=>S.SKColorFilter.CreateTable(Array.from({length:256},(_,i)=>i))),paint=new S.SKPaint({Color:S.SKColors.Red,ColorFilter:f});S.EffectDiagnostics.PeakCapturePixels=0;c.ClipRect(new S.SKRect(300,200,320,230));c.DrawRect(0,0,1200,800,paint);assert.equal(S.EffectDiagnostics.PeakCapturePixels,600);const data=c.ReadPixels(new S.SKImageInfo(1200,800,S.SKColorType.Rgba8888,S.SKAlphaType.Unpremul));assert.equal(data[(210*1200+310)*4],255);surface.Dispose();paint.Dispose();f.Dispose();S.PurgeEffectCache();
});
