import {createHash,timingSafeEqual} from 'node:crypto';
// Read-only mainnet queries. This module never constructs, signs, or broadcasts payments.
export const TRON_USDT='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const NODE='https://api.trongrid.io';
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const TRANSFER='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export class SettlementFault extends Error {constructor(message:string,public status=409){super(message);}}
export function tronHex(address:string){
 if(!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address))throw new SettlementFault('Enter a valid TRC20 (TRON) wallet address.');
 let n=BigInt(0);for(const char of address)n=n*BigInt(58)+BigInt(ALPHABET.indexOf(char));
 const bytes=Buffer.from(n.toString(16).padStart(50,'0'),'hex'),payload=bytes.subarray(0,21);
 const hash=createHash('sha256').update(createHash('sha256').update(payload).digest()).digest();
 if(bytes.length!==25||payload[0]!==65||!timingSafeEqual(bytes.subarray(21),hash.subarray(0,4)))throw new SettlementFault('The TRON address checksum is invalid. Check the pasted address.');
 return payload.toString('hex');
}
export function validTronAddress(value:string){try{tronHex(value);return true;}catch{return false;}}
async function query(path:string,body:unknown,key:string,fetcher:typeof fetch){
 let response:Response;
 try{response=await fetcher(NODE+path,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'TRON-PRO-API-KEY':key}:{})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});}
 catch{throw new SettlementFault('TRON verification is temporarily unavailable. No transfer or balance change was confirmed.',503);}
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new SettlementFault('TRON verification could not be completed (HTTP '+response.status+'). Do not send a replacement transfer.',503);}
 const reader=response.body?.getReader();if(!reader)throw new SettlementFault('TRON returned no verification result.',503);
 let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>131072){await reader.cancel().catch(()=>{});throw new SettlementFault('TRON response exceeded the verification limit.',503);}chunks.push(part.value);}}
 catch(e){if(e instanceof SettlementFault)throw e;throw new SettlementFault('TRON verification was interrupted. Funds remain locked.',503);}
 finally{reader.releaseLock();}
 const bytes=Buffer.concat(chunks);let result;
 try{result=JSON.parse(bytes.toString('utf8'));}catch{throw new SettlementFault('TRON returned an unreadable verification result.',503);}
 if(!result||typeof result!=='object'||Array.isArray(result))throw new SettlementFault('TRON response could not be verified.',503);
 return result as Record<string,unknown>;
}
export async function reserveBalance(sender:string,key='',fetcher:typeof fetch=fetch){
 const hex=tronHex(sender);
 const result=await query('/walletsolidity/triggerconstantcontract',{owner_address:sender,contract_address:TRON_USDT,function_selector:'balanceOf(address)',parameter:hex.slice(2).padStart(64,'0'),visible:true},key,fetcher);
 const success=result.result as {result?:boolean}|undefined,values=result.constant_result as unknown[]|undefined;
 if(success?.result!==true||!Array.isArray(values)||typeof values[0]!=='string'||!/^[a-fA-F0-9]{64}$/.test(values[0]))throw new SettlementFault('The sending wallet USDT balance could not be verified.',503);
 const amount=BigInt('0x'+values[0]);if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw new SettlementFault('The reserve balance is outside the supported range.',503);
 return Number(amount);
}
export type TransferExpectation={txHash:string;sender:string;recipient:string;quantity:number;created:number};
export async function verifyTrc20Transfer(expected:TransferExpectation,key='',fetcher:typeof fetch=fetch){
 if(!/^[a-f0-9]{64}$/.test(expected.txHash))throw new SettlementFault('Enter the 64-character TRON transaction ID.');
 if(!Number.isSafeInteger(expected.quantity)||expected.quantity<=0||!Number.isSafeInteger(expected.created)||expected.created<=0)throw new SettlementFault('Withdrawal verification details are invalid.');
 const sender=tronHex(expected.sender).slice(2),recipient=tronHex(expected.recipient).slice(2);
 const receipt=await query('/walletsolidity/gettransactioninfobyid',{value:expected.txHash},key,fetcher);
 const execution=receipt.receipt as {result?:string}|undefined;
 if(receipt.id!==expected.txHash||execution?.result!=='SUCCESS'||!Number.isSafeInteger(receipt.blockNumber)||Number(receipt.blockNumber)<=0)throw new SettlementFault('This transaction is not yet confirmed successful on TRON. Do not send again; recheck the same transaction.');
 if(!Number.isSafeInteger(receipt.blockTimeStamp)||Number(receipt.blockTimeStamp)<expected.created)throw new SettlementFault('This transaction predates the withdrawal request.');
 const logs=receipt.log;
 if(!Array.isArray(logs))throw new SettlementFault('No USDT transfer event was found.');
 const contract=tronHex(TRON_USDT).slice(2);
 const matches=logs.filter(log=>log&&typeof log==='object'&&typeof log.address==='string'&&log.address.toLowerCase()===contract&&Array.isArray(log.topics)&&log.topics.length===3&&log.topics[0]===TRANSFER&&log.topics[1]===sender.padStart(64,'0')&&log.topics[2]===recipient.padStart(64,'0'));
 if(matches.length!==1||typeof matches[0].data!=='string'||!/^[a-f0-9]{64}$/i.test(matches[0].data)||BigInt('0x'+matches[0].data)!==BigInt(expected.quantity))throw new SettlementFault('USDT contract, sender, recipient or amount does not match this withdrawal. Balance remains locked.');
 return {txHash:expected.txHash,blockNumber:Number(receipt.blockNumber),confirmedAt:Number(receipt.blockTimeStamp)};
}
