'use client';
import {useState} from 'react';
import {CreditCard,ExternalLink,RefreshCw,ShieldAlert} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {toast} from 'sonner';
import {type Action} from './app-shared';
import {type Order,type ViewData} from '@/lib/types';
export function GatewayCheckout({order,data,act,busy,admin,onCancel}:{order:Order;data:ViewData;act:Action;busy:boolean;admin:boolean;onCancel:()=>void}){
 const [utr,setUtr]=useState('');const payment=order.payment,buyer=order.buyer===data.user?.id;
 const canOpen=data.gateway.enabled&&buyer&&(!payment||(payment.phase==='pending'&&!!payment.checkoutUrl));
 async function checkout(){const result=await act({action:'checkout',orderId:order.id});if(result?.result?.checkoutUrl)location.assign(result.result.checkoutUrl);}
 async function status(submit=false){const result=await act({action:submit?'submit_utr':'payment_status',orderId:order.id,...(submit?{utr}:{})});if(result)toast.info(result.result?.paymentStatus==='success'?'Payment verified. Awaiting admin approval; no wallet credit has been made yet.':result.result?.paymentStatus==='failed'?'Gateway reports payment failed.':'Payment is still pending.');}
 return <div className="panel action-panel gateway-checkout">
  <div className="gateway-title"><CreditCard/><div><h2>UPI payment</h2><p>DivinePay hosted checkout</p></div></div>
  {!data.gateway.enabled&&<div className="inline-notice"><ShieldAlert size={18}/><p>{data.gateway.reason} New payment links are disabled. Do not send money.</p></div>}
  {payment?.phase==='unknown'?<div className="form-error">The payment provider did not return a confirmed result. Support must check this existing order before any further payment. Do not pay again or create a replacement order.</div>
   :payment?.phase==='creating'?<div className="inline-notice">The gateway request is being checked. Do not start another payment. If this does not change, contact support with this order ID.</div>
   :payment?.phase==='review'?<div className="inline-notice">Payment verified for this order and amount. Awaiting admin approval; USDT has not been credited yet.</div>
   :payment?.phase==='failed'?<p>The gateway did not confirm a successful payment. You can cancel this order.</p>
   :data.gateway.enabled&&<p>The QR and UPI options open on the gateway’s secure checkout page. Return here to check status.</p>}
  {payment?.providerOrderId&&<p className="gateway-reference">Gateway reference: {payment.providerOrderId}</p>}
  {payment?.diagnosticReference&&<p className="gateway-reference">Support reference: {payment.diagnosticReference}</p>}
  {!admin&&buyer&&<>
   <div className="button-row">
    <Button disabled={busy||!canOpen} onClick={()=>void checkout()}>{payment?.checkoutUrl?'Reopen payment':'Open UPI payment'}<ExternalLink size={16}/></Button>
    {payment?.providerOrderId&&['pending','review'].includes(payment.phase)&&<Button variant="outline" disabled={busy||!data.gateway.configured} onClick={()=>void status()}><RefreshCw size={16}/>Check status</Button>}
    {(!payment||payment.phase==='failed')&&<Button variant="outline" disabled={busy} onClick={onCancel}>Cancel order</Button>}
   </div>
   {payment?.phase==='pending'&&<form className="form-stack utr-form" onSubmit={e=>{e.preventDefault();void status(true);}}><label>UTR (optional, if requested by gateway)<Input inputMode="numeric" maxLength={12} pattern="[0-9]{12}" required value={utr} onChange={e=>setUtr(e.target.value.replace(/\D/g,'').slice(0,12))} placeholder="12-digit UPI reference"/></label><Button type="submit" disabled={busy||!data.gateway.configured||utr.length!==12}>Submit UTR & check status</Button></form>}
  </>}
  {!admin&&!buyer&&<p>Only the buyer can open gateway checkout.</p>}
 </div>;
}
