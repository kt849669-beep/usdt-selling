import {notFound,redirect} from 'next/navigation';
import {cookies} from 'next/headers';
import {publicOrigin,adminConfigured,permittedAdmin,appAdminAuth} from '@/lib/deployment-access';
import {appAdminConfigured,hasAdminSession} from '@/lib/admin-auth';
import {AdminLogin} from '@/components/admin-login';
import {requireChatGPTUser,chatGPTSignOutPath} from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
import {NexaUser} from '@/components/nexa-user';
import {NexaAdmin} from '@/components/nexa-admin';
import {DemoLogin} from '@/components/app-login';
export default async function Page({params}:{params:Promise<{path:string[]}>}){
const {path}=await params;
if(path[0]==='login'&&path.length===1)return <DemoLogin/>;
if(path[0]==='register'&&path.length===1)return <DemoLogin initialRegister/>;
if(path[0]==='admin'){
 return <AdminRoute path={path}/>;
}else{
 if(path[0]==='orders'&&path.length===2)return <NexaUser screen="order" orderId={path[1]}/>;
 if(path.length===1&&['orders','wallet','offers','profile','support'].includes(path[0]))return <NexaUser screen={path[0]}/>;
}
notFound();
}
async function AdminRoute({path}:{path:string[]}){
 const appAuth=appAdminAuth();
 const hosted=!!publicOrigin()||appAuth;
 if(appAuth){
  if(!appAdminConfigured())return <main className="loading-state"><h1>Admin access is locked</h1><p>The owner must configure administrator credentials before this workspace can open.</p><a href="/">Open user app</a></main>;
  if(path[1]==='login'&&path.length===2)return <AdminLogin/>;
  let authenticated=false;
  try{authenticated=await hasAdminSession((await cookies()).get('nexa_demo_admin')?.value||'');}
  catch{return <main className="loading-state"><h1>Sign-in is temporarily unavailable</h1><p>Please try again when the database connection is restored.</p></main>;}
  if(!authenticated)redirect('/admin/login');
 }
 if(hosted&&!appAuth){
  if(!adminConfigured())return <main className="loading-state"><h1>Admin access is locked</h1><p>The owner must configure the authorized administrator email before this workspace can open.</p><a href="/">Open user app</a></main>;
  const user=await requireChatGPTUser('/'+path.join('/'));
  if(!permittedAdmin(user.userId,user.email))return <main className="loading-state"><h1>Administrator access only</h1><p>This signed-in account is not authorized to manage Nexa.</p><a href={chatGPTSignOutPath('/admin')} target="_top">Sign out</a></main>;
 }
 if(path[1]==='login'&&path.length===2)return hosted?<NexaAdmin hosted/>:<DemoLogin admin/>;
 if(path[1]==='orders'&&path.length===3)return <NexaAdmin hosted={hosted} appAuth={appAuth} screen="order" orderId={path[2]}/>;
 if(path.length===1)return <NexaAdmin hosted={hosted} appAuth={appAuth}/>;
 if(path.length===2&&['users','orders','withdrawals','offers','disputes','reports','settings','profile'].includes(path[1]))return <NexaAdmin hosted={hosted} appAuth={appAuth} screen={path[1]}/>;
notFound();
}
