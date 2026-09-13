import {env} from 'cloudflare:workers';
import {seed} from './demo-seed';
import {publicOrigin,permittedAdmin} from './deployment-access';
import {GatewayFault,createPayin,submitUtr,payinStatus} from './divinepay';
import {AuthFault,register,authenticate,registeredIdentity,referralCode,type LocalAccount} from './local-auth';
import {UNIT,type DemoState,type Order,type ViewData} from './demo-types';
const db=()=> (env as unknown as {DB:D1Database}).DB;
const uid=()=>crypto.randomUUID();
const response=(value:unknown,status=200,extra:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
class Fault extends Error{constructor(message:string,public status=400){super(message)}}
function local(request:Request,write=false){
 const url=new URL(request.url);
 const hosted=publicOrigin();
 if(hosted?url.origin!==hosted:!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Fault('This application origin is not enabled.',403);
 if(write && (request.headers.get('origin')!==url.origin || request.headers.get('sec-fetch-site')==='cross-site'))throw new Fault('Use this application from its own page.',403);
}
const cookieName=(admin:boolean)=>admin?'nexa_demo_admin':'nexa_demo_user';
function token(request:Request,admin:boolean){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName(admin)+'='))?.split('=')[1]||'';}
async function identity(request:Request,admin:boolean){if(admin&&publicOrigin())return permittedAdmin(request.headers.get('oai-authenticated-user-id'),request.headers.get('oai-authenticated-user-email'))?'admin':'';const t=token(request,admin);if(!/^[a-f0-9]{64}$/.test(t))return '';const row=await db().prepare('SELECT identity FROM demo_sessions WHERE token=? AND expires>?').bind(t,Date.now()).first<{identity:string}>();const found=row?.identity||'';return admin?found:found&&await registeredIdentity(found)?found:'';}
async function read(){await db().prepare('INSERT INTO demo_state (id,data,revision) VALUES (1,?,1) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify(seed(!!publicOrigin()))).run();const row=await db().prepare('SELECT data,revision FROM demo_state WHERE id=1').first<{data:string;revision:number}>();if(!row)throw new Fault('Local records are unavailable.',503);return {state:JSON.parse(row.data) as DemoState,revision:row.revision};}
function log(s:DemoState,actor:string,action:string,target:string){s.audit.unshift({id:uid(),actor,action,target,time:Date.now()});}
function entry(s:DemoState,user:string,type:string,amount:number,orderId='',reference='Simulated transaction'){s.ledger.unshift({id:uid(),user,type,amount,orderId,time:Date.now(),reference});}
function actorUser(s:DemoState,id:string){const u=s.users.find(u=>u.id===id);if(!u)throw new Fault('Open a demo account to continue.',401);return u;}
function giveBack(s:DemoState,o:Order,reason:string){const seller=actorUser(s,o.seller);seller.locked-=o.quantity+o.fee;seller.available+=o.quantity+o.fee;o.status='cancelled';o.reason=reason;o.updated=Date.now();const offer=s.offers.find(x=>x.id===o.offerId);if(offer)offer.available+=o.quantity;entry(s,seller.id,'Escrow returned',o.quantity+o.fee,o.id,reason);}
function release(s:DemoState,o:Order){const seller=actorUser(s,o.seller),buyer=actorUser(s,o.buyer);seller.locked-=o.quantity+o.fee;buyer.available+=o.quantity;s.treasury+=o.fee;o.status='completed';o.updated=Date.now();entry(s,seller.id,'P2P sell',-(o.quantity+o.fee),o.id);entry(s,buyer.id,'P2P buy',o.quantity,o.id);seller.orders++;buyer.orders++;}
function check(s:DemoState){for(const u of s.users){if(!Number.isSafeInteger(u.available)||!Number.isSafeInteger(u.locked)||u.available<0||u.locked<0)throw new Fault('Balance check failed. No changes saved.',409);const reserved=s.orders.filter(o=>o.seller===u.id&&!['completed','cancelled'].includes(o.status)).reduce((a,o)=>a+o.quantity+o.fee,0);if(reserved!==u.locked)throw new Fault('Escrow check failed. No changes saved.',409);}}
async function change(fn:(s:DemoState)=>unknown){for(let tries=0;tries<8;tries++){const {state,revision}=await read();const value=fn(state);check(state);const result=await db().prepare('UPDATE demo_state SET data=?,revision=revision+1 WHERE id=1 AND revision=?').bind(JSON.stringify(state),revision).run();if(result.meta.changes===1)return {state,revision:revision+1,value};}throw new Fault('Another update just finished. Please retry.',409);}
function gatewayConfig(){
 const vars=env as unknown as {DIVINEPAY_API_KEY?:string;NEXA_ENABLE_GATEWAY_CHECKOUT?:string};
 const key=vars.DIVINEPAY_API_KEY||'';
 const configured=key.length>=12&&!['sk_live_xxx','YOUR_API_KEY'].includes(key);
 const enabled=configured&&vars.NEXA_ENABLE_GATEWAY_CHECKOUT==='true';
 return {key,configured,enabled,creditEnabled:false as const,reason:!configured?'DivinePay API key has not been configured.':!enabled?'Gateway checkout is disabled for this local prototype.':'Checkout configured. Wallet credit remains disabled pending settlement and crypto-custody integration.'};
}
function gatewayView(){const {key,...safe}=gatewayConfig();return safe;}
function canExpire(o:Order){return o.status==='awaiting_payment'&&o.expires<Date.now()&&(!o.payment||o.payment.phase==='failed');}
function view(s:DemoState,id:string,admin:boolean,revision:number):ViewData{
 const user=s.users.find(u=>u.id===id)||null;
 const orders=admin?s.orders:s.orders.filter(o=>o.buyer===id||o.seller===id);
 const offers=(admin?s.offers:s.offers.filter(o=>o.createdBy==='admin'&&o.side==='sell'&&o.active&&!actorUser(s,o.owner).blocked)).map(o=>({...o,available:o.side==='sell'?Math.min(o.available,Math.floor(actorUser(s,o.owner).available/(1+s.settings.feeBps/10000))):o.available}));
 const visible=new Set([...offers.map(o=>o.owner),...orders.flatMap(o=>[o.buyer,o.seller]),id]);
 const users=admin?s.users:s.users.filter(u=>visible.has(u.id)).map(u=>({...u,email:'',mobile:'',referralCode:undefined,referredBy:undefined,available:0,locked:0,payment:''}));
 return {user,role:admin?'admin':user?'user':'guest',users,offers,orders:orders.map(o=>{const {requestFingerprint,...safe}=o;return safe;}),ledger:admin?s.ledger:s.ledger.filter(l=>l.user===id),audit:admin?s.audit:[],settings:s.settings,treasury:admin?s.treasury:0,revision,gateway:gatewayView()};
}
async function ensureProfile(account:LocalAccount){
 await change(s=>{const existing=s.users.find(u=>u.id===account.id);if(existing){existing.referralCode=referralCode(account.id);existing.referredBy=account.referred_by||null;}else{s.users.push({id:account.id,name:account.name,email:account.email,mobile:account.mobile,referralCode:referralCode(account.id),referredBy:account.referred_by||null,created:account.created,accountType:'registered',available:0,locked:0,kyc:'pending',blocked:false,merchant:false,orders:0,completion:0,payment:''});log(s,account.id,'Registered local account',account.id);}});
}
async function sessionResponse(request:Request,admin:boolean,who:string){
 const raw=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
 await db().batch([db().prepare('DELETE FROM demo_sessions WHERE expires<?').bind(Date.now()),db().prepare('DELETE FROM demo_sessions WHERE token=?').bind(token(request,admin)),db().prepare('INSERT INTO demo_sessions (token,identity,expires) VALUES (?,?,?)').bind(raw,who,Date.now()+86400000)]);
 return response({ok:true},200,{'Set-Cookie':cookieName(admin)+'='+raw+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400'+(publicOrigin()?'; Secure':'')});
}
function txt(x:unknown,max=300){return typeof x==='string'?x.trim().slice(0,max):'';}
function int(x:unknown,min:number,max:number){if(typeof x!=='number'||!Number.isSafeInteger(x)||x<min||x>max)throw new Fault('Enter an amount within the allowed range.');return x;}
async function body(request:Request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Fault('JSON required.');const reader=request.body?.getReader();if(!reader)throw new Fault('Missing request.');let size=0;const chunks:Uint8Array[]=[];while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();throw new Fault('Request too large.',413);}chunks.push(part.value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes)) as Record<string,unknown>;}catch{throw new Fault('Invalid request.');}}
export async function GET(request:Request){try{local(request);const admin=new URL(request.url).searchParams.get('workspace')==='admin';const id=await identity(request,admin);if(admin&&id!=='admin')return response({error:'Open the demo admin workspace.',login:true},401);let {state,revision}=await read();if(state.orders.some(canExpire)){const updated=await change(s=>{for(const o of s.orders)if(canExpire(o)){giveBack(s,o,'Payment timer expired');log(s,'System','Unpaid order expired',o.id);}});state=updated.state;revision=updated.revision;}return response(view(state,id,admin,revision));}catch(e){return failure(e);}}
export async function POST(request:Request){try{local(request,true);const b=await body(request);if(!b||typeof b!=='object')throw new Fault('Invalid request.');const action=txt(b.action,40);const admin=request.headers.get('x-demo-workspace')==='admin';const id=await identity(request,admin);
if(action==='register'){if(admin)throw new Fault('Use the user registration page.');const account=await register(request,b);await ensureProfile(account);return response({ok:true,message:'Account created. Log in with your email and Nexa app password.'},201);}
if(action==='login'){
 if(admin){if(publicOrigin())throw new Fault('Use the protected administrator sign-in.',403);if(b.persona!=='admin')throw new Fault('Open the local demo admin.');return sessionResponse(request,true,'admin');}
 const account=await authenticate(request,b);await ensureProfile(account);
 return sessionResponse(request,false,account.id);
}
if(action==='logout'){await db().prepare('DELETE FROM demo_sessions WHERE token=?').bind(token(request,admin)).run();return response({ok:true},200,{'Set-Cookie':cookieName(admin)+'=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
if(!id||(admin&&id!=='admin'))throw new Fault('Open a demo account to continue.',401);
if(['checkout','submit_utr','payment_status'].includes(action))return await gatewayAction(request,b,id,admin);
const updated=await change(s=>{
const adminOnly=()=>{if(!admin||id!=='admin')throw new Fault('Demo administrator access required.',403);};
const user=admin?null:actorUser(s,id);
if(user?.blocked&&!['chat','order_action'].includes(action))throw new Fault('This demo account is restricted.',403);
if(action==='admin_create_order')throw new Fault('Register a seller in Sellers & rates. Purchase orders are created by the customer.',400);
if(action==='normalize_sellers'){
 adminOnly();let count=0;
 for(const offer of s.offers)if(offer.createdBy==='admin'&&offer.side!=='sell'){offer.side='sell';offer.updated=Date.now();count++;}
 if(count)log(s,'Admin','Moved '+count+' seller listing(s) to customer Buy marketplace','Buy-only marketplace');
 return {converted:count};
}
if(action==='create_order'){
 if(admin||!user)throw new Fault('Log in to a customer account to buy USDT.',403);
 if(b.side!==undefined&&b.side!=='buy')throw new Fault('Customers can only buy USDT. Selling is not supported.',400);
 const trader=user,requestId=txt(b.requestId,80);
 const fingerprint=JSON.stringify([trader.id,b.offerId,b.fiat,b.method,b.side,b.price]);
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))throw new Fault('A valid purchase request ID is required.');
 const previous=s.orders.find(o=>o.createdBy===id&&o.requestId===requestId);
 if(previous){if(previous.requestFingerprint!==fingerprint)throw new Fault('This request already created a different order. Close and reopen the form.',409);return {orderId:previous.id};}
 if(trader.blocked||trader.accountType!=='registered')throw new Fault('Select an active registered user.');
 if(!s.settings.trading)throw new Fault('Purchases are temporarily paused.');
 if(s.orders.length>=1000)throw new Fault('Local demo order limit reached.');
 const offer=s.offers.find(o=>o.id===b.offerId&&o.active&&o.createdBy==='admin'&&o.side==='sell');
 if(!offer)throw new Fault('This seller is unavailable for purchases.');
 if(offer.owner===trader.id)throw new Fault('You cannot buy from your own seller listing.');
 if(b.price!==offer.price)throw new Fault('The seller rate changed. Refresh and confirm the updated quote.',409);
 const seller=actorUser(s,offer.owner);
 if(seller.blocked||seller.accountType!=='listing')throw new Fault('This seller is unavailable.');
 const fiat=int(b.fiat,Math.max(500000,offer.min),Math.min(3000000,offer.max)),qty=Math.floor(fiat*UNIT/offer.price),fee=Math.ceil(qty*s.settings.feeBps/10000);
 if(qty>offer.available||seller.available<qty+fee)throw new Fault('The seller has insufficient available USDT for this purchase.');
 const method=txt(b.method,30);if(!offer.methods.includes(method))throw new Fault('Select an available payment method.');
 seller.available-=qty+fee;seller.locked+=qty+fee;offer.available-=qty;
 const now=Date.now();
 const o:Order={id:'NX-'+uid().slice(0,8).toUpperCase(),offerId:offer.id,buyer:trader.id,seller:seller.id,quantity:qty,fee,price:offer.price,fiat,method,status:'awaiting_payment',created:now,expires:now+Math.min(offer.minutes,s.settings.orderMinutes)*60000,updated:now,messages:[{id:uid(),sender:'System',text:'Test purchase created. Payment gateway is not connected. Do not send money; payment confirmation and wallet credit are disabled.',time:now}],reason:'',createdBy:id,createdFor:trader.id,requestId,requestFingerprint:fingerprint,paymentMode:'gateway_pending',advertiserName:offer.displayName||seller.name};
 s.orders.unshift(o);entry(s,seller.id,'Escrow locked',qty+fee,o.id,'Customer USDT purchase — local test');log(s,id,'Created purchase order',o.id);return {orderId:o.id};
}
if(action==='order_action'||action==='chat'){
 const o=s.orders.find(o=>o.id===b.orderId);if(!o)throw new Fault('Order not found.',404);
 if(!admin&&![o.buyer,o.seller].includes(id))throw new Fault('This order belongs to another account.',403);
 if(action==='chat'){const message=txt(b.text,1000);if(!message)throw new Fault('Enter a message.');if(o.messages.length>=150)throw new Fault('Demo chat limit reached.');o.messages.push({id:uid(),sender:admin?'Admin':id,text:message,time:Date.now()});return;}
 const op=txt(b.operation,30);
 if(o.paymentMode==='gateway_pending'&&op!=='cancel')throw new Fault('Payment gateway is not connected. Payment confirmation and wallet credit are disabled.',409);
 if(op==='cancel'&&o.payment&&!['failed'].includes(o.payment.phase))throw new Fault('A gateway payment may be in progress. Check its status before cancelling.',409);
 if(o.status==='awaiting_payment'&&o.expires<Date.now())throw new Fault('Payment timer expired. Refresh this order.');
 if(op==='paid'){if(id!==o.buyer||admin)throw new Fault('Only the buyer can mark payment.',403);if(o.status!=='awaiting_payment')throw new Fault('This order is not awaiting payment.');o.status='paid';}
 else if(op==='simulate_paid'){if(admin||id!==o.seller)throw new Fault('Only the seller can simulate the counterparty payment.',403);if(o.status!=='awaiting_payment')throw new Fault('This order is not awaiting payment.');o.status='paid';o.messages.push({id:uid(),sender:'System',text:'Counterparty payment simulated. No real INR was transferred.',time:Date.now()});}
 else if(op==='release'||op==='simulate_release'){if(admin|| (op==='release'?id!==o.seller:id!==o.buyer))throw new Fault('This action is unavailable for this account.',403);if(o.status!=='paid')throw new Fault('Payment must be marked before release.');if(b.confirm!==true)throw new Fault('Confirm this simulated release.');release(s,o);}
 else if(op==='cancel'){if(admin||o.status!=='awaiting_payment')throw new Fault('Only unpaid orders can be cancelled.');giveBack(s,o,'Cancelled before payment');}
 else if(op==='dispute'){if(o.status!=='paid')throw new Fault('Mark payment before opening a dispute.');const reason=txt(b.reason,500);if(reason.length<8)throw new Fault('Describe the issue in at least 8 characters.');o.status='disputed';o.reason=reason;}
 else if(op==='resolve_release'||op==='resolve_return'){adminOnly();if(o.status!=='disputed')throw new Fault('This order is not in dispute.');const reason=txt(b.reason,500);if(reason.length<8)throw new Fault('Add a resolution note.');o.reason=reason;if(op==='resolve_release')release(s,o);else giveBack(s,o,reason);}
 else throw new Fault('Unknown order action.');
 o.updated=Date.now();log(s,admin?'Admin':id,op.replaceAll('_',' '),o.id);return;
}
if(action==='funds'){throw new Fault('Deposits, withdrawals and manual wallet credits are disabled until verified payment integration is connected.',409);}

if(action==='profile'){if(!user)throw new Fault('User profile required.');const name=txt(b.name,50);if(name.length<2)throw new Fault('Enter a display name.');user.name=name;log(s,id,'Updated display name',id);return;}
if(action==='offer'){
 adminOnly();
 const existing=s.offers.find(o=>o.id===b.id);
 if(b.id&&!existing)throw new Fault('Listing not found.',404);
 if(existing?.createdBy!=='admin'&&existing)throw new Fault('Historical sample ads are archived. Create an admin listing instead.');
 if(existing&&typeof b.active==='boolean'&&!('price' in b)){existing.active=b.active;existing.updated=Date.now();log(s,'Admin',b.active?'Activated listing':'Paused listing',existing.id);return;}
 if(!existing&&s.offers.length>=500)throw new Fault('Local listing limit reached (500).');
 const displayName=txt(b.displayName,50);if(displayName.length<2)throw new Fault('Enter the seller name (2–50 characters).');
 if(b.side!==undefined&&b.side!=='sell')throw new Fault('Register USDT sellers only. Customers cannot sell USDT.');
 const side='sell' as const,price=int(b.price,100,100000),available=int(b.available,UNIT,100000*UNIT);
 const min=int(b.min,500000,3000000),max=int(b.max,min,3000000);
 const methods=['UPI'];
 let maker=existing?actorUser(s,existing.owner):null;
 if(!maker){
  maker={id:'m-'+uid().slice(0,12),name:displayName,email:'',accountType:'listing',available:available+Math.ceil(available/100),locked:0,kyc:'pending',blocked:false,merchant:true,orders:0,completion:0,payment:''};
  s.users.push(maker);entry(s,maker.id,'Listing test inventory',maker.available,'','Admin listing — not real crypto');
 }else{
  // Each admin listing has its own simulated inventory; outstanding escrow is untouched.
  const next=available+Math.ceil(available/100),delta=next-maker.available;
  maker.available=next;maker.name=displayName;
  if(delta)entry(s,maker.id,'Listing test inventory adjustment',delta,'','Not a customer credit');
 }
 const fields={displayName,side,price,available,min,max,methods,minutes:s.settings.orderMinutes,terms:'Admin-published test listing. Payment gateway is not connected.',updated:Date.now()};
 if(existing)Object.assign(existing,fields);
 else s.offers.unshift({id:'ad-'+uid().slice(0,12),owner:maker.id,...fields,active:true,createdBy:'admin'});
 log(s,'Admin',existing?'Updated listing':'Published listing',existing?.id||maker.id);return;
}
if(action==='user_status'){adminOnly();const target=actorUser(s,txt(b.userId,20));if(typeof b.blocked==='boolean')target.blocked=b.blocked;if(b.kyc==='verified'||b.kyc==='pending')target.kyc=b.kyc;log(s,'Admin','Updated demo user status',target.id);return;}
if(action==='settings'){adminOnly();s.settings={brand:txt(b.brand,20)||'Nexa',announcement:txt(b.announcement,150),trading:b.trading===true,feeBps:int(b.feeBps,0,100),orderMinutes:int(b.orderMinutes,5,60)};log(s,'Admin','Updated platform settings','Settings');return;}
throw new Fault('Unknown action.');
});
return response({ok:true,...view(updated.state,id,admin,updated.revision),result:updated.value});
}catch(e){return failure(e);}}
function usdtLabel(n:number){return (n/UNIT).toFixed(2)+' USDT';}
function failure(e:unknown){if(e instanceof GatewayFault)return response({error:e.message},502);if(e instanceof Fault||e instanceof AuthFault)return response({error:e.message},e.status);console.error('Local storage request failed.');return response({error:'Local storage is unavailable. Please retry without closing your form.'},503);}
async function gatewayAction(request:Request,b:Record<string,unknown>,id:string,admin:boolean){
 if(admin)throw new Fault('Only the buyer can open their checkout.',403);
 const config=gatewayConfig();if(!config.enabled)throw new Fault(config.reason,503);
 const orderId=txt(b.orderId,30),action=txt(b.action,30);
 const snapshot=await read();const order=snapshot.state.orders.find(o=>o.id===orderId);
 if(!order||order.buyer!==id)throw new Fault('Payment order not found for this account.',403);
 if(order.paymentMode!=='gateway_pending'||order.method!=='UPI'||order.status!=='awaiting_payment')throw new Fault('This order cannot open gateway checkout.',409);
 if(snapshot.state.users.find(u=>u.id===id)?.blocked)throw new Fault('This account is restricted.',403);
 if(action==='checkout'){
  if(order.payment?.checkoutUrl&&['pending','review'].includes(order.payment.phase))return response({ok:true,...view(snapshot.state,id,false,snapshot.revision),result:{checkoutUrl:order.payment.checkoutUrl}});
  // Claim before the external call. No retry after an uncertain upstream result.
  await change(s=>{
   const current=s.orders.find(o=>o.id===orderId)!;
   if(current.payment)throw new Fault('A gateway attempt already exists. Check its status; do not pay twice.',409);
   if(current.status!=='awaiting_payment'||current.expires<=Date.now())throw new Fault('This unpaid order has expired.',409);
   current.payment={phase:'creating',updated:Date.now()};log(s,id,'Started gateway checkout',orderId);
  });
  try{
   const result=await createPayin(order.fiat,config.key);
   const updated=await change(s=>{
    if(s.orders.some(o=>o.id!==orderId&&o.payment?.providerOrderId===result.providerOrderId))throw new GatewayFault('Gateway returned a duplicate payment ID.',true);
    const current=s.orders.find(o=>o.id===orderId)!;
    if(current.payment?.phase!=='creating')throw new GatewayFault('Gateway attempt needs reconciliation.',true);
    current.payment={...result,phase:'pending',updated:Date.now()};
    return {checkoutUrl:result.checkoutUrl};
   });
   return response({ok:true,...view(updated.state,id,false,updated.revision),result:updated.value});
  }catch(error){
   await change(s=>{const current=s.orders.find(o=>o.id===orderId)!;if(current.payment?.phase==='creating')current.payment={phase:error instanceof GatewayFault&&!error.uncertain?'failed':'unknown',updated:Date.now()};});
   throw error;
  }
 }
 if(!order.payment?.providerOrderId||!['pending','review'].includes(order.payment.phase))throw new Fault('No confirmed gateway order ID is available. Contact support; do not start another payment.',409);
 if(action==='submit_utr')await submitUtr(order.payment.providerOrderId,txt(b.utr,20),config.key);
 const status=await payinStatus(order.payment.providerOrderId,order.fiat,config.key);
 const updated=await change(s=>{
  const current=s.orders.find(o=>o.id===orderId)!;
  if(!current.payment||current.payment.providerOrderId!==order.payment?.providerOrderId)throw new Fault('Payment record changed. Please refresh.',409);
  if(current.payment.phase!=='review'){
   current.payment.phase=status==='success'?'review':status==='failed'?'failed':'pending';
   current.payment.updated=Date.now();
   if(status==='success'){current.messages.push({id:uid(),sender:'System',text:'Gateway reports success for the matching order and amount. Wallet credit remains disabled: settlement currency and real USDT custody have not been configured.',time:Date.now()});log(s,'Gateway','Payment reported successful — credit disabled',current.id);}
  }
  return {paymentStatus:status};
 });
 return response({ok:true,...view(updated.state,id,false,updated.revision),result:updated.value});
}
