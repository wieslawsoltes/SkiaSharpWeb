# Requires Python fonttools and pillow; optional brotli for WOFF2. No generator is needed at browser runtime.
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.designspaceLib import DesignSpaceDocument, AxisDescriptor, SourceDescriptor
from fontTools.varLib import build
from fontTools.colorLib.builder import buildCOLR,buildCPAL
from fontTools.ttLib import newTable
from fontTools.ttLib.tables.S_V_G_ import SVGDocument
from fontTools.ttLib.tables.sbixStrike import Strike
from fontTools.ttLib.tables.sbixGlyph import Glyph
import io
from PIL import Image
root=Path(__file__).resolve().parents[2]
work=root/'test-output/font-fixtures'
work.mkdir(parents=True,exist_ok=True)
names=['.notdef','space','A','layer.red','layer.blue']
def make_master(weight,cff=False):
    fb=FontBuilder(1000,isTTF=not cff);fb.setupGlyphOrder(names);fb.setupCharacterMap({32:'space',65:'A',0x1f600:'A'});glyphs={}
    for name in names:
        pen=T2CharStringPen(500+weight,None) if cff else TTGlyphPen(None)
        if name not in ['space','.notdef']:
            if name=='A':
                pen.moveTo((50,0));pen.lineTo((220+weight,700));pen.lineTo((450+weight*2,0));pen.lineTo((350+weight,0));pen.lineTo((220+weight,500));pen.lineTo((150,0));pen.closePath()
            else:
                x=0 if name=='layer.red' else 250
                pen.moveTo((x,0));pen.lineTo((x+250,0));pen.lineTo((x+250,700));pen.lineTo((x,700));pen.closePath()
        glyphs[name]=pen.getCharString() if cff else pen.glyph()
    if cff:fb.setupCFF('FixtureCFF',{'FullName':'Fixture CFF','FamilyName':'Fixture CFF','Weight':'Regular'},glyphs,{})
    else:fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({name:(500+weight*2,50 if name=='A' else 250 if name=='layer.blue' else 0) for name in names});fb.setupHorizontalHeader(ascent=800,descent=-200);fb.setupNameTable({'familyName':'Fixture CFF' if cff else 'Fixture Color','styleName':'Regular','uniqueFontIdentifier':'Fixture1','fullName':'Fixture CFF' if cff else 'Fixture Color','psName':'FixtureCFF' if cff else 'FixtureColor','version':'Version 1.0'});fb.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200);fb.setupPost();fb.setupMaxp();fb.font['head'].created=fb.font['head'].modified=2082844800;fb.font.recalcTimestamp=False;return fb.font
cff=make_master(0,True);cff.save(root/'tests/fixtures/CFF-Regular.otf')
masters=[]
for w in [0,200]:
    font=make_master(w,True);p=work/f'CFFMaster{w}.otf';font.save(p);masters.append(p)
ds=DesignSpaceDocument();a=AxisDescriptor();a.name='Weight';a.tag='wght';a.minimum=100;a.default=100;a.maximum=900;ds.addAxis(a)
for path,weight in zip(masters,[100,900]):
    source=SourceDescriptor();source.path=str(path);source.name=f'Master{weight}';source.location={'Weight':weight};source.familyName='Fixture CFF';source.styleName='Regular' if weight==100 else 'Black';source.copyInfo=weight==100;source.copyLib=weight==100;source.copyFeatures=weight==100;ds.addSource(source)
ds.write(work/'CFF.designspace');variable,_,_=build(ds);variable.save(root/'tests/fixtures/CFF2-Variable.otf')
color=make_master(0);color['COLR']=buildCOLR({'A':[('layer.red',0),('layer.blue',1)]});color['CPAL']=buildCPAL([[(1.,0.,0.,1.),(0.,0.,1.,1.)],[(0.,1.,0.,1.),(1.,.5,0.,1.)]])
svg=newTable('SVG ');svg.docList=[SVGDocument('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -700 500 700"><path fill="red" d="M0 0V-700H500V0Z"/></svg>',2,2)];color.save(root/'tests/fixtures/ColorLayers.ttf');color['SVG ']=svg
image=Image.new('RGBA',(20,20),(255,100,0,255));buf=io.BytesIO();image.save(buf,format='PNG')
sbix=newTable('sbix');sbix.version=1;sbix.flags=1;strike=Strike(ppem=20,resolution=72);strike.glyphs={'A':Glyph(glyphName='A',originOffsetX=-1,originOffsetY=0,graphicType='png ',imageData=buf.getvalue())};sbix.strikes={20:strike};color['sbix']=sbix;color.save(root/'tests/fixtures/ColorFixture.ttf');color.flavor='woff';color.save(root/'tests/fixtures/ColorFixture.woff')
print('Generated CFF, CFF2 variable, COLR/CPAL/SVG/sbix TTF/WOFF/WOFF2 fixtures')
colrv1=make_master(0);colrv1['CPAL']=buildCPAL([[(1.,0.,0.,1.),(0.,0.,1.,1.)]])
colrv1['COLR']=buildCOLR({'A':{'Format':10,'Glyph':'A','Paint':{'Format':4,'ColorLine':{'Extend':0,'ColorStop':[{'StopOffset':0.,'PaletteIndex':0,'Alpha':1.},{'StopOffset':1.,'PaletteIndex':1,'Alpha':1.}]},'x0':0,'y0':0,'x1':500,'y1':0,'x2':0,'y2':700}}},version=1,glyphMap=colrv1.getReverseGlyphMap());colrv1.save(root/'tests/fixtures/ColorGradient.ttf')

# Optional Python Brotli module enables regeneration of the compressed WOFF2 fixture.
try:
 import brotli
 color.flavor='woff2';color.save(root/'tests/fixtures/ColorFixture.woff2')
except ImportError:
 print('WOFF2 fixture unchanged: install Python brotli to regenerate it.')
