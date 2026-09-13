import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:5173';
let count=0;const created=[];
function check(x,msg){assert.ok(x,msg);console.log('PASS '+msg);count++;}
async function call(body,cookie='',admin=false){const r=await fetch(base+'/api/demo'+(!body&&admin?'?workspace=admin':''),{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json',origin:base}:{}),...(cookie?{cookie}:{}),...(admin?{'x-demo-workspace':'admin'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};}
const admin=(await call({action:'login',persona:'admin'},'',true)).cookie;
const user=(await call({action:'login',persona:'u1'})).cookie;
const outsider=(await call({action:'login',persona:'m2'})).cookie;
const initial=(await call(null,admin,true)).body;
assert(initial.settings.trading,'Trading must already be enabled for these checks.');
assert(initial.users.find(u=>u.id==='u1'&&!u.blocked&&u.kyc==='verified'),'Test user must already be eligible.');
const total=s=>s.users.reduce((a,u)=>a+u.available+u.locked,0)+s.treasury;
const buyOffer=initial.offers.find(o=>o.id==='sell-m1'&&o.active),sellOffer=initial.offers.find(o=>o.id==='buy-m1'&&o.active);
assert(buyOffer&&sellOffer,'Atlas buy/sell ads must already be active.');
try {
const payload={action:'admin_create_order',userId:'u1',side:'buy',offerId:buyOffer.id,fiat:buyOffer.min,method:buyOffer.methods[0],requestId:randomUUID()};
check((await call(payload)).status===401,'guest cannot create admin order');
check((await call(payload,user)).status===403,'user cannot call admin create action');
check((await call({...payload,userId:'m1'},admin,true)).status===400,'self trade rejected');
check((await call({...payload,side:'sell'},admin,true)).status===400,'direction mismatch rejected');
check((await call({...payload,fiat:buyOffer.min-1},admin,true)).status===400,'offer minimum enforced');
check((await call({...payload,method:'Unsupported'},admin,true)).status===400,'payment method enforced');
const concurrent=await Promise.all([call(payload,admin,true),call(payload,admin,true)]);
check(concurrent.every(r=>r.status===200),'safe simultaneous retries succeed');
const id=concurrent[0].body.result.orderId;created.push(id);
check(id===concurrent[1].body.result.orderId,'retries return one order ID');
const snapshot=(await call(null,admin,true)).body;const order=snapshot.orders.find(o=>o.id===id);
check(snapshot.orders.filter(o=>o.requestId===payload.requestId).length===1,'one order persisted for request');
check(order.buyer==='u1'&&order.seller==='m1'&&order.status==='awaiting_payment','buyer/seller and awaiting status correct');
check(order.createdBy==='admin'&&order.createdFor==='u1','admin creator recorded separately');
check(snapshot.audit.some(a=>a.actor==='Admin'&&a.target===id&&a.action.startsWith('Created order for')),'admin audit event recorded');
const sellerBefore=initial.users.find(u=>u.id==='m1'),sellerAfter=snapshot.users.find(u=>u.id==='m1');
check(sellerAfter.available===sellerBefore.available-order.quantity-order.fee&&sellerAfter.locked===sellerBefore.locked+order.quantity+order.fee,'seller reservation exact including fees');
check(total(initial)===total(snapshot),'total balance conserved');
const userView=(await call(null,user)).body;
check(userView.orders.some(o=>o.id===id),'admin-created order appears in user app data');
check(!(await call(null,outsider)).body.orders.some(o=>o.id===id),'unrelated user does not see order');
check((await call({...payload,fiat:payload.fiat+100},admin,true)).status===409,'same retry key with altered payload rejected');
const cancelled=await call({action:'order_action',orderId:id,operation:'cancel',confirm:true},user);check(cancelled.status===200,'target user can cancel unpaid admin order');
const sellPayload={...payload,requestId:randomUUID(),side:'sell',offerId:sellOffer.id,fiat:sellOffer.min,method:sellOffer.methods[0]};
const sellResult=await call(sellPayload,admin,true);check(sellResult.status===200,'admin creates a Sell order');
const sellId=sellResult.body.result.orderId;created.push(sellId);
const sellOrder=sellResult.body.orders.find(o=>o.id===sellId);
check(sellOrder.seller==='u1'&&sellOrder.buyer==='m1','Sell reserves selected user, not merchant');
const sellUser=(await call(null,user)).body;
check(sellUser.user.locked===initial.users.find(u=>u.id==='u1').locked+sellOrder.quantity+sellOrder.fee,'user wallet locked balance reflects admin Sell');
check((await call({action:'order_action',orderId:sellId,operation:'cancel',confirm:true},user)).status===200,'Sell order cancels normally');
const final=(await call(null,admin,true)).body;
check(initial.users.every(u=>{const v=final.users.find(v=>v.id===u.id);return v.available===u.available&&v.locked===u.locked;}),'test reservations returned without changing starting balances');
check(final.settings.brand===initial.settings.brand&&JSON.stringify(final.settings)===JSON.stringify(initial.settings),'user settings preserved');
for(const path of ['/admin/orders','/orders','/wallet','/admin/orders/'+id])check((await fetch(base+path)).status===200,'route '+path);
console.log('TOTAL '+count+' focused checks passed');
} finally {
for(const id of created){const v=(await call(null,user)).body.orders?.find(o=>o.id===id);if(v?.status==='awaiting_payment')await call({action:'order_action',orderId:id,operation:'cancel',confirm:true},user);}
}
