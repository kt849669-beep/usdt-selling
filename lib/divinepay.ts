// Provider contract supplied by the user. Test with mocks; no live collection in this prototype.
const API='https://divinepay.us.cc';
const CASHIER='https://cashiernew.blue-pay.vip';
type Operation='create'|'submit_utr'|'status';
type DiagnosticCode='NOT_CONFIGURED'|'INVALID_AMOUNT'|'INVALID_UTR'|'TIMEOUT'|'NETWORK_ERROR'|'HTTP_ERROR'|'EMPTY_RESPONSE'|'RESPONSE_TOO_LARGE'|'RESPONSE_READ_ERROR'|'INVALID_JSON'|'INVALID_RESPONSE'|'PROVIDER_REJECTED'|'INVALID_ORDER_ID'|'INVALID_CHECKOUT_URL'|'UNAPPROVED_CHECKOUT_URL'|'ORDER_ID_MISMATCH'|'INVALID_STATUS'|'AMOUNT_MISMATCH'|'CURRENCY_MISMATCH'|'DUPLICATE_ORDER_ID'|'ATTEMPT_CHANGED'|'RECORD_SAVE_FAILED'|'UNVERIFIED_OUTCOME';
type ResponseType='json'|'html'|'text'|'other'|'missing';
type Details={code:DiagnosticCode;operation?:Operation;httpStatus?:number;responseType?:ResponseType;providerOrderId?:string;recordSaved?:boolean};
export class GatewayFault extends Error {
 readonly reference='GW-'+crypto.randomUUID();
 constructor(message:string,public uncertain=false,public details:Details={code:'UNVERIFIED_OUTCOME'}){super(message);this.name='GatewayFault';}
}
// Only internally classified fields reach logs. Never log the key, URL, UTR, body or exception cause.
export function gatewayDiagnostic(error:GatewayFault){
 const {code,operation,httpStatus,responseType,recordSaved}=error.details;
 return {event:'gateway_failure',reference:error.reference,code,operation,httpStatus,responseType,uncertain:error.uncertain,recordSaved};
}
type RecordValue=Record<string,unknown>;
const isRecord=(value:unknown):value is RecordValue=>!!value&&typeof value==='object'&&!Array.isArray(value);
const validOrderId=(value:unknown):value is string=>typeof value==='string'&&/^[-a-zA-Z0-9_]{1,100}$/.test(value);
function responseType(value:string|null):ResponseType{
 const type=(value||'').split(';')[0].trim().toLowerCase();
 return !type?'missing':type==='application/json'||type.endsWith('+json')?'json':type==='text/html'?'html':type.startsWith('text/')?'text':'other';
}
function timedOut(error:unknown){return isRecord(error)&&['AbortError','TimeoutError'].includes(String(error.name));}
export function checkoutUrl(value:unknown){
 if(typeof value!=='string'||value.length>2048)throw new GatewayFault('Gateway returned an invalid checkout URL.',true,{code:'INVALID_CHECKOUT_URL'});
 let url:URL;
 try{url=new URL(value);}catch{throw new GatewayFault('Gateway returned an invalid checkout URL.',true,{code:'INVALID_CHECKOUT_URL'});}
 if(url.origin!==CASHIER||url.username||url.password||url.pathname!=='/'||!url.hash.startsWith('#/mobile?')||!validOrderId(new URLSearchParams(url.hash.slice('#/mobile?'.length)).get('orderId')))
  throw new GatewayFault('Gateway returned an unapproved checkout URL.',true,{code:'UNAPPROVED_CHECKOUT_URL'});
 return url.href;
}
async function post(operation:Operation,path:string,body:RecordValue,key:string,fetcher:typeof fetch){
 if(!key.trim())throw new GatewayFault('The payment gateway has not been configured.',false,{code:'NOT_CONFIGURED',operation});
 let response:Response;
 try{response=await fetcher(API+path,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});}
 catch(error){throw new GatewayFault('The gateway response was not confirmed. Do not start another payment.',true,{code:timedOut(error)?'TIMEOUT':'NETWORK_ERROR',operation});}
 const context={operation,httpStatus:response.status,responseType:responseType(response.headers.get('content-type'))};
 // HTTP errors are uncertain: never retry a financial POST or print its response body.
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new GatewayFault('The payment provider returned an HTTP error. Contact support with the reference; do not pay again.',true,{...context,code:'HTTP_ERROR'});}
 const reader=response.body?.getReader();if(!reader)throw new GatewayFault('The gateway returned an empty response. Do not pay again.',true,{...context,code:'EMPTY_RESPONSE'});
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel().catch(()=>{});throw new GatewayFault('The gateway response exceeded the allowed size. Do not pay again.',true,{...context,code:'RESPONSE_TOO_LARGE'});}chunks.push(part.value);}
 }catch(error){if(error instanceof GatewayFault)throw error;throw new GatewayFault('The gateway response was interrupted. Do not pay again.',true,{...context,code:timedOut(error)?'TIMEOUT':'RESPONSE_READ_ERROR'});}
 finally{reader.releaseLock();}
 if(!size)throw new GatewayFault('The gateway returned an empty response. Do not pay again.',true,{...context,code:'EMPTY_RESPONSE'});
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let value:unknown;
 try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new GatewayFault('The gateway returned an unreadable response. Do not pay again.',true,{...context,code:'INVALID_JSON'});}
 if(!isRecord(value))throw new GatewayFault('The gateway response format was not valid. Do not pay again.',true,{...context,code:'INVALID_RESPONSE'});
 const providerOrderId=isRecord(value.data)&&validOrderId(value.data.order_id)?value.data.order_id:undefined;
 if(value.success===false)throw new GatewayFault('The gateway rejected the request. Contact support before trying another payment.',!!providerOrderId,{...context,code:'PROVIDER_REJECTED',providerOrderId});
 if(value.success!==true||!isRecord(value.data))throw new GatewayFault('The gateway response format was not valid. Do not pay again.',true,{...context,code:'INVALID_RESPONSE',providerOrderId});
 return {data:value.data,context};
}
export async function createPayin(fiat:number,key:string,fetcher:typeof fetch=fetch){
 if(!Number.isSafeInteger(fiat)||fiat<=0)throw new GatewayFault('Enter a valid payment amount.',false,{code:'INVALID_AMOUNT',operation:'create'});
 const {data,context}=await post('create','/api/payin/payin/create',{amount:fiat/100},key,fetcher);
 if(!validOrderId(data.order_id))throw new GatewayFault('Gateway order ID is missing or invalid. Do not pay again.',true,{...context,code:'INVALID_ORDER_ID'});
 try{return {providerOrderId:data.order_id,checkoutUrl:checkoutUrl(data.paymentUrl)};}
 catch(error){if(error instanceof GatewayFault)error.details={...error.details,...context,providerOrderId:data.order_id};throw error;}
}
export async function submitUtr(orderId:string,utr:string,key:string,fetcher:typeof fetch=fetch){
 if(!/^\d{12}$/.test(utr))throw new GatewayFault('Enter the 12-digit UTR.',false,{code:'INVALID_UTR',operation:'submit_utr'});
 const {data,context}=await post('submit_utr','/api/payin/submit-utr',{order_id:orderId,utr},key,fetcher);
 if(data.order_id!==orderId)throw new GatewayFault('Gateway returned a different order ID.',true,{...context,code:'ORDER_ID_MISMATCH'});
 // Submission is not proof of settlement. The caller separately checks status.
}
export async function payinStatus(orderId:string,fiat:number,key:string,fetcher:typeof fetch=fetch){
 const {data,context}=await post('status','/api/payin/status',{order_id:orderId},key,fetcher);
 if(data.order_id!==orderId)throw new GatewayFault('Gateway returned a different order ID.',true,{...context,code:'ORDER_ID_MISMATCH'});
 if(!['success','pending','failed'].includes(String(data.status)))throw new GatewayFault('Payment status could not be verified.',true,{...context,code:'INVALID_STATUS'});
 if(data.currency!==undefined&&data.currency!=='INR')throw new GatewayFault('Gateway settlement currency does not match INR. No wallet credit was made.',true,{...context,code:'CURRENCY_MISMATCH'});
 if(typeof data.amount!=='number'||!Number.isFinite(data.amount)||Math.abs(data.amount*100-fiat)>0.000001)throw new GatewayFault('Payment amount does not match this order. Balance has not been credited.',true,{...context,code:'AMOUNT_MISMATCH'});
 return data.status as 'success'|'pending'|'failed';
}
