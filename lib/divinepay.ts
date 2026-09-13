// Provider contract supplied by the user. No secret or upstream body reaches the client.
const API='https://divinepay.us.cc';
const CASHIER='https://cashiernew.blue-pay.vip';
export class GatewayFault extends Error {constructor(message:string,public uncertain=false){super(message);}}
type RecordValue=Record<string,unknown>;
function record(value:unknown):RecordValue{if(!value||typeof value!=='object'||Array.isArray(value))throw new GatewayFault('Invalid gateway response.',true);return value as RecordValue;}
export function checkoutUrl(value:unknown){
 if(typeof value!=='string'||value.length>2048)throw new GatewayFault('Gateway returned an invalid checkout URL.',true);
 const url=new URL(value);
 if(url.origin!==CASHIER||url.username||url.password||!url.hash.startsWith('#/mobile?')||!new URLSearchParams(url.hash.split('?')[1]).get('orderId'))throw new GatewayFault('Gateway returned an unapproved checkout URL.',true);
 return url.href;
}
async function post(path:string,body:RecordValue,key:string,fetcher:typeof fetch){
 let response:Response;
 try{response=await fetcher(API+path,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});}
 catch{throw new GatewayFault('The gateway outcome is unknown. Do not start another payment.',true);}
 // A timeout, redirect, non-JSON response or server error must never auto-retry creation.
 if(!response.ok)throw new GatewayFault('Gateway request did not return a confirmed result.',true);
 const reader=response.body?.getReader();if(!reader)throw new GatewayFault('Gateway returned an empty response.',true);
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel();throw new GatewayFault('Gateway response too large.',true);}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let value:RecordValue;try{value=record(JSON.parse(new TextDecoder().decode(bytes)));}catch{throw new GatewayFault('Gateway response could not be verified.',true);}
 if(value.success!==true)throw new GatewayFault('Gateway rejected this request.');
 return record(value.data);
}
export async function createPayin(fiat:number,key:string,fetcher:typeof fetch=fetch){
 const data=await post('/api/payin/payin/create',{amount:fiat/100},key,fetcher);
 if(typeof data.order_id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(data.order_id))throw new GatewayFault('Gateway order ID is missing or invalid.',true);
 return {providerOrderId:data.order_id,checkoutUrl:checkoutUrl(data.paymentUrl)};
}
export async function submitUtr(orderId:string,utr:string,key:string,fetcher:typeof fetch=fetch){
 if(!/^\d{12}$/.test(utr))throw new GatewayFault('Enter the 12-digit UTR.');
 const data=await post('/api/payin/submit-utr',{order_id:orderId,utr},key,fetcher);
 if(data.order_id!==orderId)throw new GatewayFault('Gateway returned a different order ID.',true);
 // Submission is not proof of settlement. The caller separately checks status.
}
export async function payinStatus(orderId:string,fiat:number,key:string,fetcher:typeof fetch=fetch){
 const data=await post('/api/payin/status',{order_id:orderId},key,fetcher);
 if(data.order_id!==orderId||!['success','pending','failed'].includes(String(data.status)))throw new GatewayFault('Payment status could not be verified.',true);
 if(typeof data.amount!=='number'||!Number.isFinite(data.amount)||Math.abs(data.amount*100-fiat)>0.000001)throw new GatewayFault('Payment amount does not match this order. Balance has not been credited.',true);
 return data.status as 'success'|'pending'|'failed';
}
