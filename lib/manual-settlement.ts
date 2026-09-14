import {type AppState,type Order,type Withdrawal} from './types';
import {SettlementFault,validTronAddress} from './tron-verification';
const recordId=()=>crypto.randomUUID();
export function settlementReady(s:AppState){
 const c=s.settlement;
 return !!c&&c.network==='TRC20'&&validTronAddress(c.senderAddress)&&Number.isInteger(c.deliveryHours)&&c.deliveryHours>=1&&c.deliveryHours<=168&&c.refundPolicy.length>=30&&c.supportContact.length>=5;
}
export function reserveLiability(s:AppState){
 const holdings=s.users.reduce((sum,u)=>sum+(u.live?.available||0)+(u.live?.locked||0),0);
 const pending=s.orders.filter(o=>o.liveEligible&&!o.approval&&o.status!=='cancelled'&&o.payment?.phase!=='failed').reduce((sum,o)=>sum+o.quantity,0);
 const total=holdings+pending;if(!Number.isSafeInteger(total))throw new SettlementFault('Reserve accounting is outside the supported range.');
 return total;
}
export function checkRealBalances(s:AppState){
 const withdrawals=s.withdrawals||[];
 const seen=new Set<string>();
 for(const w of withdrawals){
  if(!Number.isSafeInteger(w.quantity)||w.quantity<=0)throw new SettlementFault('Withdrawal amount check failed.');
  if(w.txHash){if(seen.has(w.txHash))throw new SettlementFault('A transaction ID is already assigned to another withdrawal.');seen.add(w.txHash);}
 }
 for(const u of s.users){
  const available=u.live?.available||0,locked=u.live?.locked||0;
  if(!Number.isSafeInteger(available)||!Number.isSafeInteger(locked)||available<0||locked<0)throw new SettlementFault('Verified balance check failed.');
  const earned=s.orders.filter(o=>o.buyer===u.id&&o.approval&&o.liveEligible).reduce((sum,o)=>sum+o.quantity,0);
  const paid=withdrawals.filter(w=>w.user===u.id&&w.phase==='completed').reduce((sum,w)=>sum+w.quantity,0);
  const reserved=withdrawals.filter(w=>w.user===u.id&&!['completed','cancelled'].includes(w.phase)).reduce((sum,w)=>sum+w.quantity,0);
  if(available+locked!==earned-paid||locked!==reserved)throw new SettlementFault('Verified wallet ledger does not reconcile. No changes were saved.');
 }
}
export function approvePaidPurchase(s:AppState,o:Order,note:string){
 if(o.approval)return;
 if(!o.liveEligible||!o.manualTerms||!o.payment?.providerOrderId||o.payment.phase!=='review'||o.status!=='awaiting_payment')throw new SettlementFault('A verified gateway payment and funded checkout are required before approval.');
 const buyer=s.users.find(u=>u.id===o.buyer),seller=s.users.find(u=>u.id===o.seller);
 if(!buyer||buyer.accountType!=='registered'||!seller)throw new SettlementFault('Purchase accounts could not be verified.');
 const now=Date.now();
 seller.locked-=o.quantity+o.fee;seller.available+=o.fee;
 buyer.live={available:(buyer.live?.available||0)+o.quantity,locked:buyer.live?.locked||0};
 o.approval={at:now,note,providerOrderId:o.payment.providerOrderId};o.status='completed';o.updated=now;buyer.orders++;seller.orders++;
 s.ledger.unshift({id:recordId(),user:buyer.id,type:'Approved USDT purchase',amount:o.quantity,orderId:o.id,time:now,reference:o.payment.providerOrderId,real:true});
 s.audit.unshift({id:recordId(),actor:'Admin',action:'Approved verified payment; credited wallet once',target:o.id,time:now});
 o.messages.push({id:recordId(),sender:'System',text:'Admin approved the verified payment. USDT is credited to your platform balance. TRC20 withdrawals are delivered manually.',time:now});
}
export function completeWithdrawal(s:AppState,w:Withdrawal,blockNumber:number){
 if(w.phase==='completed')return;
 if(w.phase!=='submitted'||!w.txHash)throw new SettlementFault('Record the transfer transaction ID first.');
 const user=s.users.find(u=>u.id===w.user);if(!user?.live)throw new SettlementFault('Verified wallet balance is missing.');
 user.live.locked-=w.quantity;w.phase='completed';w.blockNumber=blockNumber;w.completedAt=Date.now();w.updated=w.completedAt;
 s.ledger.unshift({id:recordId(),user:w.user,type:'TRC20 withdrawal completed',amount:-w.quantity,orderId:w.id,time:w.updated,reference:w.txHash,real:true});
 s.audit.unshift({id:recordId(),actor:'Admin',action:'TRC20 transfer verified; deducted wallet once',target:w.id,time:w.updated});
}
