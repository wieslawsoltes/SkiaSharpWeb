"""MIT. Independently authored hinted CFF fonts and fontTools static references."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.psCharStrings import T2CharString
from fontTools.cffLib import SubrsIndex
from fontTools.designspaceLib import DesignSpaceDocument,AxisDescriptor,SourceDescriptor
from fontTools.varLib import build
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.cffLib.CFF2ToCFF import convertCFF2ToCFF
from fontTools.ttLib import TTFont
import tempfile,json
out=Path(__file__).parent
names=['.notdef','space','H','O','waves']
private={'BlueValues':[-12,0,700,712],'OtherBlues':[-212,-200],'StdHW':68,'StdVW':63,'StemSnapH':[68,90],'StemSnapV':[63,85],'BlueScale':0.039625,'BlueShift':7,'BlueFuzz':1,'LanguageGroup':0,'ExpansionFactor':0.06}
def program(weight):
 stem=63+weight;span=550+2*weight
 return [0,68,532,68,'hstemhm',50,stem,span-2*stem-50,stem,'vstemhm','hintmask',b'\xf0',50,0,'rmoveto',0,700,stem,0,0,-300,span-2*stem-50,0,0,300,stem,0,0,-700,-stem,0,0,332,-(span-2*stem-50),0,0,-332,-stem,0,'rlineto','cntrmask',b'\xf0']
def font(weight,cff2=False):
 fb=FontBuilder(1000,isTTF=False);fb.setupGlyphOrder(names);fb.setupCharacterMap({32:'space',72:'H',79:'O',87:'waves'});fb.setupHorizontalMetrics({n:(600+weight*2,50) for n in names});fb.setupHorizontalHeader(ascent=800,descent=-200);fb.setupNameTable({'familyName':'Hint Fidelity','styleName':'Regular','uniqueFontIdentifier':'HintFidelity1','fullName':'Hint Fidelity','psName':'HintFidelity','version':'Version 1.0'});fb.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200);fb.setupPost();
 programs={'.notdef':[], 'space':[], 'H':program(weight),'O':[50,0,'rmoveto',0,600,500,0,0,-600,-500,0,'rlineto'],'waves':[0,0,'rmoveto']+[n for i in range(64) for n in [4,4 if i%2 else -4]]+['rlineto']}
 chars={n:T2CharString(program=(p if cff2 else [600+weight*2]+p+['endchar'])) for n,p in programs.items()}
 if cff2:fb.setupCFF2(chars,[private])
 else:fb.setupCFF('HintFidelity',{'FullName':'Hint Fidelity','FamilyName':'Hint Fidelity','Weight':'Regular'},chars,private)
 fb.setupMaxp();f=fb.font;f['head'].created=f['head'].modified=2082844800;f.recalcTimestamp=False;return f
with tempfile.TemporaryDirectory() as work:
 work=Path(work);ds=DesignSpaceDocument();axis=AxisDescriptor();axis.name='Weight';axis.tag='wght';axis.minimum=100;axis.default=100;axis.maximum=900;ds.addAxis(axis)
 for delta,weight in [(0,100),(50,900)]:
  f=font(delta);f.save(work/f'{weight}.otf');src=SourceDescriptor();src.path=str(work/f'{weight}.otf');src.name=str(weight);src.location={'Weight':weight};src.copyInfo=src.copyLib=src.copyFeatures=weight==100;ds.addSource(src)
 ds.write(work/'Hints.designspace');vf,_,_=build(ds);vf.save(out/'HintVariable.otf')
 for weight in [100,500,900]:
  f=instantiateVariableFont(vf,{'wght':weight},inplace=False);f.save(out/f'HintStatic-{weight}.otf');convertCFF2ToCFF(f);f.recalcBBoxes=False;f.save(out/f'HintReference-{weight}.otf')
# Static CFF2 subroutine program shares the hint operands with a local subroutine.
f=font(0,True);top=f['CFF2'].cff.topDictIndex[0];pd=top.FDArray[0].Private;pd.Subrs=SubrsIndex();pd.Subrs.append(T2CharString(program=[0,68,532,68,'hstemhm',50,63,374,63,'vstemhm'],private=pd,globalSubrs=f['CFF2'].cff.GlobalSubrs));g=T2CharString(program=['hintmask',b'\xf0'],private=pd,globalSubrs=f['CFF2'].cff.GlobalSubrs);f['CFF2'].cff.GlobalSubrs.append(g)
top.CharStrings['H'].program=[-107,'callsubr',-107,'callgsubr']+program(0)[12:]
f.save(out/'HintSubroutines.otf');ref=font(0);ref.save(out/'HintSubroutines-Reference.otf')
print('Generated variable hinted CFF2, independent static references and subroutine/long-stack fixtures.')

no_hints=TTFont(out/'HintStatic-100.otf');no_hints['CFF2'].cff.remove_hints();no_hints.save(out/'HintWithoutHints.otf')
