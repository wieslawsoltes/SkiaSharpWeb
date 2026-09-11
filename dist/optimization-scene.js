/** Drawing shared verbatim by the sample and native rendering tests. */
export function DrawOptimizationScene(S,path,canvas,state,palette,blur=false){
 const owned=[],own=o=>(owned.push(o),o),paint=own(new S.SKPaint({Color:S.SKColor.Parse(palette.stroke),Style:'Stroke',StrokeWidth:state.width,StrokeCap:state.cap,StrokeJoin:'Round',IsAntialias:true}));
 try{
  canvas.Clear(S.SKColor.Parse(palette.bg));const grid=own(new S.SKPaint({Color:S.SKColor.Parse(palette.grid),Style:'Stroke',StrokeWidth:1}));
  for(let x=0;x<1000;x+=40)canvas.DrawLine(x,0,x,420,grid);for(let y=0;y<420;y+=40)canvas.DrawLine(0,y,1000,y,grid);
  if(state.dash)paint.PathEffect=own(S.SKPathEffect.CreateDash([24,12],0));
  const outline=own(paint.GetFillPath(path,S.SKMatrix.Identity));
  const fill=own(new S.SKPaint({Color:S.SKColor.Parse(palette.fill),IsAntialias:true}));
  if(blur){const mask=own(S.SKMaskFilter.CreateBlur(S.SKBlurStyle.Normal,3));paint.MaskFilter=mask;fill.MaskFilter=mask;}
  let save=canvas.Save();try{canvas.Translate(50,35);canvas.DrawPath(path,paint);}finally{canvas.RestoreToCount(save);}
  save=canvas.Save();try{canvas.Translate(550,35);canvas.DrawPath(outline,fill);}finally{canvas.RestoreToCount(save);}
  if(state.controls){const dots=own(new S.SKPaint({Color:S.SKColor.Parse(palette.point),IsAntialias:true}));for(const point of path.GetPoints())canvas.DrawCircle(point.X+50,point.Y+35,3,dots);}
  // Real repeated query workload shared with application hit-testing scenarios.
  for(let i=0;i<30;i++){path.GetPoints();path.VerbCount;path.IsFinite;}
 }finally{for(const o of owned.reverse())o.Dispose();}
}

export function CreateOptimizationPath(S){return new S.SKPath().MoveTo(25,235).CubicTo(40,-10,105,295,160,95).ConicTo(225,-10,265,125,.65).CubicTo(305,290,370,25,410,200);}
