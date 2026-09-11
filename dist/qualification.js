import {Initialize} from './lib/index.js';
import {RunQualification} from './lib/qualification.js';
const $=id=>document.getElementById(id),json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2);
let S,latest,controller;
function save(name,data,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('report').onclick=()=>save('skiasharp-qualification.json',json(latest.report),'application/json');
for(const name of ['vector','filtered'])$(name).onclick=()=>save('qualification-'+name+'.pdf',latest.documents[name],'application/pdf');
$('cancel').onclick=()=>controller?.abort(new DOMException('Qualification cancelled','AbortError'));
$('run').onclick=async()=>{
 controller=new AbortController();$('run').disabled=true;$('cancel').disabled=false;$('font').disabled=true;$('status').className='status';
 try{
  latest=await RunQualification(S,{requirePhysical:$('hardware').checked,iterations:Number($('iterations').value),signal:controller.signal,canvasHost:$('preview'),
   onProgress:({stage,completed,total})=>{$('status').textContent=stage+' · '+completed+' / '+total;$('progress').value=completed/total;}});
  $('result').textContent=json(latest.report);$('documents').textContent=json(latest.report.documents??latest.report.errors);$('status').textContent=latest.report.passed?'Qualification passed for the recorded workload.':'Qualification did not pass. See the explicit errors in the report.';$('status').classList.toggle('error',!latest.report.passed);$('report').disabled=false;
  for(const name of ['vector','filtered'])$(name).disabled=!latest.documents[name];
 }catch(e){$('status').textContent=e.message;$('status').classList.add('error');}
 finally{$('run').disabled=false;$('cancel').disabled=true;$('font').disabled=false;controller=null;}
};
$('font').onchange=async()=>{
 const file=$('font').files[0];if(!file)return;
 let manager,typeface,font;
 try{
  if(file.size>32*1024*1024)throw Error('This inspection limits fonts to 32 MiB.');
  manager=new S.SKFontManager();typeface=manager.RegisterFont(new Uint8Array(await file.arrayBuffer()));font=new S.SKFont(typeface,32,1.1,.15);
  const glyphs=font.GetGlyphs('Ag 0123 Ω'),rows=[];
  font.GetGlyphPaths(glyphs,(p,m)=>rows.push({hasOutline:!!p,points:p?.PointCount??0,bounds:p?.Bounds.ToArray()??null,matrix:m.Values}));
  $('font-result').textContent=json({name:file.name,bytes:file.size,family:typeface.FamilyName,canonicalNativeCallbacks:S.SKFont.HasCanonicalPathCallbacks,glyphs:[...glyphs],rows});
 }catch(e){$('font-result').textContent=e.message;}
 finally{font?.Dispose();typeface?.Dispose();manager?.Dispose();}
};
try{S=await Initialize({fonts:false});$('version').textContent=S.Version;$('status').textContent='Ready. No data leaves this page.';$('run').disabled=false;$('font').disabled=false;window.qualificationLab={Run:options=>RunQualification(S,options),get latest(){return latest;},api:S};}
catch(e){$('status').textContent=e.message;$('status').classList.add('error');}
