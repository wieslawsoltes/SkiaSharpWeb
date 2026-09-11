import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createCore} from '../dist/lib/core.js';
import {createPaths} from '../dist/lib/paths.js';
import {createFonts} from '../dist/lib/fonts.js';
import {createImages} from '../dist/lib/images.js';
import {createCanvasAPI} from '../dist/lib/canvas.js';
import {createFontScenes} from '../dist/font-samples.js';
const require=createRequire(import.meta.url),K=await require('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=createCore(K);Object.assign(S,createPaths(K,S));Object.assign(S,createFonts(K,S));Object.assign(S,createImages(K,S));Object.assign(S,createCanvasAPI(K,S));
const fixture=name=>fs.readFileSync(new URL('./fixtures/'+name,import.meta.url));
S.SKFontManager.Default.RegisterFont(fs.readFileSync(new URL('../dist/fonts/DejaVuSans.ttf',import.meta.url))).Dispose();
const raster=(face,text='A',size=100)=>{const f=new S.SKFont(face,size),p=new S.SKPaint({Color:S.SKColors.Black}),s=S.SKSurface.Create(new S.SKImageInfo(450,130));try{s.Canvas.Clear(S.SKColors.White);s.Canvas.DrawText(text,20,105,f,p);s.Flush();const image=s.Snapshot();try{return new Uint8Array(image.ReadPixels());}finally{image.Dispose();}}finally{f.Dispose();p.Dispose();s.Dispose();}};
test('advanced fonts: CFF and CFF2 cubic outlines match native glyph bounds',()=>{
 for(const name of ['CFF-Regular.otf','CFF2-Variable.otf']){const face=S.SKTypeface.FromData(fixture(name)),font=new S.SKFont(face,100);assert.ok(face);assert.ok(face.FontFormat.startsWith('CFF'));const gid=face.GetGlyph(65),path=font.GetGlyphPath(gid),native=font.GetGlyphBounds([gid])[0];assert.ok(path.PointCount>0);for(const key of ['Left','Top','Right','Bottom'])assert.ok(Math.abs(path.TightBounds[key]-native[key])<1);path.Dispose();font.Dispose();face.Dispose();}
});
test('advanced fonts: CFF2 variable instance produces changed outlines, metrics, and actual raster pixels',()=>{
 const face=S.SKTypeface.FromData(fixture('CFF2-Variable.otf')),args=new S.SKFontArguments().SetVariationDesignPosition({wght:900}),bold=face.Clone(args),font=new S.SKFont(bold,100);assert.equal(bold.FontFormat,'CFF2');assert.equal(font.MeasureText('A'),90);assert.deepEqual([...face.GetGlyphs('A')],[...bold.GetGlyphs('A')]);assert.notDeepEqual(raster(face),raster(bold));const roundTrip=S.SKTypeface.FromData(bold.Serialize());assert.deepEqual(raster(bold),raster(roundTrip));assert.equal(bold.GetVariationDesignPosition()[0].Value,900);roundTrip.Dispose();font.Dispose();bold.Dispose();face.Dispose();
});
test('advanced fonts: real Roboto Flex WOFF2 instances survive clone ownership and preserve glyph IDs',()=>{
 const source=S.SKTypeface.FromData(fixture('RobotoFlex-Variable.woff2'));assert.equal(source.FamilyName,'Roboto Flex');assert.equal(source.GetVariationDesignParameters()[0].TagName,'wght');const thin=source.Clone(new S.SKFontArguments().SetVariationDesignPosition({wght:100})),black=source.Clone(new S.SKFontArguments().SetVariationDesignPosition({wght:900}));assert.ok(black.GetTableData('glyf'));assert.deepEqual([...thin.GetGlyphs('Hello')],[...black.GetGlyphs('Hello')]);assert.notDeepEqual(raster(thin,'Hello',80),raster(black,'Hello',80));const thinFont=new S.SKFont(thin,100),blackFont=new S.SKFont(black,100);assert.ok(blackFont.MeasureText('Hello')>thinFont.MeasureText('Hello'));const ids=black.GetGlyphs('Aé'),paths=Array.from(ids,id=>blackFont.GetGlyphPath(id));assert.ok(paths.every(p=>p.PointCount>0));paths.forEach(p=>p.Dispose());source.Dispose();const copy=black.Clone(new S.SKFontArguments().SetVariationDesignPosition({wght:700}));assert.equal(copy.GetVariationDesignPosition()[0].Value,700);copy.Dispose();thinFont.Dispose();blackFont.Dispose();thin.Dispose();black.Dispose();
});
test('advanced fonts: WOFF and reference WOFF2 decode preserve exact color table bytes and rendering',()=>{
 const faces=['ColorFixture.ttf','ColorFixture.woff','ColorFixture.woff2'].map(n=>S.SKTypeface.FromData(fixture(n)));assert.ok(faces.every(Boolean));for(const face of faces.slice(1)){assert.deepEqual([...face.GetTableData('CPAL')],[...faces[0].GetTableData('CPAL')]);assert.deepEqual(raster(face),raster(faces[0]));}faces.forEach(f=>f.Dispose());
});
test('advanced fonts: palette selections and overrides change actual COLR rendering',()=>{
 const face=S.SKTypeface.FromData(fixture('ColorLayers.ttf')),green=face.Clone(new S.SKFontArguments().SetPalette({Index:1})),cyan=face.Clone(new S.SKFontArguments().SetPalette({Index:0,Overrides:[{Index:0,Color:S.SKColors.Cyan}]}));assert.equal(face.GetColorPalettes().length,2);assert.equal(green.GetColorPalettes()[0].Colors[0].Green,255);assert.equal(cyan.GetColorPalettes()[0].Colors[0].Blue,255);const layers=face.GetColorGlyphLayers(face.GetGlyph(65));assert.equal(layers.length,2);assert.equal(layers[0].PaletteIndex,0);assert.notDeepEqual(raster(face),raster(green));assert.notDeepEqual(raster(face),raster(cyan));assert.throws(()=>face.Clone(new S.SKFontArguments().SetPalette(10)),RangeError);cyan.Dispose();green.Dispose();face.Dispose();
});
test('advanced fonts: sbix bitmap data, signed offsets, SVG content, and Unicode enumeration',async()=>{
 const face=S.SKTypeface.FromData(fixture('ColorFixture.ttf')),g=face.GetGlyph(65),bitmap=face.GetGlyphBitmap(g,20);assert.equal(bitmap.Format,'png');assert.equal(bitmap.OriginX,-1);assert.equal(bitmap.PixelsPerEm,20);assert.deepEqual([...bitmap.Data.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.match(await face.GetGlyphSvgText(g),/viewBox="0 -700 500 700"/);assert.ok([...face.GetSupportedCodepoints()].includes(0x1f600));assert.equal(face.GetGlyphBitmap(face.GetGlyph(32)),null);face.Dispose();
});
test('advanced fonts: bounded font edits preserve originals and reject invalid axes/indices',()=>{
 const face=S.SKTypeface.FromData(fixture('ColorLayers.ttf')),without=face.WithTables(new Map([['COLR',null],['CPAL',null]]));assert.ok(face.IsColor);assert.equal(without.IsColor,false);assert.equal(without.GetTableSize('COLR'),0);assert.throws(()=>face.Clone(new S.SKFontArguments().SetVariationDesignPosition({wght:900})),/Unknown/);const variable=S.SKTypeface.FromData(fixture('RobotoFlex-Variable.woff2'));assert.throws(()=>variable.Clone(new S.SKFontArguments().SetVariationDesignPosition({wght:NaN})),/finite/);const clamped=variable.Clone(new S.SKFontArguments().SetVariationDesignPosition({wght:2000}));assert.equal(clamped.GetVariationDesignPosition()[0].Value,1000);clamped.Dispose();variable.Dispose();without.Dispose();face.Dispose();
});
test('advanced fonts: COLRv1 gradients expose the exact paint graph and render',()=>{
 const face=S.SKTypeface.FromData(fixture('ColorGradient.ttf')),graph=face.GetColorGlyphPaint(face.GetGlyph(65));assert.equal(graph.Format,10);assert.equal(graph.Paint.Format,4);assert.equal(graph.Paint.ColorLine.Stops.length,2);assert.equal(graph.Paint.X1,500);const pixels=raster(face);let red=0,blue=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]>pixels[i+2]+30)red++;if(pixels[i+2]>pixels[i]+30)blue++;}assert.ok(red>20&&blue>20);face.Dispose();
});
test('advanced fonts: CBDT format 17 returns decodable PNG bytes and complete strike metrics',()=>{
 const face=S.SKTypeface.FromData(fixture('ColorFixture.ttf')),gid=face.GetGlyph(65),png=face.GetGlyphBitmap(gid,20).Data;
 const cblc=new Uint8Array(80),v=new DataView(cblc.buffer),cbdt=new Uint8Array(13+png.length),d=new DataView(cbdt.buffer);v.setUint32(0,0x30000);v.setUint32(4,1);v.setUint32(8,56);v.setUint32(12,24);v.setUint32(16,1);v.setUint16(48,gid);v.setUint16(50,gid);cblc[52]=20;cblc[53]=20;cblc[54]=32;cblc[55]=1;v.setUint16(56,gid);v.setUint16(58,gid);v.setUint32(60,8);v.setUint16(64,1);v.setUint16(66,17);v.setUint32(68,4);v.setUint32(72,0);v.setUint32(76,9+png.length);d.setUint32(0,0x30000);cbdt.set([20,20,255,20,20],4);d.setUint32(9,png.length);cbdt.set(png,13);
 const bitmapFace=face.WithTables(new Map([['sbix',null],['CBLC',cblc],['CBDT',cbdt]]));assert.ok(bitmapFace);const image=bitmapFace.GetGlyphBitmap(gid,20);assert.equal(image.OriginX,-1);assert.equal(image.Width,20);assert.equal(image.Height,20);assert.deepEqual([...image.Data],[...png]);const decoded=S.SKImage.FromEncodedData(image.Data);assert.equal(decoded.Width,20);decoded.Dispose();bitmapFace.Dispose();face.Dispose();
});
const advanced=await createFontScenes(S,{loadBytes:url=>fixture(url.replace('fonts/',''))});
for(const scene of advanced.scenes)test('advanced font sample renders: '+scene.id,()=>{
 const surface=S.SKSurface.Create(new S.SKImageInfo(960,600));try{surface.Canvas.Clear(S.SKColor.Parse('#0E1823'));scene.draw(surface.Canvas,960,600,{weight:700,palette:1,time:2});surface.Flush();const image=surface.Snapshot();try{const png=image.Encode(S.SKEncodedImageFormat.Png,100);try{assert.ok(png.ToArray().length>3500);}finally{png.Dispose();}}finally{image.Dispose();}}finally{surface.Dispose();}
});
process.on('exit',()=>{advanced.Dispose();S.SKFontManager.Default.Dispose();});
