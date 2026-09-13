// Offline registration-policy checks; no production accounts or payments.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../postgres/0001_initial.sql',import.meta.url),'utf8'));
const db={prepare(query){return {bind(...values){return {
 first:async()=>sqlite.prepare(query).get(...values)||null,
 run:async()=>sqlite.prepare(query).run(...values),
 all:async()=>({results:sqlite.prepare(query).all(...values)})
};}};}};
db.batch=async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.all());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}};
const vars={DB:db,NEXA_RUNTIME:'vercel',NEXA_REGISTRATION_CODE:'NX0123456789ABCDEF'};
const exports={};
const source=fs.readFileSync(new URL('../lib/local-auth.ts',import.meta.url),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,console,require:name=>name==='node:crypto'?crypto:name==='@/lib/runtime-env'?{env:vars}:(()=>{throw new Error(name);})()});
const request=new Request('https://nexa.example/api/demo',{headers:{'x-vercel-forwarded-for':'127.0.0.1'}});
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const input=n=>({name:'Referral QA '+n,email:'referral-'+n+'@example.invalid',mobile:'000000000'+n,password:'referral-test-'+crypto.randomBytes(16).toString('hex')});
try{
 const first=input(1);
 for(const referralCode of [undefined,'','   ','INVALID','NXFFFFFFFFFFFFFFFF']){
  await assert.rejects(()=>exports.register(request,{...first,referralCode}),error=>error.status===400);checks++;
 }
 check(sqlite.prepare('SELECT COUNT(*) n FROM local_accounts').get().n===0,'Missing and invalid codes create no accounts');
 const a=await exports.register(request,{...first,referralCode:vars.NEXA_REGISTRATION_CODE.toLowerCase()});
 check(a.referred_by==='admin','Shared code attributes registration to admin');
 const second=input(2),b=await exports.register(request,{...second,referralCode:vars.NEXA_REGISTRATION_CODE});
 check(b.id!==a.id&&b.referred_by==='admin','The same admin code can be reused');
 const signedIn=await exports.authenticate(request,first);
 check(signedIn.id===a.id,'Existing account sign-in requires no referral code');
 const third=input(3),c=await exports.register(request,{...third,referralCode:exports.referralCode(a.id)});
 check(c.referred_by===a.id,'Existing personal referral codes retain attribution');
 vars.NEXA_REGISTRATION_CODE='';
 check(exports.adminRegistrationCode()==='','No fallback shared code when unconfigured');
 await assert.rejects(()=>exports.register(request,{...input(4),referralCode:'NX0123456789ABCDEF'}),error=>error.status===400);checks++;
 check(sqlite.prepare('SELECT COUNT(*) n FROM local_accounts').get().n===3,'Rejected registration creates no partial account');
 console.log(checks+' referral-policy checks passed. Shared code is reusable; no-code registration is rejected.');
}finally{sqlite.close();}
