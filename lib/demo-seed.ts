import {UNIT,type DemoState,type Order} from './demo-types';
export function seed(hosted=false):DemoState{
if(hosted){
 const now=Date.now();
 // Only public seller configuration is carried over. Local accounts, sessions,
 // historical sample transactions and private records are never uploaded.
 const listings=[{name:'aman usdt seller',price:9665,available:9948266943},{name:'tiger',price:9700,available:10000000000}];
 const users=listings.map((x,i)=>({id:'public-seller-'+i,name:x.name,email:'',accountType:'listing' as const,available:x.available+Math.ceil(x.available/100),locked:0,kyc:'pending' as const,blocked:false,merchant:true,orders:0,completion:0,payment:''}));
 return {users,offers:listings.map((x,i)=>({id:'public-listing-'+i,owner:users[i].id,displayName:x.name,side:'sell',price:x.price,available:x.available,min:500000,max:3000000,methods:['UPI'],minutes:15,active:true,createdBy:'admin',updated:now,terms:'Test listing. No real payment or crypto transfer is enabled.'})),orders:[],ledger:[],audit:[{id:'public-setup',actor:'System',action:'Public prototype initialized with seller configuration only',target:'Nexa',time:now}],settings:{brand:'Nexa',announcement:'Prototype only — do not send real money. Payment and USDT transfers are disabled.',trading:true,feeBps:0,orderMinutes:15},treasury:0};
}
const now=Date.now();
const names=['Arjun Mehta','Atlas Exchange','Rupee Bridge','Bluefin Capital','Trade Harbor','Swift Digital','Zenith Markets'];
const users=names.map((name,i)=>({id:i?'m'+i:'u1',name,email:(i?'merchant'+i:'arjun')+'@nexa.example',available:(i?25000-i*1700:1250.5)*UNIT,locked:0,kyc:'verified' as const,blocked:false,merchant:i>0,orders:[24,1428,896,2301,654,1872,982][i],completion:99.8-i*.1,payment:'Test UPI •••• '+(2400+i)}));
const offers=users.filter(u=>u.merchant).flatMap((u,i)=>(['sell','buy'] as const).map(side=>({id:side+'-'+u.id,owner:u.id,side,price:side==='sell'?9432+i*4:9421-i*3,available:(12580-i*1176)*UNIT,min:(i===2?5000:1000)*100,max:(200000+i*10000)*100,methods:i===3?['Bank transfer']:['UPI','Bank transfer'],minutes:i%2?10:15,active:true,terms:'Test order only. Do not send real money. Use the simulated payment controls to test this trade.'})));
const orders:Order[]=Array.from({length:8},(_,i)=>({id:'NX-10480'+i,offerId:'sell-m'+(i%6+1),buyer:i%3?'u1':'m2',seller:'m'+(i%6+1),quantity:(50+i*25)*UNIT,fee:0,price:9432,fiat:Math.round((50+i*25)*9432),method:i%2?'UPI':'Bank transfer',status:'completed',created:now-(8-i)*86400000,expires:now-(8-i)*86400000+900000,updated:now-(8-i)*86400000+360000,messages:[],reason:'Historical sample order'}));
return {users,offers,orders,ledger:users.map(u=>({id:'opening-'+u.id,user:u.id,type:'Opening test balance',amount:u.available,orderId:'',time:now,reference:'Seeded test funds; historical orders are illustrative'})),audit:[{id:'setup',actor:'System',action:'Local test environment initialized',target:'Nexa P2P',time:now}],settings:{brand:'Nexa',announcement:'Trade with confidence. Every test order uses simulated escrow.',trading:true,feeBps:0,orderMinutes:15},treasury:0};
}
