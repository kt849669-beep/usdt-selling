import 'server-only';
import {env} from '@/lib/runtime-env';
import {encrypt,decrypt,isEncrypted,encodeAccount,decodeAccount,lookup,type AccountFields} from './storage-crypto';

const encryptionKey=()=>String((env as unknown as Record<string,unknown>).NEXA_DATA_ENCRYPTION_KEY||'');
const lookupKey=()=>String((env as unknown as Record<string,unknown>).NEXA_DATA_LOOKUP_KEY||'');
export const storeAccount=<T extends AccountFields>(account:T)=>encodeAccount(account,encryptionKey(),lookupKey());
export const readAccount=<T extends AccountFields>(account:T)=>decodeAccount(account,encryptionKey(),lookupKey());
export const accountLookup=(value:string,field:'email'|'mobile')=>lookup(value,field,lookupKey());
export const storeState=(value:unknown)=>encrypt(JSON.stringify(value),'state:1',encryptionKey());
export const readState=<T>(value:string):T=>JSON.parse(isEncrypted(value)?decrypt(value,'state:1',encryptionKey()):value) as T;
