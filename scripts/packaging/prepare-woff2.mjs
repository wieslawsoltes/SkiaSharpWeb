import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, hash } from './common.mjs';
// Audited adapter-only transform. The WOFF2 WASM and the qualified CanvasKit
// JS/WASM bytes are not changed. Do not accept an unknown dependency revision.
const named = String.raw`function createNamedFunction(name,body){const result=function(){return body.apply(this,arguments)};Object.defineProperty(result,"name",{value:makeLegalFunctionName(name),configurable:true});return result}`;
const invoker = String.raw`function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){if(argTypes.length<2)throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");const count=argTypes.length-2,isMethod=argTypes[1]!==null&&classType!==null,needsStack=argTypes.slice(1).some(type=>type!==null&&type.destructorFunction===undefined);const invoke=function(...args){if(args.length!==count)throwBindingError("function "+humanName+" called with "+args.length+" arguments, expected "+count+" args!");const destructors=needsStack?[]:null,wired=[],call=[cppTargetFunc];let result;try{if(isMethod){const value=argTypes[1].toWireType(destructors,this);wired.push([argTypes[1],value]);call.push(value)}for(let i=0;i<count;i++){const type=argTypes[i+2],value=type.toWireType(destructors,args[i]);wired.push([type,value]);call.push(value)}result=cppInvokerFunc.apply(null,call)}finally{if(destructors)runDestructors(destructors);else for(const[type,value]of wired)if(type.destructorFunction!==null)type.destructorFunction(value)}if(argTypes[0].name!=="void")return argTypes[0].fromWireType(result)};Object.defineProperties(invoke,{name:{value:makeLegalFunctionName(humanName),configurable:true},length:{value:count,configurable:true}});return invoke}`;
export function PrepareWoff2() {
  const file=resolve(root,'dist/vendor/woff2.js'),source=readFileSync(file,'utf8');
  const original='0d5f0fa679f3c6f68eb2157e8041c543dd17c2c2f56be30169273944db6d331a';
  const compiled='88aeabb7ea843da22e70e7c444977b4e73fb3cac2930621198532fde2b3a77e1';
  const before=hash(source);
  if(before===compiled)return {inputSha256:original,outputSha256:compiled,kind:'WOFF2 static JavaScript invokers; embedded WASM unchanged'};
  if(before!==original)throw new Error('Unreviewed WOFF2 dependency revision; refusing a speculative patch.');
  let output=source;
  for(const[start,end,replacement]of [['function createNamedFunction','function extendError',named],['function craftInvokerFunction','function ensureOverloadTable',invoker]]){
    const a=output.indexOf(start),b=output.indexOf(end,a+1);
    if(a<0||b<a||output.indexOf(start,a+1)!==-1)throw new Error('WOFF2 adapter patch context changed.');
    output=output.slice(0,a)+replacement+output.slice(b);
  }
  // ENVIRONMENT_IS_NODE is hard-coded false in this embedded decoder. Make
  // its dead require(fs/path) branches explicit to browser bundlers.
  output=output.replaceAll('if(ENVIRONMENT_IS_NODE)','if(false)');
  if(hash(output)!==compiled)throw new Error('Unexpected WOFF2 adapter output.');
  writeFileSync(file,output);
  return {inputSha256:original,outputSha256:compiled,kind:'WOFF2 static JavaScript invokers; embedded WASM unchanged'};
}
