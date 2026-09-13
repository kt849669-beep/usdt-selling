import {env} from 'cloudflare:workers';

export function publicOrigin(){
 const value=(env as unknown as {NEXA_PUBLIC_ORIGIN?:string}).NEXA_PUBLIC_ORIGIN;
 if(!value)return '';
 try{const url=new URL(value);return url.protocol==='https:'?url.origin:'';}catch{return '';}
}
export function adminConfigured(){return !!(env as unknown as {NEXA_ADMIN_EMAIL?:string}).NEXA_ADMIN_EMAIL?.trim();}
export function permittedAdmin(userId:string|null|undefined,email:string|null|undefined){
 const allowed=(env as unknown as {NEXA_ADMIN_EMAIL?:string}).NEXA_ADMIN_EMAIL?.trim().toLowerCase();
 return !!publicOrigin()&&!!allowed&&!!userId&&email?.trim().toLowerCase()===allowed;
}
