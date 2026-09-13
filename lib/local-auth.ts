import {scrypt,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {env} from '@/lib/runtime-env';

const db=()=> (env as unknown as {DB:D1Database}).DB;
export class AuthFault extends Error {constructor(message:string,public status=400){super(message);}}
export type LocalAccount={id:string;name:string;email:string;mobile:string;password_hash:string;created:number;referred_by?:string|null};
export const referralCode=(id:string)=>'NX'+id.replace(/^u-/,'').toUpperCase();
export function adminRegistrationCode(){
 const code=(env as unknown as {NEXA_REGISTRATION_CODE?:string}).NEXA_REGISTRATION_CODE?.trim().toUpperCase()||'';
 return /^NX[0-9A-F]{16}$/.test(code)?code:'';
}
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
let hashing=false;
export async function derive(password:string,salt:string){
 // One memory-hard hash at a time in this isolate. Limits remain durable in D1.
 if(hashing)throw new AuthFault('Sign-in is busy. Please retry in a moment.',429);
 hashing=true;
 try{return await new Promise<Buffer>((resolve,reject)=>scrypt(password,Buffer.from(salt,'hex'),32,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));}
 finally{hashing=false;}
}
export async function throttle(request:Request,email:string){
 const now=Date.now(),expires=now+15*60*1000;
 const vercel=(env as unknown as {NEXA_RUNTIME?:string}).NEXA_RUNTIME==='vercel';
 const ip=request.headers.get(vercel?'x-vercel-forwarded-for':'cf-connecting-ip')||'loopback';
 const pairs:[[string,number],[string,number]]=[['ip:'+digest(ip),80],['email:'+digest(email),10]];
 const results=await db().batch(pairs.map(([key])=>db().prepare('INSERT INTO auth_limits (key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_limits.expires<=? THEN 1 ELSE auth_limits.attempts+1 END, expires=CASE WHEN auth_limits.expires<=? THEN ? ELSE auth_limits.expires END RETURNING attempts').bind(key,expires,now,now,expires)));
 if(results.some((result,i)=>Number((result.results[0] as {attempts:number}).attempts)>pairs[i][1]))throw new AuthFault('Too many attempts. Please try again in 15 minutes.',429);
 await db().prepare('DELETE FROM auth_limits WHERE expires<?').bind(now).run();
}
function credentials(input:Record<string,unknown>){
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 const password=typeof input.password==='string'?input.password:'';
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<1||password.length>128)throw new AuthFault('Enter a valid email and your Nexa app password.');
 return {email,password};
}
export async function register(request:Request,input:Record<string,unknown>){
 const {email,password}=credentials(input);await throttle(request,email);
 const name=typeof input.name==='string'?input.name.trim():'',mobile=typeof input.mobile==='string'?input.mobile.trim():'';
 if(name.length<2||name.length>50||!/^[0-9]{10}$/.test(mobile))throw new AuthFault('Enter your name and a 10-digit mobile number.');
 if(password.length<15)throw new AuthFault('Use a new Nexa app password of 15–128 characters. Do not use your Gmail password.');
 const code=typeof input.referralCode==='string'?input.referralCode.trim().toUpperCase():'';
 if(!code)throw new AuthFault('A referral code is required to create an account. Ask your inviter for a code.');
 if(!/^NX[0-9A-F]{16}$/.test(code))throw new AuthFault('Referral code is not valid.');
 let referredBy:string|null=null;
 if(code===adminRegistrationCode())referredBy='admin';
 else{
  const owner=await db().prepare('SELECT id FROM local_accounts WHERE id=?').bind('u-'+code.slice(2).toLowerCase()).first<{id:string}>();
  if(!owner)throw new AuthFault('Referral code was not found.');
  referredBy=owner.id;
 }
 const exists=await db().prepare('SELECT id FROM local_accounts WHERE email=? OR mobile=?').bind(email,mobile).first();
 if(exists)throw new AuthFault('Unable to register these details. If you already have an account, log in.',409);
 const salt=randomBytes(16).toString('hex'),hash=await derive(password,salt);
 const account:LocalAccount={id:'u-'+randomBytes(8).toString('hex'),name,email,mobile,password_hash:'scrypt:32768:8:3:'+salt+':'+hash.toString('hex'),created:Date.now(),referred_by:referredBy};
 try{await db().prepare('INSERT INTO local_accounts (id,name,email,mobile,password_hash,created,referred_by) VALUES (?,?,?,?,?,?,?)').bind(account.id,name,email,mobile,account.password_hash,account.created,account.referred_by).run();}
 catch{throw new AuthFault('Unable to register these details. If you already have an account, log in.',409);}
 return account;
}
export async function authenticate(request:Request,input:Record<string,unknown>){
 const {email,password}=credentials(input);await throttle(request,email);
 const account=await db().prepare('SELECT * FROM local_accounts WHERE email=?').bind(email).first<LocalAccount>();
 const fields=(account?.password_hash||'scrypt:32768:8:3:00000000000000000000000000000000:'+ '0'.repeat(64)).split(':');
 const derived=await derive(password,fields[4]);
 if(!account||!timingSafeEqual(derived,Buffer.from(fields[5],'hex')))throw new AuthFault('Email or app password is incorrect.',401);
 return account;
}
export async function registeredIdentity(id:string){return !!await db().prepare('SELECT id FROM local_accounts WHERE id=?').bind(id).first();}
