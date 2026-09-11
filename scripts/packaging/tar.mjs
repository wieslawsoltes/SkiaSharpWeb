import { gunzipSync } from 'node:zlib';
/** Read npm's tar format without executing lifecycle scripts or extracting paths. */
export function ReadTarball(bytes) {
  const data=gunzipSync(bytes,{maxOutputLength:64*1024*1024}),files=new Map();let pax={};
  const str=(b,start,length)=>b.subarray(start,start+length).toString('utf8').replace(/\0.*$/s,'');
  for(let at=0;at+512<=data.length;){
    const header=data.subarray(at,at+512);at+=512;if(header.every(b=>b===0))break;
    const checksum=parseInt(str(header,148,8).trim(),8);
    const actual=header.reduce((sum,b,i)=>sum+(i>=148&&i<156?32:b),0);
    if(actual!==checksum)throw new Error('Invalid tar header checksum.');
    const size=parseInt(str(header,124,12).trim(),8)||0;
    if(!Number.isSafeInteger(size)||size<0||at+size>data.length)throw new Error('Invalid tar entry size.');
    const body=data.subarray(at,at+size);at+=Math.ceil(size/512)*512;
    const type=str(header,156,1);
    if(type==='x'){
      pax={};let start=0;
      while(start<body.length){const space=body.indexOf(32,start),n=Number(body.subarray(start,space).toString());if(space<0||!Number.isSafeInteger(n)||n<3||start+n>body.length)throw new Error('Invalid PAX record.');const line=body.subarray(space+1,start+n-1).toString(),eq=line.indexOf('=');pax[line.slice(0,eq)]=line.slice(eq+1);start+=n;}
      continue;
    }
    const prefix=str(header,345,155);const name=pax.path??(prefix?prefix+'/':'')+str(header,0,100);pax={};
    if(!name.startsWith('package/')||name.includes('\\')||name.split('/').some(p=>p==='..'||p==='.')||name.includes(':'))throw new Error(`Unsafe package path: ${name}`);
    if(type==='5')continue;
    if(type!==''&&type!=='0')throw new Error(`Unsupported tar entry type: ${type}`);
    const path=name.slice(8);if(files.has(path))throw new Error(`Duplicate package file: ${path}`);
    files.set(path,body);
  }
  if(!files.has('package.json'))throw new Error('Package metadata is missing.');
  return files;
}
