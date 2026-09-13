import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
let count=0;
function check(condition,label){assert.ok(condition,label);count++;console.log('PASS '+label);}
async function req(body,cookie='',admin=false,origin=base){const r=await fetch(base+'/api/demo'+(!body&&admin?'?workspace=admin':''),{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json',origin}:{}),...(cookie?{cookie}:{}),...(admin?{'x-demo-workspace':'admin'}:{})},...(body?{body:JSON.stringify(body)}:{})});let b;try{b=await r.json();}catch{b={};}return {status:r.status,b,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};}
async function login(persona,admin=false){const r=await req({action:'login',persona},'',admin);check(r.status===200,'login '+persona);return r.cookie;}
const guest=await req();check(guest.status===200&&guest.b.role==='guest','guest can browse offers');
check((await req({action:'create_order',offerId:'sell-m1',fiat:100000,method:'UPI'})).status===401,'anonymous mutations denied');
check((await req(null,'',true)).status===401,'admin records protected by demo session');
const user=await login('u1'),seller=await login('m1'),other=await login('m2'),admin=await login('admin',true);
check((await req({action:'user_status',userId:'m1',blocked:true},user)).status===403,'user cannot impersonate admin');
check((await req({action:'profile',name:'Invalid cross origin'},user,false,'https://example.com')).status===403,'cross-origin write denied');
const total=s=>s.users.reduce((a,u)=>a+u.available+u.locked,0)+s.treasury;
const before=(await req(null,admin,true)).b;const startTotal=total(before);const initialUser=before.users.find(u=>u.id==='u1');
async function create(offerId='sell-m1',fiat=100000){const r=await req({action:'create_order',offerId,fiat,method:'UPI'},user);check(r.status===200,'create '+offerId);return r.b.result.orderId;}
async function action(id,operation,cookie=user,extra={},asAdmin=false){return req({action:'order_action',orderId:id,operation,confirm:true,...extra},cookie,asAdmin);}
const id=await create();
let snapshot=(await req(null,admin,true)).b;let order=snapshot.orders.find(o=>o.id===id);const qty=order.quantity;
check(snapshot.users.find(u=>u.id==='m1').locked===before.users.find(u=>u.id==='m1').locked+qty,'buy reserves seller USDT');
check((await action(id,'release',seller)).status===400,'cannot release before payment');
check((await action(id,'paid',other)).status===403,'unrelated user cannot touch order');
check((await action(id,'paid')).status===200,'buyer marks simulated payment');
check((await action(id,'cancel')).status===400,'cannot cancel paid order');
const releases=await Promise.all([action(id,'release',seller),action(id,'release',seller)]);
check(releases.filter(r=>r.status===200).length===1,'concurrent release has exactly one effect');
snapshot=(await req(null,admin,true)).b;
check(snapshot.users.find(u=>u.id==='u1').available===initialUser.available+qty,'buyer credited once');
check(total(snapshot)===startTotal,'total USDT conserved after release');
const cancelId=await create();check((await action(cancelId,'cancel')).status===200,'unpaid cancellation returns escrow');
check((await action(cancelId,'cancel')).status===400,'duplicate cancellation rejected');
const sellId=await create('buy-m1');snapshot=(await req(null,admin,true)).b;order=snapshot.orders.find(o=>o.id===sellId);
check(order.seller==='u1'&&snapshot.users.find(u=>u.id==='u1').locked===order.quantity,'sell reserves user USDT');
check((await action(sellId,'simulate_paid')).status===200,'seller can simulate buyer payment');
check((await action(sellId,'release')).status===200,'seller releases own order');
const disputeId=await create();await action(disputeId,'paid');
check((await action(disputeId,'dispute',user,{reason:'Demo payment review required'})).status===200,'paid order moves to dispute');
check((await action(disputeId,'resolve_return',user,{reason:'Not permitted for this user'})).status===403,'user cannot resolve dispute');
check((await action(disputeId,'resolve_return',admin,{reason:'Test review complete: return funds'},true)).status===200,'admin returns disputed escrow');
const disputeRelease=await create();await action(disputeRelease,'paid');await action(disputeRelease,'dispute',user,{reason:'Demo release review required'});
check((await action(disputeRelease,'resolve_release',admin,{reason:'Test review complete: release funds'},true)).status===200,'admin releases disputed escrow');
const chat=await req({action:'chat',orderId:disputeRelease,text:'Demo functional check completed.'},user);check(chat.status===200&&chat.b.orders.find(o=>o.id===disputeRelease).messages.some(m=>m.text==='Demo functional check completed.'),'chat persists with order');
const settings=before.settings;
check((await req({action:'settings',...settings,trading:false},admin,true)).status===200,'admin pauses marketplace');
check((await req({action:'create_order',offerId:'sell-m1',fiat:100000,method:'UPI'},user)).status===400,'paused market rejects new trades');
await req({action:'settings',...settings},admin,true);
check((await req({action:'offer',id:'sell-m1',active:false},admin,true)).status===200,'admin pauses ad');
check((await req()).b.offers.find(o=>o.id==='sell-m1').active===false,'ad change visible in user app');
await req({action:'offer',id:'sell-m1',active:true},admin,true);
check((await req({action:'funds',operation:'withdraw',amount:10000*1e6},user)).status===400,'insufficient funds rejected');
snapshot=(await req(null,admin,true)).b;
check(total(snapshot)===startTotal,'all trade and cancellation balances conserved');
check(snapshot.users.every(u=>u.available>=0&&u.locked>=0),'no negative balances');
check(snapshot.users.every(u=>u.locked===snapshot.orders.filter(o=>o.seller===u.id&&!['completed','cancelled'].includes(o.status)).reduce((a,o)=>a+o.quantity+o.fee,0)),'all escrow reservations reconcile');
await req({action:'logout'},user);
check((await req(null,user)).b.role==='guest','logout invalidates user session');
for(const path of ['/','/login','/wallet','/orders','/offers','/profile','/support','/admin','/admin/login','/admin/users','/admin/orders','/admin/offers','/admin/disputes','/admin/reports','/admin/settings','/admin/profile','/orders/'+id,'/admin/orders/'+id]){const r=await fetch(base+path);check(r.status===200,'route '+path);}
console.log('TOTAL '+count+' checks passed');
