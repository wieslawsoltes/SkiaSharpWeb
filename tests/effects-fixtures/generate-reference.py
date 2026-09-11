"""Regenerate independent native Skia reference data; pip install skia-python==144.0.post2."""
import json, random, skia
from pathlib import Path
out={'source':'skia-python native Skia '+skia.__version__,'regions':[],'corners':[]}
rng=random.Random(72918)
for i in range(36):
 p=skia.Path()
 if i%3==0:
  spec={'kind':'circle','x':rng.uniform(-8,10),'y':rng.uniform(-8,10),'r':rng.uniform(1,18)}
  p.addCircle(spec['x'],spec['y'],spec['r'])
 elif i%3==1:
  spec={'kind':'cubic','points':[rng.uniform(-22,30) for _ in range(8)]};a=spec['points'];p.moveTo(*a[:2]);p.cubicTo(*a[2:]);p.close()
 else:
  spec={'kind':'polygon','points':[rng.uniform(-22,30) for _ in range(12)]};a=spec['points'];p.moveTo(*a[:2]);[p.lineTo(*a[j:j+2]) for j in range(2,len(a),2)];p.close()
 p.setFillType([skia.PathFillType.kWinding,skia.PathFillType.kEvenOdd,skia.PathFillType.kInverseWinding,skia.PathFillType.kInverseEvenOdd][i%4]);spec['fill']=i%4
 r=skia.Region();r.setPath(p,skia.Region(skia.IRect.MakeLTRB(-16,-16,32,32)))
 spec['rects']=[[z.left(),z.top(),z.right(),z.bottom()] for z in r];spec['serialized']=bytes(r.writeToMemory()).hex();out['regions'].append(spec)
for commands in [
 [[0,0,0],[1,40,0],[4,50,0,55,30,70,30],[1,70,60]],
 [[0,0,0],[4,20,-30,40,30,60,0],[1,60,40],[1,0,40],[5]],
 [[0,0,0],[1,40,0],[2,50,10,40,20],[1,0,20],[5]],
 [[0,0,0],[1,40,0],[1,40,40],[5]],
 [[0,0,0],[1,40,0],[0,70,30],[1,100,30],[1,100,50]],
]:
 p=skia.Path()
 for c in commands:
  if c[0]==0:p.moveTo(*c[1:])
  elif c[0]==1:p.lineTo(*c[1:])
  elif c[0]==2:p.quadTo(*c[1:])
  elif c[0]==4:p.cubicTo(*c[1:])
  else:p.close()
 dst=skia.Path();effect=skia.CornerPathEffect.Make(3);effect.filterPath(dst,p,skia.StrokeRec(skia.StrokeRec.kHairline_InitStyle),skia.Rect.MakeLTRB(-1000,-1000,1000,1000))
 expected=[]
 for verb,points in skia.Path.RawIter(dst):
  values=[z for point in points for z in [point.x(),point.y()]]
  if int(verb) in [1,2,4]:values=values[2:]
  if int(verb)==5:values=[]
  expected.append([int(verb),*values])
 out['corners'].append({'commands':commands,'radius':3,'expected':expected})
r=skia.Region();[r.op(skia.IRect.MakeLTRB(*rect),skia.Region.kUnion_Op) for rect in [[10,10,20,20],[30,10,40,20],[15,30,25,40]]]
out['complexRegionHex']=bytes(r.writeToMemory()).hex()
Path(__file__).with_name('native-reference.json').write_text(json.dumps(out,indent=2)+'\n')
