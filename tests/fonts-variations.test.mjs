import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createCore} from '../dist/lib/core.js';
import {createPaths} from '../dist/lib/paths.js';
import {createFonts} from '../dist/lib/fonts.js';
const require=createRequire(import.meta.url),K=await require('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const S=createCore(K);Object.assign(S,createPaths(K,S));Object.assign(S,createFonts(K,S));
const fixture=name=>new Uint8Array(fs.readFileSync(new URL('./fixtures/'+name,import.meta.url)));
const view=(face,tag)=>{const bytes=face.GetTableData(tag);return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);};
const instance=(face,wght)=>face.Clone(new S.SKFontArguments().SetVariationDesignPosition({wght}));
const expected=JSON.parse(new TextDecoder().decode(fixture('variation-metrics-expected.json')));
const metricsSource=S.SKTypeface.FromData(fixture('VariationMetrics.ttf'));
const shape=(face,text)=>{const shaper=new S.SKShaper(face),font=new S.SKFont(face,100),run=shaper.Shape(text,font);try{return {Glyphs:[...run.Glyphs],Width:run.Width,Points:run.Points.map(p=>[p.X,p.Y])};}finally{run.Dispose();shaper.Dispose();font.Dispose();}};
const raster=face=>{const font=new K.Font(face._native,100),surface=K.MakeSurface(100,120),paint=new K.Paint();paint.setColor(K.BLACK);surface.getCanvas().clear(K.WHITE);surface.getCanvas().drawText('A',15,105,paint,font);surface.flush();const image=surface.makeImageSnapshot();try{return new Uint8Array(image.readPixels(0,0,{width:100,height:120,colorType:K.ColorType.RGBA_8888,alphaType:K.AlphaType.Unpremul,colorSpace:K.ColorSpace.SRGB}));}finally{image.delete();font.delete();surface.delete();paint.delete();}};
for(const weight of [100,500,900]){
 test(`font instancing: MVAR global metrics match fontTools reference at weight ${weight}`,()=>{
  const face=instance(metricsSource,weight),m=expected[weight],os=view(face,'OS/2'),post=view(face,'post'),vh=view(face,'vhea');assert.equal(os.getInt16(86),m.xHeight);assert.equal(os.getInt16(88),m.capHeight);assert.equal(os.getInt16(68),m.typoAscent);assert.equal(os.getInt16(72),m.typoLineGap);assert.equal(post.getInt16(8),m.underlinePosition);assert.equal(post.getInt16(10),m.underlineThickness);assert.equal(vh.getInt16(4),m.vheaAscent);assert.equal(vh.getInt16(8),m.vheaLineGap);assert.equal(face.GetTableSize('MVAR'),0);face.Dispose();
 });
 test(`font instancing: VVAR advances and top bearings match reference at weight ${weight}`,()=>{
  const face=instance(metricsSource,weight),reference=S.SKTypeface.FromData(fixture(`VariationMetrics-${weight}.ttf`)),vh=view(face,'vhea'),rm=view(reference,'vmtx'),rh=view(reference,'vhea'),vm=view(face,'vmtx');const metric=(v,n,g)=>[v.getUint16(Math.min(g,n-1)*4),v.getInt16(g<n?g*4+2:n*4+(g-n)*2)];for(let gid=0;gid<face.GlyphCount;gid++)assert.deepEqual(metric(vm,vh.getUint16(34),gid),metric(rm,rh.getUint16(34),gid));assert.equal(face.GetTableSize('VVAR'),0);reference.Dispose();face.Dispose();
 });
 test(`font instancing: GPOS/GDEF kerning and mark anchors match native reference shaping at weight ${weight}`,()=>{
  const face=instance(metricsSource,weight),reference=S.SKTypeface.FromData(fixture(`VariationMetrics-${weight}.ttf`));for(const text of ['AV','A\u0301','VA\u0301V'])assert.deepEqual(shape(face,text),shape(reference,text));reference.Dispose();face.Dispose();
 });
 test(`font instancing: COLRv1 variable gradient and alpha match reference raster at weight ${weight}`,()=>{
  const source=S.SKTypeface.FromData(fixture('VariationColor.ttf')),face=instance(source,weight),reference=S.SKTypeface.FromData(fixture(`VariationColor-${weight}.ttf`));assert.equal(Buffer.compare(raster(face),raster(reference)),0,'instanced color glyph must match independently authored static target');const graph=face.GetColorGlyphPaint(face.GetGlyph(65));assert.equal(graph.Paint.Format,4);assert.equal(graph.Paint.X1,300+(weight-100)/800*300);assert.equal(graph.Paint.ColorLine.Stops[0].Alpha,1-(weight-100)/800*.5);reference.Dispose();face.Dispose();source.Dispose();
 });
}
test('font instancing: GSUB feature variations select alternate glyph only within its design region',()=>{
 const regular=instance(metricsSource,100),bold=instance(metricsSource,900);assert.equal(shape(regular,'A').Glyphs[0],regular.GetGlyph(65));assert.notEqual(shape(bold,'A').Glyphs[0],bold.GetGlyph(65));assert.equal(shape(bold,'A').Glyphs[0],5);regular.Dispose();bold.Dispose();
});
process.on('exit',()=>{metricsSource.Dispose();S.SKFontManager.Default.Dispose();});
