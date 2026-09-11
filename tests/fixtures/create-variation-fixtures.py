"""Generate independently verifiable metric, layout and color variation fixtures.
Requires fonttools only; runtime JavaScript does not invoke Python.
"""
from pathlib import Path
import json
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.designspaceLib import DesignSpaceDocument,AxisDescriptor,SourceDescriptor
from fontTools.varLib import build
from fontTools.varLib.featureVars import addFeatureVariations
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.colorLib.builder import buildCOLR,buildCPAL
from fontTools.ttLib import newTable
from fontTools.ttLib.tables import otTables
from fontTools.varLib.builder import buildVarRegionList,buildVarData,buildVarStore
root=Path(__file__).resolve().parent
work=root/'generated-masters';work.mkdir(exist_ok=True)
names=['.notdef','space','A','V','acutecomb','A.alt']
def master(heavy):
 fb=FontBuilder(1000,isTTF=True);fb.setupGlyphOrder(names);fb.setupCharacterMap({32:'space',65:'A',86:'V',0x301:'acutecomb'});glyphs={}
 for name in names:
  pen=TTGlyphPen(None)
  if name not in ['space','.notdef']:
   if name=='acutecomb':pts=[(0,0),(100,100),(170,100),(60,0)]
   elif name=='V':pts=[(30,700),(150,700),(250,150),(350,700),(470,700),(300,0),(200,0)]
   else:
    x=100 if name=='A.alt' else 0;pts=[(40,0),(240+x,700),(460+x*2,0),(360+x*2,0),(240+x,500),(140,0)]
   pen.moveTo(pts[0]);[pen.lineTo(p)for p in pts[1:]];pen.closePath()
  glyphs[name]=pen.glyph()
 fb.setupGlyf(glyphs);fb.setupHorizontalMetrics({name:(0 if name=='acutecomb' else 750 if name=='A.alt' else 500,0 if name in ['.notdef','space','acutecomb']else 30 if name=='V' else 40)for name in names});fb.setupHorizontalHeader(ascent=900 if heavy else 800,descent=-200)
 fb.setupVerticalMetrics({name:(1200 if heavy else 900,150 if heavy else 100)for name in names});fb.setupVerticalHeader(ascent=1100 if heavy else 850,descent=-150,lineGap=50 if heavy else 20)
 fb.setupNameTable({'familyName':'Variation Fixture','styleName':'Regular','uniqueFontIdentifier':'VariationFixture','fullName':'Variation Fixture','psName':'VariationFixture','version':'Version 1.0'});fb.setupOS2(sTypoAscender=900 if heavy else 800,sTypoDescender=-200,sTypoLineGap=30 if heavy else 10,usWinAscent=950 if heavy else 850,usWinDescent=200,sxHeight=600 if heavy else 450,sCapHeight=750 if heavy else 700);fb.setupPost(underlinePosition=-130 if heavy else -80,underlineThickness=80 if heavy else 30);fb.setupMaxp();fb.font['head'].created=fb.font['head'].modified=2082844800;fb.font.recalcTimestamp=False
 kern=-150 if heavy else -50;x=350 if heavy else 200;y=800 if heavy else 700
 addOpenTypeFeaturesFromString(fb.font,f'\nmarkClass acutecomb <anchor 0 0> @TOP;\nfeature kern {{ pos [A A.alt] V {kern}; }} kern;\nfeature mark {{pos base [A A.alt] <anchor {x} {y}> mark @TOP;}} mark;\n')
 return fb.font
paths=[]
for heavy in [False,True]:
 path=work/('heavy.ttf' if heavy else 'regular.ttf');master(heavy).save(path);paths.append(path)
ds=DesignSpaceDocument();a=AxisDescriptor();a.name='Weight';a.tag='wght';a.minimum=100;a.default=100;a.maximum=900;ds.addAxis(a)
for index,path in enumerate(paths):
 source=SourceDescriptor();source.path=str(path);source.name=f'Master{index}';source.location={'Weight':100+index*800};source.familyName='Variation Fixture';source.styleName='Black' if index else 'Regular';source.copyInfo=not index;source.copyLib=not index;source.copyFeatures=not index;ds.addSource(source)
variable,_,_=build(ds);addFeatureVariations(variable,[([{'wght':(.6,1.)}],{'A':'A.alt'})]);variable['GDEF'].table.MarkGlyphSetsDef=None;variable.save(root/'VariationMetrics.ttf')
expectations={}
for w in [100,500,900]:
 f=instantiateVariableFont(variable,{'wght':w},inplace=False);f.save(root/f'VariationMetrics-{w}.ttf')
 expectations[str(w)]={'xHeight':f['OS/2'].sxHeight,'capHeight':f['OS/2'].sCapHeight,'typoAscent':f['OS/2'].sTypoAscender,'typoLineGap':f['OS/2'].sTypoLineGap,'underlinePosition':f['post'].underlinePosition,'underlineThickness':f['post'].underlineThickness,'vheaAscent':f['vhea'].ascent,'vheaLineGap':f['vhea'].lineGap,'verticalMetrics':f['vmtx'].metrics}
(root/'variation-metrics-expected.json').write_text(json.dumps(expectations,indent=2)+'\n')
# A variable COLRv1 gradient: its endpoint x1 moves by 300 font units and
# first color stop alpha drops by 0.5 between axis defaults and maximum.
color=master(False);color['fvar']=variable['fvar'];color['CPAL']=buildCPAL([[(1.,0.,0.,1.),(0.,0.,1.,1.)]])
regions=buildVarRegionList([{'wght':(0.,1.,1.)}],['wght']);data=buildVarData([0],[[0],[0],[300],[0],[0],[0],[0],[-8192]],optimize=False);store=buildVarStore(regions,[data])
paint={'Format':10,'Glyph':'A','Paint':{'Format':5,'ColorLine':{'Extend':0,'ColorStop':[{'StopOffset':0.,'PaletteIndex':0,'Alpha':1.,'VarIndexBase':6},{'StopOffset':1.,'PaletteIndex':1,'Alpha':1.,'VarIndexBase':0xFFFFFFFF}]},'x0':0,'y0':0,'x1':300,'y1':0,'x2':0,'y2':700,'VarIndexBase':0}}
color['COLR']=buildCOLR({'A':paint},version=1,glyphMap=color.getReverseGlyphMap(),varStore=store);color.save(root/'VariationColor.ttf')
for w in [100,500,900]:
 f=master(False);f['CPAL']=color['CPAL'];fraction=(w-100)/800
 # Independent design-value reference: fontTools' instancer currently leaves
 # COLRv1 variation data untouched, so construct the authored target directly.
 reference={'Format':10,'Glyph':'A','Paint':{'Format':4,'ColorLine':{'Extend':0,'ColorStop':[{'StopOffset':0.,'PaletteIndex':0,'Alpha':1.-fraction*.5},{'StopOffset':1.,'PaletteIndex':1,'Alpha':1.}]},'x0':0,'y0':0,'x1':round(300+fraction*300),'y1':0,'x2':0,'y2':700}}
 f['COLR']=buildCOLR({'A':reference},version=1,glyphMap=f.getReverseGlyphMap());f.save(root/f'VariationColor-{w}.ttf')
print('Generated metric/layout and COLRv1 variable fonts with independent fontTools instances.')
