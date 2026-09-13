import assert from 'node:assert/strict';
import {createPayin,submitUtr,payinStatus,checkoutUrl} from '../lib/divinepay.ts';
let checks=0,calls=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const key='test-only-placeholder';
const mock=(data)=>async(url,init)=>{calls++;ok(url.startsWith('https://divinepay.us.cc/api/payin/'),'Fixed provider origin');ok(init.headers['x-api-key']===key&&init.redirect==='error','Server key with redirects disabled');return Response.json({success:true,data});};
const create=await createPayin(500000,key,mock({order_id:'ORD_TEST_1',paymentUrl:'https://cashiernew.blue-pay.vip/#/mobile?orderId=TEST_1'}));
ok(create.providerOrderId==='ORD_TEST_1','Stores provider order ID');
for(const url of ['http://cashiernew.blue-pay.vip/#/mobile?orderId=1','https://cashiernew.blue-pay.vip.evil.test/#/mobile?orderId=1','https://user:pass@cashiernew.blue-pay.vip/#/mobile?orderId=1','https://cashiernew.blue-pay.vip/#/mobile']){assert.throws(()=>checkoutUrl(url));checks++;}
ok(await payinStatus('ORD_TEST_1',500000,key,mock({order_id:'ORD_TEST_1',status:'success',amount:5000}))==='success','Checks matching order and exact amount');
await assert.rejects(()=>payinStatus('ORD_TEST_1',500000,key,mock({order_id:'OTHER',status:'success',amount:5000})));checks++;
await assert.rejects(()=>payinStatus('ORD_TEST_1',500000,key,mock({order_id:'ORD_TEST_1',status:'success',amount:4999.99})));checks++;
await assert.rejects(()=>payinStatus('ORD_TEST_1',500000,key,mock({order_id:'ORD_TEST_1',status:'success',amount:'5000'})));checks++;
await assert.rejects(()=>submitUtr('ORD_TEST_1','123',key,mock({})));checks++;
await submitUtr('ORD_TEST_1','123456789012',key,mock({order_id:'ORD_TEST_1',status:'success'}));checks++;
let attempts=0;await assert.rejects(()=>createPayin(500000,key,async()=>{attempts++;throw new Error('timeout');}),e=>e.uncertain===true);ok(attempts===1,'Ambiguous create is not retried');
console.log('PASS: '+checks+' gateway contract checks, '+calls+' mocked calls, zero real payment requests.');
