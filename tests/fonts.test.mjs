import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createCore} from '../dist/lib/core.js';
import {createPaths} from '../dist/lib/paths.js';
import {createFonts} from '../dist/lib/fonts.js';
const require=createRequire(import.meta.url);
const K=await require('../dist/vendor/canvaskit.cjs')({wasmBinary:fs.readFileSync(new URL('../dist/vendor/canvaskit.wasm',import.meta.url))});
const core=createCore(K);Object.assign(core,createPaths(K,core));const F=createFonts(K,core);
const bytes=fs.readFileSync(new URL('../dist/fonts/DejaVuSans.ttf',import.meta.url));
const boldBytes=fs.readFileSync(new URL('../dist/fonts/DejaVuSans-Bold.ttf',import.meta.url));
const {SKFontManager,SKTypeface,SKFontStyle,SKFont,SKTextBlob,SKTextBlobBuilder,SKParagraphBuilder,SKShaper}=F;
let groups=0;
function test(name,fn){fn();groups++;console.log('PASS',name);}
test('font decoding, metadata, exact table bytes and ownership',()=>{
  const face=SKTypeface.FromData(bytes);assert.equal(face.FamilyName,'DejaVu Sans');assert.equal(face.UnitsPerEm,2048);assert.ok(face.GlyphCount>5000);assert.ok(face.TableCount>15);assert.equal(face.GetTableData('head').length,face.GetTableSize('head'));assert.ok(face.GetTableTags().includes(0x68656164));assert.equal(face.PostScriptName,'DejaVuSans');
  const font=new SKFont(face,32);face.Dispose();assert.ok(font.MeasureText('Hello')>50);font.Dispose();font.Dispose();assert.throws(()=>font.GetGlyphs('A'),/disposed/);
});
const regular=SKFontManager.Default.RegisterFont(bytes);
const bold=SKFontManager.Default.RegisterFont(boldBytes);
test('font manager families, styles, character fallback',()=>{
  assert.equal(SKFontManager.Default.FontFamilyCount,1);const set=SKFontManager.Default.GetFontStyles('DejaVu Sans');assert.equal(set.Count,2);assert.equal(set[0].Weight,400);assert.ok(set.GetStyleName(0));assert.equal([...set][1].Weight,700);set.Dispose();const regularMatch=SKFontManager.Default.MatchFamily('DejaVu Sans');assert.equal(regularMatch.IsBold,false);regularMatch.Dispose();
  const match=SKFontManager.Default.MatchFamily('DejaVu Sans',SKFontStyle.Bold);assert.equal(match.IsBold,true);const normalFont=new SKFont(regular,40),boldFont=new SKFont(match,40);assert.ok(boldFont.MeasureText('AAAA')>normalFont.MeasureText('AAAA'));normalFont.Dispose();boldFont.Dispose();match.Dispose();
  const fallback=SKFontManager.Default.MatchCharacter('Missing Font',SKFontStyle.Normal,['ar'],0x644);assert.ok(fallback.ContainsGlyph(0x644));fallback.Dispose();assert.equal(SKFontManager.Default.MatchCharacter(0x10ffff),null);
});
const font=new SKFont(regular,40);
test('font metrics, advances, glyph bounds, Unicode scalar counting',()=>{
  assert.ok(font.Metrics.Ascent<0);assert.ok(font.Metrics.Descent>0);assert.ok(font.Spacing>40);
  const text='Ab😀';const glyphs=font.GetGlyphs(text);assert.equal(glyphs.length,3);assert.equal(font.CountGlyphs(text),3);assert.ok(glyphs.every(g=>g>0));
  const bounds=new core.SKRect();const width=font.MeasureText(text,bounds);assert.ok(width>60);assert.ok(bounds.Right>bounds.Left);assert.equal(font.GetGlyphPositions(glyphs).length,3);
  const breakText=font.BreakText(text,font.MeasureText('Ab')+1);assert.equal(breakText.Text,'Ab');
  assert.ok(regular.GetKerningPairAdjustments(regular.GetGlyphs('AV'))[0]<0);
});
test('TrueType simple and composite glyph outlines match native glyph bounds',()=>{
  font.Hinting=K.FontHinting.None; font.LinearMetrics=true;
  for(const text of ['A','g','é','Å','ñ']) {const g=font.GetGlyphs(text)[0],path=font.GetGlyphPath(g),bounds=path.TightBounds,native=font.GetGlyphBounds([g])[0];assert.ok(path.PointCount>0);for(const key of ['Left','Top','Right','Bottom'])assert.ok(Math.abs(bounds[key]-native[key])<2,`${text} ${key}: ${bounds[key]} / ${native[key]}`);path.Dispose();}
  const path=font.GetTextPath('Test',10,70);assert.ok(path.Bounds.Width>60);path.Dispose();
});
test('TextBlob positioned and allocated multi-run rendering',()=>{
  const surface=K.MakeSurface(400,180),canvas=surface.getCanvas(),paint=new core.SKPaint();paint.Color=core.SKColors.Black;canvas.clear(K.WHITE);
  const text=SKTextBlob.Create('Hello',font);assert.ok(text.Bounds.Width>80);text.Draw(canvas,10,45,paint);text.Dispose();
  const builder=new SKTextBlobBuilder(),glyphs=font.GetGlyphs('ABC');const run=builder.AllocatePositionedRun(font,glyphs.length);run.SetGlyphs(glyphs);run.SetPositions([new core.SKPoint(10,95),new core.SKPoint(50,110),new core.SKPoint(95,100)]);const blob=builder.Build();assert.ok(blob.Bounds.Width>100);blob.Draw(canvas,0,0,paint);blob.Dispose();builder.Dispose();
  surface.flush();const image=surface.makeImageSnapshot(),png=image.encodeToBytes();assert.ok(png.length>2500);image.delete();surface.delete();paint.Dispose();
});
test('SkParagraph shaping, bidi, wrapping, hit testing and metrics',()=>{
  const b=new SKParagraphBuilder({TextStyle:{FontFamilies:['DejaVu Sans'],FontSize:24,Color:core.SKColors.Black}});b.AddText('Hello العربية שלום');const paragraph=b.Build();b.Dispose();paragraph.Layout(140);
  assert.ok(paragraph.NumberOfLines>=2);assert.ok(paragraph.Height>24);assert.equal(paragraph.UnresolvedCodepoints().length,0);assert.ok(paragraph.GetLineMetrics().length>=2);assert.ok(paragraph.GetRectsForRange(0,5).length);assert.equal(typeof paragraph.GetGlyphPositionAtCoordinate(0,0).Pos,'number');assert.ok(paragraph.GetShapedLines().flatMap(l=>l.runs).length>=3);paragraph.Dispose();
});
test('HarfBuzz ligatures and SKShaper lifetime',()=>{
  const shaper=new SKShaper(regular),result=shaper.Shape('office العربية',font);assert.ok(result.Codepoints.length<'office العربية'.length);assert.equal(result.Codepoints.length,result.Points.length);assert.ok(result.Width>100);
  const native=K.MakeSurface(500,100);result.Paint(native.getCanvas(),10,50);native.flush();native.delete();result.Dispose();shaper.Dispose();
});
test('legacy paint font convenience methods',()=>{
  const paint=new core.SKPaint();paint.Typeface=regular;paint.TextSize=24;assert.ok(paint.MeasureText('Hello')>40);assert.ok(paint.FontMetrics.Ascent<0);assert.equal(paint.GetGlyphs('Hi').length,2);paint.Dispose();
});
test('font collections preserve independently selectable faces',()=>{
  const sources=[bytes,boldBytes],size=20+sources.reduce((sum,b)=>sum+((b.length+3)&~3),0),data=new Uint8Array(size),view=new DataView(data.buffer);view.setUint32(0,0x74746366);view.setUint32(4,0x10000);view.setUint32(8,2);let offset=20;for(const [index,source]of sources.entries()){view.setUint32(12+index*4,offset);data.set(source,offset);const count=view.getUint16(offset+4);for(let i=0;i<count;i++){const p=offset+12+i*16+8;view.setUint32(p,view.getUint32(p)+offset);}offset+=(source.length+3)&~3;}
  const normalFace=SKTypeface.FromData(data,0),boldFace=SKTypeface.FromData(data,1);
  assert.equal(normalFace.IsBold,false);assert.equal(boldFace.IsBold,true);assert.equal(boldFace.PostScriptName,'DejaVuSans-Bold');assert.equal(boldFace.UnitsPerEm,2048);assert.throws(()=>SKTypeface.FromData(data,2),RangeError);normalFace.Dispose();boldFace.Dispose();
});
test('point origins, shaped font transforms, paint effects, lowercase options',()=>{
  const shifted=SKTextBlob.Create('Hi',font,new core.SKPoint(70,80));assert.ok(shifted.Bounds.Left>=70);shifted.Dispose();
  const builder=new SKTextBlobBuilder();builder.AddRun(font.GetGlyphs('Hi'),font,new core.SKPoint(70,80));const built=builder.Build();assert.ok(built.Bounds.Left>=70);built.Dispose();builder.Dispose();
  const paint=new core.SKPaint();paint.Color=core.SKColors.Red;paint.Style=core.SKPaintStyle.Stroke;paint.StrokeWidth=1.5;const scaled=new SKFont(regular,24,1.4,-.2),shaper=new SKShaper(regular),result=shaper.Shape('office العربية office العربية',scaled,{width:150,paint});assert.ok(result.Paragraph.NumberOfLines>1);assert.equal(result.Points[0].Y,0);assert.equal(result.ScaleX,scaled.ScaleX);const surface=K.MakeSurface(240,200);result.Paint(surface.getCanvas(),20,30);surface.flush();surface.delete();result.Dispose();shaper.Dispose();scaled.Dispose();paint.Dispose();
});
font.Dispose();regular.Dispose();bold.Dispose();SKFontManager.Default.Dispose();
console.log(`${groups} font/text integration groups passed.`);
