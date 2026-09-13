import {env} from '@/lib/runtime-env';

export const appAdminAuth=()=> (env as unknown as {NEXA_RUNTIME?:string}).NEXA_RUNTIME==='vercel';
export function publicOrigin(){
 const value=(env as unknown as {NEXA_PUBLIC_ORIGIN?:string}).NEXA_PUBLIC_ORIGIN;
 if(!value)return '';
 try{const url=new URL(value);return url.protocol==='https:'?url.origin:'';}catch{return '';}
}
export function applicationOrigin(request:Request){
 const url=new URL(request.url),configured=publicOrigin();
 if(!appAdminAuth())return configured?(url.origin===configured?configured:''):(['localhost','127.0.0.1','[::1]'].includes(url.hostname)?url.origin:'');
 // Next may normalize Request.url to localhost internally. Match the incoming
 // Host only against our configured origin; never trust forwarded identities.
 const host=request.headers.get('host')||url.host;
 if(configured)return host===new URL(configured).host?configured:'';
 try{
  const local=new URL('http://'+host);
  if(local.host!==host||local.username||local.password||local.pathname!=='/'||local.search||local.hash)return '';
  return ['localhost','127.0.0.1','[::1]'].includes(local.hostname)&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&local.port===url.port?local.origin:'';
 }catch{return '';}
}
export function adminConfigured(){return !!(env as unknown as {NEXA_ADMIN_EMAIL?:string}).NEXA_ADMIN_EMAIL?.trim();}
export function permittedAdmin(userId:string|null|undefined,email:string|null|undefined){
 if(appAdminAuth())return false;
 const allowed=(env as unknown as {NEXA_ADMIN_EMAIL?:string}).NEXA_ADMIN_EMAIL?.trim().toLowerCase();
 return !!publicOrigin()&&!!allowed&&!!userId&&email?.trim().toLowerCase()===allowed;
}
