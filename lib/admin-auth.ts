import {createHash,timingSafeEqual} from 'node:crypto';
import {env} from '@/lib/runtime-env';
import {AuthFault,derive,throttle} from './local-auth';
const vars=()=>env as unknown as {NEXA_ADMIN_EMAIL?:string;NEXA_ADMIN_PASSWORD_HASH?:string};
export function appAdminConfigured(){
 const {NEXA_ADMIN_EMAIL:email,NEXA_ADMIN_PASSWORD_HASH:hash}=vars();
 return !!email?.trim()&&/^scrypt:32768:8:3:[a-f0-9]{32}:[a-f0-9]{64}$/.test(hash||'');
}
function adminIdentity(){
 if(!appAdminConfigured())return '';
 return 'admin:'+createHash('sha256').update(vars().NEXA_ADMIN_EMAIL!.trim().toLowerCase()+':'+vars().NEXA_ADMIN_PASSWORD_HASH!).digest('hex');
}
export function isCurrentAdmin(identity:string){return !!identity&&identity===adminIdentity();}
export async function authenticateAdmin(request:Request,input:Record<string,unknown>){
 if(!appAdminConfigured())throw new AuthFault('Administrator sign-in has not been configured.',503);
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 const password=typeof input.password==='string'?input.password:'';
 if(email.length>254||password.length<1||password.length>128)throw new AuthFault('Enter your administrator email and password.');
 await throttle(request,'admin:'+email);
 const fields=vars().NEXA_ADMIN_PASSWORD_HASH!.split(':');
 const candidate=await derive(password,fields[4]);
 const valid=timingSafeEqual(candidate,Buffer.from(fields[5],'hex'));
 if(!valid||email!==vars().NEXA_ADMIN_EMAIL!.trim().toLowerCase())throw new AuthFault('Administrator email or password is incorrect.',401);
 return adminIdentity();
}
export async function hasAdminSession(token:string){
 if(!/^[a-f0-9]{64}$/.test(token)||!appAdminConfigured())return false;
 const db=(env as unknown as {DB:D1Database}).DB;
 const row=await db.prepare('SELECT identity FROM demo_sessions WHERE token=? AND expires>?').bind(token,Date.now()).first<{identity:string}>();
 return !!row&&isCurrentAdmin(row.identity);
}
