// Entire flow uses in-memory records and mocked provider responses. No live payments or transfers.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {moduleLoader} from './load-test-module.mjs';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE local_accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,mobile TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created INTEGER NOT NULL,referred_by TEXT);
CREATE TABLE auth_limits(key TEXT PRIMARY KEY,attempts INTEGER,expires INTEGER);
CREATE TABLE demo_state(id INTEGER PRIMARY KEY,data TEXT,revision INTEGER);
CREATE TABLE demo_sessions(token TEXT PRIMARY KEY,identity TEXT,expires INTEGER);`);
const DB={prepare(sql){const statement=(values=[])=>({bind:(...v)=>statement(v),first:async()=>sqlite.prepare(sql).get(...values)||null,all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}})});return statement();}};
DB.batch=async items=>{sqlite.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.all());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}};
const UNIT=1000000,alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function address(byte){const data=Buffer.from('41'+byte.repeat(40),'hex'),checksum=crypto.createHash('sha256').update(crypto.createHash('sha256').update(data).digest()).digest().subarray(0,4);let n=BigInt('0x'+Buffer.concat([data,checksum]).toString('hex')),out='';while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}return out;}
const sender=address('1'),recipient=address('2'),txHash='a'.repeat(64);
const env={DB,NEXA_RUNTIME:'vercel',NEXA_PUBLIC_ORIGIN:'https://nexa.example',NEXA_REGISTRATION_CODE:'NX0123456789ABCDEF',NEXA_DATA_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex'),NEXA_DATA_LOOKUP_KEY:crypto.randomBytes(32).toString('hex'),DIVINEPAY_API_KEY:'offline-provider-placeholder',NEXA_ENABLE_GATEWAY_CHECKOUT:'false'};
let reserve=1000*UNIT,paymentStatus='pending',receipt={},createCalls=0,networkCalls=0;
const providerOrders=new Map();
async function mock(url,init){
 networkCalls++;assert.equal(init.redirect,'error');const body=JSON.parse(init.body);
 if(url==='https://api.trongrid.io/walletsolidity/triggerconstantcontract'){assert.equal(body.function_selector,'balanceOf(address)');return Response.json({result:{result:true},constant_result:[BigInt(reserve).toString(16).padStart(64,'0')]});}
 if(url==='https://api.trongrid.io/walletsolidity/gettransactioninfobyid')return Response.json(receipt);
 if(url==='https://divinepay.us.cc/api/payin/payin/create'){assert.equal(init.headers['x-api-key'],env.DIVINEPAY_API_KEY);createCalls++;const id='ORD_OFFLINE_'+createCalls;providerOrders.set(id,body.amount);return Response.json({success:true,data:{order_id:id,paymentUrl:'https://cashiernew.blue-pay.vip/#/mobile?orderId='+id}});}
 if(url==='https://divinepay.us.cc/api/payin/status')return Response.json({success:true,data:{order_id:body.order_id,status:paymentStatus,amount:providerOrders.get(body.order_id)}});
 throw new Error('Unmocked request refused: '+new URL(url).origin);
}
const load=moduleLoader(env,{fetch:mock}),server=load('lib/server.ts'),auth=load('lib/local-auth.ts'),storage=load('lib/private-storage.ts'),tron=load('lib/tron-verification.ts'),accounting=load('lib/manual-settlement.ts');
let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++;};
const state=()=>storage.readState(sqlite.prepare('SELECT data FROM demo_state').get().data);
async function api(body,{admin=false,cookie=''}={}){
 const response=await (body?server.POST:server.GET)(new Request(env.NEXA_PUBLIC_ORIGIN+'/api/server'+(!body&&admin?'?workspace=admin':''),{method:body?'POST':'GET',headers:{host:'nexa.example',origin:env.NEXA_PUBLIC_ORIGIN,...(body?{'content-type':'application/json'}:{}),...(admin?{'x-demo-workspace':'admin'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined}));
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
try{
 check(tron.tronHex(sender)==='41'+'1'.repeat(40),'TRON Base58Check decoded correctly');
 check(tron.tronHex(tron.TRON_USDT)==='41a614f803b6fd780986a42c78ec9c7f77e6ded13c','Official USDT contract decoded correctly');
 for(const invalid of [sender.slice(0,-1)+'0','0x'+'1'.repeat(40),'T'+'1'.repeat(33),'',sender+' ']){assert.throws(()=>tron.tronHex(invalid));checks++;}
 const password='offline-customer-passphrase-12345';
 let r=await api({action:'register',name:'Offline customer',email:'customer@example.invalid',mobile:'0000000004',password,referralCode:env.NEXA_REGISTRATION_CODE});check(r.status===201,'Create account');
 r=await api({action:'login',email:'customer@example.invalid',password});const user={cookie:r.cookie};check(r.status===200,'Customer login');
 const salt=crypto.randomBytes(16).toString('hex'),adminPassword='offline-admin-password-12345';
 env.NEXA_ADMIN_EMAIL='admin@example.invalid';env.NEXA_ADMIN_PASSWORD_HASH='scrypt:32768:8:3:'+salt+':'+(await auth.derive(adminPassword,salt)).toString('hex');
 r=await api({action:'login',email:env.NEXA_ADMIN_EMAIL,password:adminPassword},{admin:true});const admin={cookie:r.cookie,admin:true};check(r.status===200,'Admin login');
 r=await api(undefined,user);const userId=r.data.user.id;check(!r.data.gateway.enabled&&!r.data.gateway.creditEnabled,'No real-money features without settlement setup');
 const settings={action:'manual_settings',senderAddress:sender,deliveryHours:24,refundPolicy:'Contact the operator for a refund if manual delivery cannot be completed.',supportContact:'support@example.invalid',confirmControl:true};
 check((await api(settings,user)).status===403,'Customer cannot configure settlement');
 r=await api(settings,admin);check(r.status===200&&r.data.result.reserveUsdt===1000,'Admin can save checked public sending-wallet and terms');
 check(!r.data.gateway.enabled,'Saving settings cannot enable the server payment switch');
 env.NEXA_ENABLE_GATEWAY_CHECKOUT='true';
 r=await api({action:'offer',displayName:'Offline seller',side:'sell',price:9600,available:1000*UNIT,min:500000,max:3000000},admin);check(r.status===200,'Publish admin seller listing');
 const offer=state().offers.find(o=>o.createdBy==='admin'),termsVersion=state().settlement.updated;
 const buy={action:'create_order',requestId:crypto.randomUUID(),offerId:offer.id,price:offer.price,fiat:500000,method:'UPI',termsAccepted:true,termsVersion};
 check((await api({...buy,termsAccepted:false},user)).status===409,'Payment terms must be accepted');
 r=await api(buy,user);check(r.status===200,'Customer creates buy order after accepting terms');const orderId=r.data.result.orderId;
 reserve=0;r=await api({action:'checkout',orderId},user);check(r.status===409&&createCalls===0,'Insufficient real USDT reserve prevents pay-in creation');
 check(!state().orders.find(o=>o.id===orderId).payment,'Reserve rejection does not create an uncertain gateway attempt');
 reserve=1000*UNIT;r=await api({action:'checkout',orderId},user);check(r.status===200&&r.data.result.checkoutUrl.startsWith('https://cashiernew.blue-pay.vip/'),'Funded checkout returns approved hosted QR URL');
 check(createCalls===1&&state().users.find(u=>u.id===userId).live===undefined,'Checkout never credits a balance');
 r=await api({action:'checkout',orderId},user);check(r.status===200&&createCalls===1,'Reopen returns same checkout; never creates another provider order');
 check((await api({...buy,requestId:crypto.randomUUID()},user)).status===409,'Another purchase cannot replace an unresolved payment');
 const approval={action:'approve_payment',orderId,note:'Checked paid order in provider dashboard.',confirm:true};
 check((await api(approval,user)).status===403,'Customer cannot approve their own payment');
 check((await api(approval,admin)).status===409,'Pending provider payment cannot be approved');
 paymentStatus='success';r=await api({action:'payment_status',orderId},user);check(r.data.orders.find(o=>o.id===orderId).payment.phase==='review'&&!r.data.user.live,'Provider success waits for admin review without credit');
 reserve=0;check((await api(approval,admin)).status===409,'Approval rechecks real reserves');
 reserve=1000*UNIT;r=await api(approval,admin);const quantity=state().orders.find(o=>o.id===orderId).quantity;
 check(r.status===200&&state().users.find(u=>u.id===userId).live.available===quantity,'Admin approval credits exact USDT once');
 check(state().users.find(u=>u.id===userId).available===0,'Historical simulated balance is not converted to real USDT');
 const ledgerCount=state().ledger.filter(l=>l.real).length;
 check((await api(approval,admin)).status===200&&state().ledger.filter(l=>l.real).length===ledgerCount,'Repeated approval is idempotent');
 const withdraw={action:'request_withdrawal',requestId:crypto.randomUUID(),recipient,network:'TRC20',quantity,confirm:true};
 check((await api({...withdraw,network:'ERC20'},user)).status===400,'Wrong withdrawal network refused');
 r=await api(withdraw,user);check(r.status===200,'Customer requests manual TRC20 withdrawal');const withdrawalId=r.data.result.withdrawalId;
 let live=state().users.find(u=>u.id===userId).live;check(live.available===0&&live.locked===quantity,'Request locks the amount without deducting total balance');
 check((await api(withdraw,user)).data.result.withdrawalId===withdrawalId&&state().withdrawals.length===1,'Duplicate request ID cannot reserve twice');
 check((await api({...withdraw,requestId:crypto.randomUUID()},user)).status===409,'No double withdrawal of locked balance');
 check((await api({action:'start_withdrawal',withdrawalId,confirm:true},user)).status===403,'Customer cannot start admin payout');
 check((await api({action:'start_withdrawal',withdrawalId,confirm:true},admin)).status===200,'Admin claims manual payout before sending');
 check((await api({action:'start_withdrawal',withdrawalId,confirm:true},admin)).status===409,'Second send claim blocked');
 check((await api({action:'cancel_withdrawal',withdrawalId},user)).status===409,'Cannot cancel after sending starts');
 check((await api({action:'record_transfer',withdrawalId,txHash:'bad'},admin)).status===400,'Malformed transaction ID refused');
 check((await api({action:'record_transfer',withdrawalId,txHash},admin)).status===200,'Admin records existing transaction without deduction');
 check((await api({action:'verify_transfer',withdrawalId},admin)).status===409,'Unconfirmed receipt never completes withdrawal');
 receipt={id:txHash,receipt:{result:'SUCCESS'},blockNumber:100000,blockTimeStamp:Date.now()+1000,log:[{address:'a614f803b6fd780986a42c78ec9c7f77e6ded13c',topics:['ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','1'.repeat(40).padStart(64,'0'),'2'.repeat(40).padStart(64,'0')],data:BigInt(quantity+1).toString(16).padStart(64,'0')}]};
 check((await api({action:'verify_transfer',withdrawalId},admin)).status===409,'Wrong token amount cannot complete withdrawal');
 receipt.log[0].data=BigInt(quantity).toString(16).padStart(64,'0');
 const correctSender=receipt.log[0].topics[1];receipt.log[0].topics[1]='4'.repeat(40).padStart(64,'0');
 check((await api({action:'verify_transfer',withdrawalId},admin)).status===409,'Wrong sending wallet cannot complete withdrawal');receipt.log[0].topics[1]=correctSender;
 const correctRecipient=receipt.log[0].topics[2];receipt.log[0].topics[2]='3'.repeat(40).padStart(64,'0');
 check((await api({action:'verify_transfer',withdrawalId},admin)).status===409,'Wrong recipient cannot complete withdrawal');
 receipt.log[0].topics[2]=correctRecipient;const correctContract=receipt.log[0].address;receipt.log[0].address='0'.repeat(40);
 check((await api({action:'verify_transfer',withdrawalId},admin)).status===409,'Fake USDT contract refused');receipt.log[0].address=correctContract;
 const correctTime=receipt.blockTimeStamp;receipt.blockTimeStamp=1;
 check((await api({action:'verify_transfer',withdrawalId},admin)).status===409,'Old transfer cannot pay a new withdrawal');receipt.blockTimeStamp=correctTime;
 r=await api({action:'verify_transfer',withdrawalId},admin);
 live=state().users.find(u=>u.id===userId).live;
 check(r.status===200&&live.available===0&&live.locked===0&&state().withdrawals[0].phase==='completed','Matching solidified TRC20 transfer deducts balance once');
 const finalLedger=state().ledger.filter(l=>l.real).length;
 check((await api({action:'verify_transfer',withdrawalId},admin)).status===200&&state().ledger.filter(l=>l.real).length===finalLedger,'Repeated completion cannot double-deduct');
 // A later success after a failed status must restore this order's reserve liability.
 paymentStatus='failed';r=await api({...buy,requestId:crypto.randomUUID()},user);const recoveredId=r.data.result.orderId;
 check((await api({action:'checkout',orderId:recoveredId},user)).status===200,'Second independently requested purchase opens its own checkout');
 check((await api({action:'payment_status',orderId:recoveredId},user)).data.orders.find(o=>o.id===recoveredId).payment.phase==='failed','Explicit failed status is stored');
 paymentStatus='success';reserve=0;
 check((await api({...approval,orderId:recoveredId},admin)).status===409,'Recovered provider success cannot credit without reserves for that order');
 reserve=1000*UNIT;check((await api({...approval,orderId:recoveredId},admin)).status===200,'Recovered success can be approved only after reserve recheck');
 r=await api({...withdraw,requestId:crypto.randomUUID()},user);const cancelId=r.data.result.withdrawalId;
 check((await api({action:'cancel_withdrawal',withdrawalId:cancelId},user)).status===200,'Unstarted withdrawal can be cancelled');
 check((await api({action:'cancel_withdrawal',withdrawalId:cancelId},user)).status===200&&state().users.find(u=>u.id===userId).live.available===quantity,'Repeated cancellation unlocks only once');
 r=await api({...withdraw,requestId:crypto.randomUUID()},user);const secondWithdrawal=r.data.result.withdrawalId;
 await api({action:'start_withdrawal',withdrawalId:secondWithdrawal,confirm:true},admin);
 check((await api({action:'record_transfer',withdrawalId:secondWithdrawal,txHash},admin)).status===409,'A previously used transaction cannot pay a second withdrawal');
 const secondHash='b'.repeat(64);await api({action:'record_transfer',withdrawalId:secondWithdrawal,txHash:secondHash},admin);
 receipt={...receipt,id:secondHash,blockTimeStamp:Date.now()+1000};
 check((await api({action:'verify_transfer',withdrawalId:secondWithdrawal},admin)).status===200,'Distinct actual transfer can settle the second withdrawal');
 r=await api(undefined);check(r.data.withdrawals.length===0&&r.data.users.every(u=>!u.live),'Guest never sees private withdrawals or verified balances');
 check(!JSON.stringify(r.data).includes(env.DIVINEPAY_API_KEY),'Provider key stays server-side');
 accounting.checkRealBalances(state());check(accounting.reserveLiability(state())===0,'Final verified ledger and reserve liabilities reconcile');
 const broken=state();broken.users.find(u=>u.id===userId).live.available=1;assert.throws(()=>accounting.checkRealBalances(broken));checks++;
 check(networkCalls>0&&createCalls===2,'All network responses were mock-controlled; two pay-in simulations');
 console.log(checks+' manual settlement, approval, privacy and TRC20 checks passed. Zero real payments or transfers.');
}finally{sqlite.close();}
