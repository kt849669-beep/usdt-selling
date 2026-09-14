import assert from 'node:assert/strict';
import {createPayin,submitUtr,payinStatus,checkoutUrl,GatewayFault,gatewayDiagnostic} from '../lib/divinepay.ts';
globalThis.fetch=()=>{throw new Error('Real network requests are forbidden in contract tests.');};
let checks=0,calls=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const key='test-only-placeholder';
const mock=(data)=>async(url,init)=>{calls++;ok(url.startsWith('https://divinepay.us.cc/api/payin/'),'Fixed provider origin');ok(init.headers['x-api-key']===key&&init.redirect==='error','Server key with redirects disabled');return Response.json({success:true,data});};
const create=await createPayin(500000,key,mock({order_id:'ORD_TEST_1',paymentUrl:'https://cashiernew.blue-pay.vip/#/mobile?orderId=TEST_1'}));
ok(create.providerOrderId==='ORD_TEST_1','Stores provider order ID');
ok(create.checkoutUrl==='https://cashiernew.blue-pay.vip/#/mobile?orderId=TEST_1','Returns the validated hosted QR URL unchanged');
for(const url of ['http://cashiernew.blue-pay.vip/#/mobile?orderId=1','https://cashiernew.blue-pay.vip.evil.test/#/mobile?orderId=1','https://user:pass@cashiernew.blue-pay.vip/#/mobile?orderId=1','https://cashiernew.blue-pay.vip/#/mobile']){assert.throws(()=>checkoutUrl(url));checks++;}
ok(await payinStatus('ORD_TEST_1',500000,key,mock({order_id:'ORD_TEST_1',status:'success',amount:5000}))==='success','Checks matching order and exact amount');
await assert.rejects(()=>payinStatus('ORD_TEST_1',500000,key,mock({order_id:'OTHER',status:'success',amount:5000})));checks++;
await assert.rejects(()=>payinStatus('ORD_TEST_1',500000,key,mock({order_id:'ORD_TEST_1',status:'success',amount:4999.99})));checks++;
await assert.rejects(()=>payinStatus('ORD_TEST_1',500000,key,mock({order_id:'ORD_TEST_1',status:'success',amount:'5000'})));checks++;
await assert.rejects(()=>payinStatus('ORD_TEST_1',500000,key,mock({order_id:'ORD_TEST_1',status:'success',amount:5000,currency:'USD'})),e=>e.details.code==='CURRENCY_MISMATCH');checks++;
await assert.rejects(()=>submitUtr('ORD_TEST_1','123',key,mock({})));checks++;
await submitUtr('ORD_TEST_1','123456789012',key,mock({order_id:'ORD_TEST_1',status:'success'}));checks++;
let attempts=0;await assert.rejects(()=>createPayin(500000,key,async()=>{attempts++;throw new Error('timeout');}),e=>e.uncertain===true);ok(attempts===1,'Ambiguous create is not retried');
async function fails(fetcher,code,verify=()=>{}){
 let count=0;
 await assert.rejects(()=>createPayin(500000,key,async(...args)=>{count++;return fetcher(...args);}),error=>{
  ok(error instanceof GatewayFault,'Typed and safe gateway fault');
  ok(error.details.code===code,'Precise diagnostic category: '+code);
  ok(error.details.operation==='create','Records provider operation');
  ok(/^GW-[a-f0-9-]{36}$/.test(error.reference),'Unique support reference');
  verify(error);return true;
 });
 ok(count===1,'Never retries failed or uncertain creation');
}
await createPayin(500000,key,async(url,init)=>{
 ok(url==='https://divinepay.us.cc/api/payin/payin/create','Uses the supplied create endpoint exactly');
 ok(JSON.parse(init.body).amount===5000,'Converts paise to INR once');
 ok(init.headers['x-api-key']===key&&!('Authorization' in init.headers),'Uses x-api-key, never substitutes Bearer auth');
 return Response.json({success:true,data:{order_id:'ORD_TEST_2',paymentUrl:'https://cashiernew.blue-pay.vip/#/mobile?orderId=TEST_2'}});
});
for(const httpStatus of [401,403,429,500,502])await fails(async()=>new Response('private upstream body: '+key,{status:httpStatus,headers:{'Content-Type':'text/html'}}),'HTTP_ERROR',error=>{
 const log=gatewayDiagnostic(error);
 ok(log.httpStatus===httpStatus&&log.responseType==='html'&&log.uncertain,'Keeps HTTP status and coarse response type');
 ok(!JSON.stringify(log).includes(key)&&!error.message.includes('private upstream body'),'No upstream body or key in diagnostics or client message');
});
await fails(async()=>{throw new DOMException('secret='+key,'TimeoutError');},'TIMEOUT');
await fails(async()=>{throw new TypeError('secret='+key);},'NETWORK_ERROR');
await fails(async()=>new Response('<!DOCTYPE html>secret='+key,{headers:{'Content-Type':'text/html'}}),'INVALID_JSON');
await fails(async()=>new Response(null,{status:204}),'EMPTY_RESPONSE');
await fails(async()=>new Response(''),'EMPTY_RESPONSE');
await fails(async()=>new Response('x'.repeat(32769)),'RESPONSE_TOO_LARGE');
await fails(async()=>new Response(new ReadableStream({start(controller){controller.error(new Error('secret='+key));}})),'RESPONSE_READ_ERROR');
for(const body of [null,[],{}, {success:'true',data:{}},{success:true},{success:true,data:[]}])await fails(async()=>Response.json(body),'INVALID_RESPONSE');
await fails(async()=>Response.json({success:false,message:'secret='+key}),'PROVIDER_REJECTED',error=>ok(!error.uncertain,'Explicit rejection without an order ID is terminal'));
await fails(async()=>Response.json({success:false,data:{order_id:'ORD_KEEP'},message:'secret='+key}),'PROVIDER_REJECTED',error=>ok(error.uncertain&&error.details.providerOrderId==='ORD_KEEP','Rejection with a provider order is not treated as safe to retry'));
for(const order_id of [undefined,'',123,'a'.repeat(101),'ORD\nINJECT'])await fails(async()=>Response.json({success:true,data:{order_id,paymentUrl:create.checkoutUrl}}),'INVALID_ORDER_ID');
for(const paymentUrl of [undefined,'not a URL'])await fails(async()=>Response.json({success:true,data:{order_id:'ORD_KEEP',paymentUrl}}),'INVALID_CHECKOUT_URL',error=>{
 ok(error.details.providerOrderId==='ORD_KEEP'&&error.uncertain,'Preserves provider ID on invalid checkout URL');
 ok(!('providerOrderId' in gatewayDiagnostic(error)),'Provider references stay out of shared runtime logs');
});
await fails(async()=>Response.json({success:true,data:{order_id:'ORD_KEEP',paymentUrl:'https://evil.test/secret='+key}}),'UNAPPROVED_CHECKOUT_URL',error=>ok(error.details.providerOrderId==='ORD_KEEP','Preserves provider ID on unapproved host'));
for(const value of ['https://cashiernew.blue-pay.vip/other/#/mobile?orderId=1','https://cashiernew.blue-pay.vip/#/mobile?orderId=','https://cashiernew.blue-pay.vip/#/mobile?orderId=%0A','javascript:alert(1)']){assert.throws(()=>checkoutUrl(value),GatewayFault);checks++;}
for(const fiat of [0,-1,1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){await assert.rejects(()=>createPayin(fiat,key),error=>error.details.code==='INVALID_AMOUNT');checks++;}
await assert.rejects(()=>createPayin(500000,''),error=>error.details.code==='NOT_CONFIGURED');checks++;
await assert.rejects(()=>payinStatus('ORD_TEST_1',500000,key,mock({order_id:'ORD_TEST_1',status:'unknown',amount:5000})),error=>error.details.code==='INVALID_STATUS');checks++;
await assert.rejects(()=>submitUtr('ORD_TEST_1','123456789012',key,mock({order_id:'DIFFERENT'})),error=>error.details.code==='ORDER_ID_MISMATCH');checks++;
console.log('PASS: '+checks+' gateway contract checks. All gateway responses mocked; zero real payment requests.');
