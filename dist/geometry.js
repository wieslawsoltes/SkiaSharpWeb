import {RegisterWebComponent} from './lib/index.js';
const $=id=>document.getElementById(id),view=$('view');let S,last,ready=false;
function draw(canvas){
 const owned=[],own=v=>(owned.push(v),v),size=Number($('size').value),width=Number($('stroke').value),bend=Number($('bend').value),text=$('text').value,alignment=Number($('align').value);
 try{
  const follow=own(new S.SKPath().MoveTo(50,140).CubicTo(310,140-bend,640,140+bend,900,140)),font=own(new S.SKFont(null,size));
  const line=own(new S.SKPaint({IsAntialias:true,Color:S.SKColor.Parse('#97a8ba'),Style:1,StrokeWidth:1}));
  const foreground=own(new S.SKPaint({IsAntialias:true,Color:S.SKColor.Parse('#15334b')})),fillPaint=own(new S.SKPaint({IsAntialias:true,Color:S.SKColor.Parse('#15816b')}));
  canvas.Clear(S.SKColors.White);canvas.DrawPath(follow,line);
  const outline=own(font.GetTextPathOnPath(text,follow,alignment));canvas.DrawPath(outline,foreground);
  const stroke=own(new S.SKPaint({IsAntialias:true,Style:1,StrokeCap:1,StrokeWidth:width})),dash=own(S.SKPathEffect.CreateDash([24,12],0));stroke.PathEffect=dash;
  const expanded=own(stroke.GetFillPath(follow,new S.SKRect(0,0,960,400),S.SKMatrix.Identity));
  const save=canvas.Save();try{canvas.Translate(0,155);if(expanded)canvas.DrawPath(expanded,fillPaint);else canvas.DrawPath(follow,stroke);}finally{canvas.RestoreToCount(save);}
  const measured={},utf8=new TextEncoder().encode(text),bytes=font.BreakText(utf8,0,150,measured);
  return {TextOutline:{Points:outline.PointCount,Verbs:outline.VerbCount,Bounds:outline.Bounds.ToArray()},StrokeExpansion:{Native:S.SKPaint.HasNativePathExpansion,Hairline:expanded===null,Points:expanded?.PointCount??0},BreakText:{ReturnType:typeof bytes,Utf8Bytes:bytes,MeasuredWidth:measured.Value,MeasuredText:measured.Text}};
 }finally{for(const o of owned.reverse())o?.Dispose();}
}
view.addEventListener('paintsurface',({detail})=>{if(!ready)return;last=draw(detail.Canvas);$('results').textContent=JSON.stringify(last,null,2);$('status').textContent=`${detail.Surface.RenderMode} · ${S.Version} · ${last.TextOutline.Verbs} glyph contour verbs`;});
view.addEventListener('surfaceerror',e=>{$('status').textContent=e.detail.message;});
for(const name of ['text','size','stroke','bend','align'])$(name).addEventListener('input',()=>{if(ready)void view.InvalidateSurface();});
$('backend').onchange=()=>view.setAttribute('backend',$('backend').value);
$('pdf').onclick=()=>{
 let document,data;
 try{document=S.SKDocument.CreatePdf({NativeBackend:true,StrictVector:true});const c=document.BeginPage(960,400);draw(c);data=document.ToData();const url=URL.createObjectURL(new Blob([data.AsSpan()],{type:'application/pdf'})),link=window.document.createElement('a');link.href=url;link.download='geometry-contracts.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
 catch(e){$('status').textContent=e.message;}finally{data?.Dispose();document?.Dispose();}
};
try{S=await RegisterWebComponent();ready=true;await view.InvalidateSurface();$('pdf').disabled=false;window.geometryLab={api:S,view,draw,get latest(){return last;}};}
catch(e){$('status').textContent=e.message;}
