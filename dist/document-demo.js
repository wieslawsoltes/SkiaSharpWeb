/** Browser/Node-neutral sample: draw once into SKCanvas, PDF and XPS. */
export function DrawDocumentDemo(api, canvas, width=720, height=480) {
  const {SKPaint,SKColor,SKColors,SKFont,SKShader,SKPoint,SKRect,SKPath}=api;
  const p=new SKPaint({IsAntialias:true}),font=new SKFont(null,30),small=new SKFont(null,16);
  canvas.Clear(SKColor.Parse('#f5f7fc'));
  p.Color=SKColor.Parse('#152544');canvas.DrawText('Graphics, as a document',32,58,font,p);
  p.Color=SKColor.Parse('#596b87');canvas.DrawText('Vector paths · Embedded fonts · Searchable Unicode · PDF + XPS',32,88,small,p);
  const g=SKShader.CreateLinearGradient(new SKPoint(30,125),new SKPoint(410,300),[SKColor.Parse('#2c6df2'),SKColor.Parse('#a85bf7'),SKColor.Parse('#ef8093')],[0,.6,1]);
  p.Shader=g;g.Dispose();canvas.DrawRoundRect(new SKRect(32,120,width-32,300),24,24,p);p.Shader=null;
  canvas.Save();canvas.ClipRect(new SKRect(32,120,width-32,300));canvas.Translate(150,200);canvas.RotateDegrees(-12);
  p.Color=new SKColor(255,255,255,170);canvas.DrawCircle(40,20,55,p);p.Color=new SKColor(255,255,255,95);canvas.DrawRect(-50,-40,170,80,p);canvas.Restore();
  const path=new SKPath().MoveTo(310,255).CubicTo(360,130,440,300,500,160).CubicTo(560,100,610,290,670,150);
  p.Style=api.SKPaintStyle.Stroke;p.StrokeWidth=5;p.Color=SKColors.White;canvas.DrawPath(path,p);path.Dispose();p.Style=api.SKPaintStyle.Fill;
  p.Color=SKColor.Parse('#152544');canvas.DrawShapedText('office — Zażółć gęślą jaźń',32,350,font,p);
  canvas.DrawShapedText('مرحبا بالعالم',32,398,font,p);
  p.Color=SKColor.Parse('#596b87');canvas.DrawText('This artwork remains vector in both exported document formats.',32,height-34,small,p);
  p.Dispose();font.Dispose();small.Dispose();
}
export function CreateDocumentDemo(api, format='pdf') {
  const doc=format==='xps'?api.SKDocument.CreateXps({Title:'Vector Graphics Lab'}):api.SKDocument.CreatePdf({Title:'Vector Graphics Lab',Author:'SkiaSharp Web'});
  try {const canvas=doc.BeginPage(720,480);DrawDocumentDemo(api,canvas);doc.EndPage();const data=doc.ToData();return {Data:data,RasterFallbacks:doc.RasterFallbacks};}finally{doc.Dispose();}
}
