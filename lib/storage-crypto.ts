import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';

const prefix='enc:v1:';
function key(value:string){
 if(!/^[a-f0-9]{64}$/i.test(value))throw new Error('Private storage key is not configured.');
 return Buffer.from(value,'hex');
}
export const isEncrypted=(value:string)=>value.startsWith(prefix);
export function encrypt(value:string,context:string,secret:string){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);
 cipher.setAAD(Buffer.from('nexa:v1:'+context));
 const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return prefix+Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url');
}
export function decrypt(value:string,context:string,secret:string){
 if(!isEncrypted(value))throw new Error('Encrypted record required.');
 const payload=Buffer.from(value.slice(prefix.length),'base64url');
 if(payload.length<28)throw new Error('Invalid encrypted record.');
 const decipher=createDecipheriv('aes-256-gcm',key(secret),payload.subarray(0,12));
 decipher.setAAD(Buffer.from('nexa:v1:'+context));
 decipher.setAuthTag(payload.subarray(12,28));
 return Buffer.concat([decipher.update(payload.subarray(28)),decipher.final()]).toString('utf8');
}
export function lookup(value:string,field:'email'|'mobile',secret:string){
 return 'lookup:v1:'+createHmac('sha256',key(secret)).update('nexa:lookup:v1:'+field+'\0'+value).digest('hex');
}
export type AccountFields={id:string;name:string;email:string;mobile:string};
// Reuse the existing unique email/mobile indexes for keyed lookups. Actual
// name/email/mobile are encrypted together in the name column, bound to this ID.
export function encodeAccount<T extends AccountFields>(account:T,encryptionKey:string,lookupKey:string):T{
 return {...account,name:encrypt(JSON.stringify({name:account.name,email:account.email,mobile:account.mobile}),'account:'+account.id,encryptionKey),email:lookup(account.email,'email',lookupKey),mobile:lookup(account.mobile,'mobile',lookupKey)};
}
export function decodeAccount<T extends AccountFields>(account:T,encryptionKey:string,lookupKey:string):T{
 if(!isEncrypted(account.name)){
  if(account.email.startsWith('lookup:')||account.mobile.startsWith('lookup:'))throw new Error('Incomplete encrypted account.');
  return account; // Existing plaintext records are converted by the bounded migration.
 }
 const fields=JSON.parse(decrypt(account.name,'account:'+account.id,encryptionKey)) as AccountFields;
 if(typeof fields.name!=='string'||typeof fields.email!=='string'||typeof fields.mobile!=='string'||lookup(fields.email,'email',lookupKey)!==account.email||lookup(fields.mobile,'mobile',lookupKey)!==account.mobile)throw new Error('Invalid private account record.');
 return {...account,name:fields.name,email:fields.email,mobile:fields.mobile};
}
