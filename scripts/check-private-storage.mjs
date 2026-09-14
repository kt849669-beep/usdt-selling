import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {moduleLoader} from './load-test-module.mjs';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE local_accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,mobile TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created INTEGER NOT NULL,referred_by TEXT);
CREATE TABLE auth_limits(key TEXT PRIMARY KEY,attempts INTEGER,expires INTEGER);
CREATE TABLE demo_state(id INTEGER PRIMARY KEY,data TEXT,revision INTEGER);
CREATE TABLE demo_sessions(token TEXT PRIMARY KEY,identity TEXT,expires INTEGER);`);
const db={prepare(query){const statement=(values=[])=>({bind:(...next)=>statement(next),
 first:async()=>sqlite.prepare(query).get(...values)||null,
 run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...values).changes)}}),
 all:async()=>({results:sqlite.prepare(query).all(...values)})
 });return statement();}};
db.batch=async statements=>{sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.all());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}};
const env={DB:db,NEXA_RUNTIME:'vercel',NEXA_PUBLIC_ORIGIN:'https://nexa.example',NEXA_REGISTRATION_CODE:'NX0123456789ABCDEF',NEXA_DATA_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex'),NEXA_DATA_LOOKUP_KEY:crypto.randomBytes(32).toString('hex'),DIVINEPAY_API_KEY:'sk_live_test_not_a_real_key',NEXA_ENABLE_GATEWAY_CHECKOUT:'true'};
const load=moduleLoader(env),codec=load('lib/storage-crypto.ts'),storage=load('lib/private-storage.ts'),auth=load('lib/local-auth.ts'),server=load('lib/server.ts');
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const sample={id:'u-1234',name:'Private QA',email:'private@example.invalid',mobile:'0000000001'};
const encoded=codec.encodeAccount(sample,env.NEXA_DATA_ENCRYPTION_KEY,env.NEXA_DATA_LOOKUP_KEY);
check(!JSON.stringify(encoded).includes(sample.email)&&!JSON.stringify(encoded).includes(sample.mobile)&&!JSON.stringify(encoded).includes(sample.name),'PII not stored in plaintext');
check(JSON.stringify(codec.decodeAccount(encoded,env.NEXA_DATA_ENCRYPTION_KEY,env.NEXA_DATA_LOOKUP_KEY))===JSON.stringify(sample),'PII roundtrip');
const second=codec.encodeAccount(sample,env.NEXA_DATA_ENCRYPTION_KEY,env.NEXA_DATA_LOOKUP_KEY);
check(encoded.name!==second.name&&encoded.email===second.email,'Random nonces and stable keyed indexes');
for(const altered of [{...encoded,id:'another-id'},{...encoded,email:second.mobile},{...encoded,name:encoded.name.slice(0,-10)+'AAAAAAAAAA'}]){assert.throws(()=>codec.decodeAccount(altered,env.NEXA_DATA_ENCRYPTION_KEY,env.NEXA_DATA_LOOKUP_KEY));checks++;}
assert.throws(()=>codec.decodeAccount(encoded,'f'.repeat(64),env.NEXA_DATA_LOOKUP_KEY));checks++;
assert.throws(()=>codec.encrypt('data','context',''));checks++;
check(codec.lookup('same','email',env.NEXA_DATA_LOOKUP_KEY)!==codec.lookup('same','mobile',env.NEXA_DATA_LOOKUP_KEY),'Lookup field separation');
const base='https://nexa.example';
async function api(body,{admin=false,cookie='',headers={}}={}){
 const request=new Request(base+'/api/server'+(!body&&admin?'?workspace=admin':''),{method:body?'POST':'GET',headers:{host:'nexa.example',origin:base,...(body?{'content-type':'application/json'}:{}),...(admin?{'x-demo-workspace':'admin'}:{}),...(cookie?{cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});
 const r=await (body?server.POST:server.GET)(request);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
try{
 const account={name:'Encrypted User',email:'encrypted@example.invalid',mobile:'0000000002',password:'new-password-'+crypto.randomBytes(16).toString('hex')};
 for(const code of [undefined,'','bad','NXFFFFFFFFFFFFFFFF']){const r=await api({action:'register',...account,referralCode:code});check(r.status===400,'Mandatory valid referral');}
 check(sqlite.prepare('SELECT count(*) n FROM local_accounts').get().n===0,'No partial signup');
 let r=await api({action:'register',...account,referralCode:env.NEXA_REGISTRATION_CODE});check(r.status===201,'Signup succeeds');
 const row=sqlite.prepare('SELECT * FROM local_accounts').get();
 check(row.name.startsWith('enc:v1:')&&row.email.startsWith('lookup:v1:')&&row.mobile.startsWith('lookup:v1:'),'Account encrypted at rest');
 check(row.password_hash.startsWith('scrypt:32768:8:3:')&&!row.password_hash.includes(account.password),'Password salted scrypt');
 check(sqlite.prepare('SELECT data FROM demo_state').get().data.startsWith('enc:v1:'),'Profile and order state encrypted');
 r=await api({action:'register',...account,referralCode:env.NEXA_REGISTRATION_CODE});check(r.status===409,'Duplicate encrypted identity rejected');
 r=await api({action:'login',email:account.email,password:account.password});check(r.status===200,'Encrypted account login');const cookie=r.cookie;
 r=await api(undefined,{cookie});check(r.data.user.email===account.email&&r.data.user.available===0,'Own decrypted profile and zero balance');
 check(!JSON.stringify(r.data).includes('password_hash')&&!JSON.stringify(r.data).includes('lookup:v1:'),'No stored credentials or lookup indexes exposed');
 check(!r.data.gateway.enabled&&!r.data.gateway.creditEnabled,'Real funds gate stays closed even with key and environment flag');
 check(r.data.gateway.configured&&!JSON.stringify(r.data).includes(env.DIVINEPAY_API_KEY),'Server key is configured but never exposed in the API');
 const gatewayKey=env.DIVINEPAY_API_KEY;delete env.DIVINEPAY_API_KEY;
 r=await api(undefined,{cookie});check(!r.data.gateway.configured,'No hardcoded key fallback when server key is absent');
 env.DIVINEPAY_API_KEY=gatewayKey;
 const stateBeforeCheckout=sqlite.prepare('SELECT data,revision FROM demo_state').get();
 r=await api({action:'checkout',orderId:'NX-OFFLINE'},{cookie});check(r.status===503,'Live checkout blocked before any external request');
 const stateAfterCheckout=sqlite.prepare('SELECT data,revision FROM demo_state').get();
 check(stateBeforeCheckout.data===stateAfterCheckout.data&&stateBeforeCheckout.revision===stateAfterCheckout.revision,'Blocked checkout does not change existing orders or balances');
 r=await api(undefined,{admin:true,headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'owner@example.invalid'}});check(r.status===401,'Spoofed Sites headers denied on Vercel');
 const salt=crypto.randomBytes(16).toString('hex'),password=crypto.randomBytes(24).toString('hex');
 env.NEXA_ADMIN_EMAIL='owner@example.invalid';env.NEXA_ADMIN_PASSWORD_HASH='scrypt:32768:8:3:'+salt+':'+(await auth.derive(password,salt)).toString('hex');
 r=await api({action:'login',email:env.NEXA_ADMIN_EMAIL,password},{admin:true});check(r.status===200,'Admin password login works');
 r=await api(undefined,{admin:true,cookie:r.cookie});check(r.data.users.some(u=>u.email===account.email),'Admin can read encrypted profile after authorization');
 r=await api({action:'funds',amount:100},{cookie});check(r.status===409,'No manual fake balance credit');
 // Legacy records remain readable during the bounded conversion.
 const legacy={...account,email:'legacy@example.invalid',mobile:'0000000003'};
 sqlite.prepare('INSERT INTO local_accounts VALUES (?,?,?,?,?,?,?)').run('u-legacy',legacy.name,legacy.email,legacy.mobile,row.password_hash,Date.now(),'admin');
 r=await api({action:'login',email:legacy.email,password:account.password});check(r.status===200,'Existing plaintext account login preserved');
 const parser=load('lib/api-response.ts').readApiResponse;
 for(const response of [new Response('<!DOCTYPE html>404',{status:404,headers:{'content-type':'text/html'}}),new Response('{bad',{headers:{'content-type':'application/json'}}),Response.json(null),Response.json({error:'<html>bad</html>'},{status:500})]){await assert.rejects(()=>parser(response),e=>!e.message.includes('<')&&!e.message.includes('Unexpected token'));checks++;}
 check((await parser(Response.json({ok:true}))).ok,'Valid JSON parsed');
 await assert.rejects(()=>parser(Response.json({error:'Referral code is required.'},{status:400})),/Referral code is required/);checks++;
 console.log(checks+' account security, referral, API, admin and payment-gate checks passed. No external payment requests made.');
}finally{sqlite.close();}
