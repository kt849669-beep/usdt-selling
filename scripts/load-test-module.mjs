import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url));
export function moduleLoader(env){
 const cache=new Map();
 function load(file){
  const absolute=path.resolve(root,file);
  if(cache.has(absolute))return cache.get(absolute);
  const exports={};cache.set(absolute,exports);
  const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,Buffer,URL,Request,Response,TextEncoder,TextDecoder,Uint8Array,console,crypto:crypto.webcrypto,fetch:()=>{throw new Error('Real network requests are forbidden in offline tests.');},require:name=>{
   if(name==='server-only')return {};
   if(name==='node:crypto')return crypto;
   if(name==='@/lib/runtime-env')return {env};
   if(name.startsWith('./'))return load(path.resolve(path.dirname(absolute),name+'.ts'));
   throw new Error('Unexpected test import: '+name);
  }},{filename:absolute});
  return exports;
 }
 return load;
}
