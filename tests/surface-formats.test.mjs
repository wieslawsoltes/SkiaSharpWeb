import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
import {Initialize} from '../dist/lib/index.js';import {installSurfaceFormats} from '../dist/lib/surface-formats.js';
const dir=process.env.SKIA_TEST_ENGINE_DIRECTORY,K=await createRequire(import.meta.url)(dir?dir+'/canvaskit.cjs':'../dist/vendor/canvaskit.cjs')({wasmBinary:readFileSync(dir?dir+'/canvaskit.wasm':new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=await Initialize({CanvasKit:K,fonts:false,isolated:true});installSurfaceFormats(K,S);
const close=(a,b,epsilon=1e-5)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert(Math.abs(v-b[i])<epsilon,`component ${i}: ${v}, expected ${b[i]}`));};
test('F32 surfaces retain HDR, negative components and exact native pixel format',()=>{
 const info=new S.SKImageInfo(3,2,S.SKColorType.RgbaF32,S.SKAlphaType.Premul),surface=S.SKSurface.Create(info);assert(surface);assert.equal(surface.Info.ColorType,S.SKColorType.RgbaF32);assert.equal(surface.RowBytes,48);surface.Canvas.Clear(new S.SKColorF(2.125,-.25,.123456,.5));
 const straight=surface.Canvas.ReadPixels(info.WithAlphaType(S.SKAlphaType.Unpremul));assert(straight instanceof Float32Array);assert.equal(straight.length,24);close(straight.slice(0,4),[2.125,-.25,.123456,.5]);
 const premul=surface.ReadPixels();close(premul.slice(0,4),[1.0625,-.125,.061728,.5]);surface.Dispose();
});
test('F16 raster storage uses half-float pixels and preserves custom-stride padding',()=>{
 const destination=new Uint8Array(64).fill(0xcd),info=new S.SKImageInfo(3,2,S.SKColorType.RgbaF16,S.SKAlphaType.Premul),surface=S.SKSurface.Create(info,destination,32);assert(surface);surface.Canvas.Clear(new S.SKColorF(2.125,-.25,.125,1));assert(destination.every(x=>x===0xcd),'external copy becomes visible only at Flush');surface.Flush();const half=new Uint16Array(destination.buffer);for(const start of [0,16])assert.deepEqual(Array.from(half.slice(start,start+4)),[0x4040,0xb400,0x3000,0x3c00]);for(const start of [24,56])assert(destination.slice(start,start+8).every(x=>x===0xcd));surface.Dispose();
});
test('external buffer synchronization, pixmaps and release callbacks have explicit ownership',()=>{
 const bytes=new Uint8Array(48).fill(0xc7),info=new S.SKImageInfo(2,2,S.SKColorType.Rgba8888,S.SKAlphaType.Unpremul),token={name:'owner'};let calls=0;const surface=S.SKSurface.Create(info,bytes,16,(pixels,context)=>{assert.equal(pixels,bytes);assert.equal(context,token);calls++;},token);assert(surface);surface.Canvas.Clear(S.SKColors.Red);surface.Flush();assert.deepEqual(Array.from(bytes.slice(0,8)),[255,0,0,255,255,0,0,255]);bytes.set([0,255,0,255]);surface.NotifyPixelsChanged();assert(bytes.subarray(32).every(v=>v===0xc7));const image=surface.Snapshot(),pixmap=surface.PeekPixels();assert.equal(pixmap.RowBytes,16);assert.deepEqual(Array.from(pixmap.GetPixels().slice(0,4)),[0,255,0,255]);surface.Dispose();surface.Dispose();assert.equal(calls,1);assert.throws(()=>pixmap.GetPixels(),/disposed/i);const snapshot=image.ReadPixels(new S.SKImageInfo(2,2,S.SKColorType.Rgba8888,S.SKAlphaType.Unpremul));assert.deepEqual(Array.from(snapshot.slice(0,4)),[0,255,0,255]);image.Dispose();pixmap.Dispose();
});
test('borrowed Wasm allocations are drawn directly and remain caller-owned after disposal',()=>{
 const allocation=K.Malloc(Uint8Array,64);allocation.toTypedArray().fill(0x7b);const info=new S.SKImageInfo(2,2,S.SKColorType.Rgba8888,S.SKAlphaType.Premul),surface=S.SKSurface.Create(info,allocation,16);surface.Canvas.Clear(S.SKColors.Blue);assert.deepEqual(Array.from(allocation.toTypedArray().slice(0,4)),[0,0,255,255]);assert.equal(surface.PixelStorage,'borrowed-wasm-buffer');surface.Dispose();assert.deepEqual(Array.from(allocation.toTypedArray().slice(0,4)),[0,0,255,255]);K.Free(allocation);
});
test('native surface properties, alpha type and color space remain effective after caller disposal',()=>{
 const space=S.SKColorSpace.CreateSrgbLinear(),props=new S.SKSurfaceProperties(S.SKSurfacePropsFlags.UseDeviceIndependentFonts,S.SKPixelGeometry.BgrHorizontal),info=new S.SKImageInfo(2,1,S.SKColorType.RgbaF32,S.SKAlphaType.Premul,space),surface=S.SKSurface.Create(info,props);props.Dispose();space.Dispose();const actual=surface.SurfaceProperties;assert.equal(actual.Flags,S.SKSurfacePropsFlags.UseDeviceIndependentFonts);assert.equal(actual.PixelGeometry,S.SKPixelGeometry.BgrHorizontal);actual.Dispose();surface.Canvas.Clear(new S.SKColorF(.5,.5,.5,1));const values=surface.ReadPixels(surface.Info);close(values.slice(0,4),[.21404114,.21404114,.21404114,1],.0002);surface.Dispose();
});
test('alpha-only and RGB565 raster formats use actual native storage',()=>{
 const alpha=S.SKSurface.Create(new S.SKImageInfo(3,2,S.SKColorType.Alpha8,S.SKAlphaType.Premul));assert(alpha);alpha.Canvas.Clear(new S.SKColorF(1,0,0,.5));assert.equal(alpha.RowBytes,3);assert.deepEqual(Array.from(alpha.GetPixels()),[128,128,128,128,128,128]);alpha.Dispose();const rgb=S.SKSurface.Create(new S.SKImageInfo(2,1,S.SKColorType.Rgb565,S.SKAlphaType.Opaque));assert(rgb);rgb.Canvas.Clear(S.SKColors.Red);assert.deepEqual(Array.from(new Uint16Array(rgb.GetPixels().buffer,rgb.GetPixels().byteOffset,2)),[0xf800,0xf800]);rgb.Dispose();
});
test('custom-stride readback preserves destination padding and does not overread F32 allocations',()=>{
 const surface=S.SKSurface.Create(new S.SKImageInfo(2,2,S.SKColorType.RgbaF32)),destination=new Uint8Array(96).fill(0xda),info=new S.SKImageInfo(2,2,S.SKColorType.RgbaF32,S.SKAlphaType.Premul);surface.Canvas.Clear(new S.SKColorF(.123456,.234567,.345678,1));assert(surface.ReadPixels(info,destination,48,0,0));for(const start of [32,80])assert(destination.slice(start,start+16).every(v=>v===0xda));close(new Float32Array(destination.buffer).slice(0,4),[.123456,.234567,.345678,1]);assert.equal(surface.Canvas.ReadPixels(info).byteLength,64);assert.throws(()=>S.SKSurface.Create(info,new Uint8Array(10),32),/smaller/);assert.throws(()=>S.SKSurface.Create(info,31),/Row bytes/);surface.Dispose();
});
test('native table, gamma, clip and shader mask filters affect geometric coverage',()=>{
 assert.equal(S.SKMaskFilter.TableMaxLength,256);const surface=S.SKSurface.Create(new S.SKImageInfo(20,20)),shader=S.SKShader.CreateColor(new S.SKColorF(1,1,1,.25));
 for(const [filter,expected] of [[S.SKMaskFilter.CreateTable(new Uint8Array(256).fill(64)),64],[S.SKMaskFilter.CreateGamma(2),255],[S.SKMaskFilter.CreateClip(0,128),255],[S.SKMaskFilter.CreateShader(shader),64]]){surface.Canvas.Clear(S.SKColors.Transparent);const paint=new S.SKPaint({Color:S.SKColors.Red,MaskFilter:filter});surface.Canvas.DrawRect(2,2,16,16,paint);const p=surface.Canvas.ReadPixels(new S.SKImageInfo(20,20,S.SKColorType.Rgba8888,S.SKAlphaType.Unpremul));assert(Math.abs(p[(10*20+10)*4+3]-expected)<=1);paint.Dispose();filter.Dispose();}shader.Dispose();surface.Dispose();assert.throws(()=>S.SKMaskFilter.CreateTable([0]),/256/);
});

test('extended native formats expose accurate borrowed pixmap descriptors',()=>{
 for(const [name,bpp] of [['Alpha16',2],['AlphaF16',2],['R8Unorm',1],['Rg1616',4],['Rgba16161616',8]]){const info=new S.SKImageInfo(3,2,S.SKColorType[name],S.SKAlphaType.Premul),surface=S.SKSurface.Create(info);assert(surface,name);surface.Canvas.Clear(S.SKColors.Red);const pixels=surface.PeekPixels();assert.equal(pixels.RowBytes,3*bpp,name);assert.equal(pixels.GetPixels().byteLength,6*bpp,name);assert.equal(pixels.Info.ColorType,S.SKColorType[name],name);pixels.Dispose();surface.Dispose();}
});

test('raster overloads accept pixmaps, rowBytes, options and null release delegates',()=>{
 const info=new S.SKImageInfo(2,2,S.SKColorType.Rgba8888,S.SKAlphaType.Premul),props=new S.SKSurfaceProperties(0,S.SKPixelGeometry.RgbVertical),pixels=new Uint8Array(32),pixmap=new S.SKPixmap(info,pixels,16);
 for(const surface of [S.SKSurface.Create(info,16,props),S.SKSurface.Create(info,pixels,16,null,{owner:true},props),S.SKSurface.Create(info,{pixels,rowBytes:16,props}),S.SKSurface.Create(pixmap,props)]){assert(surface);assert.equal(surface.RowBytes,16);assert.equal(surface.SurfaceProperties.PixelGeometry,S.SKPixelGeometry.RgbVertical);surface.Canvas.Clear(S.SKColors.Red);surface.Dispose();}
 pixmap.Dispose();props.Dispose();
});
