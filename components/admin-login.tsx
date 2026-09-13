'use client';
import {useState} from 'react';
import {LockKeyhole,ArrowRight,Eye,EyeOff} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Brand} from './demo-shared';

export function AdminLogin(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/demo',{method:'POST',headers:{'Content-Type':'application/json','x-demo-workspace':'admin'},body:JSON.stringify({action:'login',email,password})});
   const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||'Unable to sign in.');
   setPassword('');location.assign('/admin');
  }catch(e){setError(e instanceof Error?e.message:'Unable to sign in.');}finally{setBusy(false);}
 }
 return <div className="login-page"><header><Brand/></header><main className="admin-login-wrap"><section className="login-card"><div className="login-icon"><LockKeyhole/></div><h2>Administrator sign in</h2><p>Access is restricted to the configured administrator.</p><form className="form-stack" onSubmit={submit}><fieldset className="form-stack" disabled={busy}><label>Email address<Input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<div className="password-field"><Input type={show?'text':'password'} autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/><Button type="button" variant="ghost" size="icon" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(!show)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</Button></div></label>{error&&<div role="alert" className="form-error">{error}</div>}<Button type="submit" className="full primary-action" disabled={busy}>{busy?'Signing in…':'Sign in'}<ArrowRight size={17}/></Button></fieldset></form></section></main></div>;
}
