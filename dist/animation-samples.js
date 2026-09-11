import { orbitAnimation } from './orbit-data.js';

/** Creates four persistent sample scenes; call Dispose when removing the lab. */
export function createAnimationScenes(S) {
  const {SKPaint,SKColors,SKColor,SKFont,SKFontManager,SKRect,SKPoint,SKMatrix,Animation}=S;
  let animation=Animation.Parse(orbitAnimation),disposed=false,loadGeneration=0;
  const propertyAnimations=Array.from({length:3},()=>Animation.Parse(orbitAnimation));
  const slotDocument=structuredClone(orbitAnimation);
  slotDocument.slots={accent:{p:{a:0,k:[0.12,0.84,0.66,1]}},opacity:{p:{a:0,k:100}},position:{p:{a:0,k:[160,90,0]}}};
  slotDocument.layers[0].shapes[1].c={sid:'accent'};slotDocument.layers[0].ks.o={sid:'opacity'};slotDocument.layers[0].ks.p={sid:'position'};
  const slotAnimation=Animation.Parse(slotDocument);
  const {GroupNode,GeometryNode,Scene,ClipNode}=S.SceneGraph;
  const root=new GroupNode(),graph=new Scene(root),graphNodes=[];
  const makePaint=(color,stroke=0)=>new SKPaint({Color:SKColor.Parse(color),IsAntialias:true,Style:stroke?S.SKPaintStyle.Stroke:S.SKPaintStyle.Fill,StrokeWidth:stroke||1});
  for(let i=0;i<7;i++){const paint=makePaint(['#30DEAB','#7297FF','#FFBC67'][i%3]);const node=GeometryNode.Ellipse(SKRect.Create(-32,-32,64,64),paint);paint.Dispose();root.Add(node);graphNodes.push(node);}
  const clip=new ClipNode(SKRect.Create(55,125,850,330),[root]);
  const graphRoot=new GroupNode([clip]);graph.Root=graphRoot;
  function label(canvas,text,x,y,size=17,color='#B6C5D6'){
    const face=SKFontManager.Default.MatchFamily('DejaVu Sans'),font=new SKFont(face,size),paint=makePaint(color);face?.Dispose();try{canvas.DrawText(String(text),x,y,font,paint);}finally{font.Dispose();paint.Dispose();}
  }
  const draw=(fn)=>(canvas,w,h,o={})=>{const save=canvas.Save();try{canvas.Scale(w/960,h/600);fn(canvas,o);}finally{canvas.RestoreToCount(save);}};
  const scenes=[
    {id:'skottie',group:'Animation & resources',title:'Skottie animation',tag:'Native Skia animation renderer',description:'Seek through an actual Lottie scene, inspect normalized markers, or upload an animation JSON. Native Skottie resolves transforms, animated properties and vector paths.',code:'const animation = Skottie.Animation.Parse(json);\nanimation.SeekFrameTime(timeSeconds);\nanimation.Render(canvas, SKRect.Create(80, 120, 800, 450));\nconsole.log(animation.Markers, animation.Duration.TotalSeconds);',draw:draw((c,o)=>{
      const t=(o.time??0)%Math.max(.001,animation.Duration.TotalSeconds);animation.SeekFrameTime(t);animation.Render(c,SKRect.Create(40,110,880,390));
      label(c,`${animation.Size.Width} × ${animation.Size.Height}  ·  ${animation.Fps} fps  ·  ${animation.Duration.TotalSeconds.toFixed(2)} seconds`,45,65,20,'#E3EDF6');
      label(c,`Frame ${animation.CurrentFrame.toFixed(1)}  ·  ${animation.Markers.length} timeline markers`,45,530);
      label(c,animation.Diagnostics.length?`${animation.Diagnostics.length} loader messages · inspect animation.Diagnostics`:'Geometry, keyframes and compositing evaluated by Skia',45,565,15);
    })},
    {id:'skottie-properties',group:'Animation & resources',title:'Animation properties',tag:'Color · Transform · Opacity',description:'The same animation has independently overridden colors, scale, rotation and layer opacity. Overrides are applied after seeking each frame.',code:'animation.SeekFrameTime(seconds);\nanimation.SetColor("Accent", SKColors.Blue);\nanimation.SetOpacity("Mover", 65);\nanimation.SetTransform("Mover", {\n  Position: [160,90], Scale: [120,80], Rotation: 30\n});\nanimation.Render(canvas, destination);',draw:draw((c,o)=>{
      const names=['COLOR','TRANSFORM','OPACITY'];for(let i=0;i<3;i++){const a=propertyAnimations[i];a.SeekFrameTime((o.time??0)%2);a.SetColor('Accent',SKColor.Parse(['#FFBC67','#7297FF','#D38BFA'][i]));a.SetTransform('Mover',{Position:[160,90],Scale:i===1?[140,65]:[100,100],Rotation:i===1?(o.time??0)*40:0});if(i===2)a.SetOpacity('Mover',20+(o.amount??8)*5);a.Render(c,SKRect.Create(25+i*310,190,290,220));label(c,names[i],75+i*310,450,17,'#E3EDF6');}
      label(c,'One source animation. Three independent native instances.',45,70,23,'#E3EDF6');label(c,'Adjust effect amount to change the right-hand layer opacity.',45,550,17);
    })},
    {id:'skottie-slots',group:'Animation & resources',title:'Lottie property slots',tag:'Native Essential Graphics slots',description:'A color slot, scalar opacity slot and vector position slot update live through the native Skottie slot manager. Use the amount control to adjust opacity.',code:'animation.SeekFrame(0);\nanimation.SetColorSlot("accent", SKColors.Cyan);\nanimation.SetScalarSlot("opacity", 70);\nanimation.SetVectorSlot("position", new SKPoint(x,90));\nconst slots = animation.GetSlotInfo();\nanimation.Render(canvas, destination);',draw:draw((c,o)=>{
      slotAnimation.SeekFrame(0);slotAnimation.SetColorSlot('accent',SKColor.Parse('#30DEAB'));slotAnimation.SetScalarSlot('opacity',Math.min(100,25+(o.amount??8)*5));slotAnimation.SetVectorSlot('position',new SKPoint(160+Math.sin(o.time??0)*100,90));slotAnimation.Render(c,SKRect.Create(40,140,880,360));
      label(c,'Lottie slots · editable property channels',45,70,23,'#E3EDF6');const info=slotAnimation.GetSlotInfo();label(c,`${info.ColorSlotIds.length} color  ·  ${info.ScalarSlotIds.length} scalar  ·  ${info.VectorSlotIds.length} vector`,45,545,19);
    })},
    {id:'scenegraph',group:'Animation & resources',title:'Retained scene graph',tag:'Web scene extension · Invalidation',description:'Retained nodes own their paint and geometry, propagate changes to parents, track dirty bounds and render through nested clipping and transforms.',code:'const node = SceneGraph.GeometryNode.Ellipse(rect, paint);\nconst root = new SceneGraph.GroupNode([node]);\nconst scene = new SceneGraph.Scene(root);\nnode.Matrix = SKMatrix.CreateTranslation(x,y);\nscene.Render(canvas);\nconst damage = scene.Invalidation.Bounds;\nconst hit = scene.HitTest(new SKPoint(x,y));',draw:draw((c,o)=>{
      graph.ResetInvalidation();for(let i=0;i<graphNodes.length;i++){const node=graphNodes[i],t=(o.time??0)+i*.6;node.Matrix=SKMatrix.CreateTranslation(130+i*115,290+Math.sin(t)*95);node.Opacity=.35+.65*(.5+.5*Math.cos(t));}graph.Render(c);
      const damage=graph.Invalidation.Bounds;if(!damage.IsEmpty){const paint=makePaint('#52667E',1);try{c.DrawRect(damage,paint);}finally{paint.Dispose();}}
      label(c,'Retained nodes · parent invalidation · clipped rendering',45,70,22,'#E3EDF6');label(c,'Wireframe shows the union of the previous and current graph bounds.',45,535,17);label(c,'Geometry is retained; node properties drive each frame.',45,565,15);
    })}
  ];
  return {scenes,get Animation(){return animation;},async loadAnimation(source,options={}){if(disposed)throw new Error('Animation samples have been disposed.');const request=++loadGeneration;const next=await Animation.CreateAsync(source,{fontManager:SKFontManager.Default,...options});if(disposed||request!==loadGeneration){next?.Dispose();throw new DOMException('Animation load was superseded.','AbortError');}if(!next)throw new Error('The supplied JSON could not be parsed as a Lottie animation.');animation.Dispose();animation=next;return animation;},Dispose(){if(disposed)return;disposed=true;loadGeneration++;animation.Dispose();propertyAnimations.forEach(a=>a.Dispose());slotAnimation.Dispose();graph.Dispose();graphRoot.Dispose();clip.Dispose();root.Dispose();graphNodes.forEach(n=>n.Dispose());}};
}
