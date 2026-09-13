'use client';
import {useState,useEffect,useCallback,useRef,type ReactNode} from 'react';
import {toast} from 'sonner';
import {readApiResponse} from '@/lib/api-response';
import {Button} from '@/components/ui/button';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Skeleton} from '@/components/ui/skeleton';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription,EmptyContent,EmptyMedia} from '@/components/ui/empty';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogAction,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {RefreshCw,ArrowUpRight,Inbox} from 'lucide-react';
import {statusLabel,type ViewData} from '@/lib/types';
export type Action=(b:Record<string,unknown>)=>Promise<(ViewData&{ok:boolean;result?:{orderId?:string;checkoutUrl?:string;paymentStatus?:string}})|null>;
export function useDemo(admin=false){
 const [data,setData]=useState<ViewData|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[login,setLogin]=useState(false);
 const working=useRef(false);
 const refresh=useCallback(async()=>{try{const r=await fetch('/api/server'+(admin?'?workspace=admin':''),{cache:'no-store'});if(r.status===401){setLogin(true);return;}const b=await readApiResponse<ViewData>(r);setLogin(false);setError('');setData(old=>!old||b.revision>=old.revision?b:old);}catch(e){setError(e instanceof Error?e.message:'Could not load records.');}},[admin]);
 useEffect(()=>{
  void refresh();
  const es = new EventSource('/api/events');
  es.onmessage = () => { if(document.visibilityState==='visible'&&!working.current) void refresh(); };
  return () => es.close();
 },[refresh]);
 const act:Action=useCallback(async b=>{if(working.current)return null;working.current=true;setBusy(true);try{const r=await fetch('/api/server',{method:'POST',headers:{'Content-Type':'application/json',...(admin?{'x-demo-workspace':'admin'}:{})},body:JSON.stringify(b)});const result=await readApiResponse<ViewData & {ok:boolean;result?:{orderId?:string;checkoutUrl?:string;paymentStatus?:string}}>(r);if(result.users)setData(old=>old&&old.revision>result.revision?old:result);return result;}catch(e){toast.error(e instanceof Error?e.message:'Update failed. Please retry.');return null;}finally{working.current=false;setBusy(false);}},[admin]);
 return {data,error,busy,login,refresh,act};
}
export function Brand({name='Nexa'}:{name?:string}){return <a className="brand" href="/"><span className="brand-mark">{name[0]?.toUpperCase()||'N'}</span>{name.toUpperCase()}<span className="brand-tag">P2P</span></a>;}
export function Picker({value,onChange,items,label}:{value:string;onChange:(v:string)=>void;items:(string|[string,string])[];label:string}){return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{items.map(x=>{const [v,t]=typeof x==='string'?[x,x]:x;return <SelectItem key={v} value={v}>{t}</SelectItem>;})}</SelectContent></Select>;}
export function FilterTabs({value,onChange,items}:{value:string;onChange:(v:string)=>void;items:[string,string][]}){return <Tabs value={value} onValueChange={onChange}><TabsList className="filter-tabs" variant="line">{items.map(([v,t])=><TabsTrigger key={v} value={v}>{t}</TabsTrigger>)}</TabsList></Tabs>;}
export function Status({value}:{value:string}){return <span className={'status status-'+value}>{statusLabel(value)}</span>;}
export function Stat({label,value,detail,icon}:{label:string;value:string;detail:string;icon?:ReactNode}){return <div className="stat-card"><div>{label}{icon||<ArrowUpRight size={16}/>}</div><strong>{value}</strong><p>{detail}</p></div>;}
export function EmptyState({title,text,children}:{title:string;text:string;children?:ReactNode}){return <Empty className="empty-state"><EmptyHeader><EmptyMedia><Inbox size={32}/></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{text}</EmptyDescription></EmptyHeader>{children&&<EmptyContent>{children}</EmptyContent>}</Empty>;}
export function Loading({error,retry}:{error:string;retry:()=>void}){return <div className="loading-state">{error?<><h2>Records couldn't load</h2><p>{error}</p><Button onClick={retry}><RefreshCw size={16}/>Retry</Button></>:<><Skeleton className="h-10 w-60"/><Skeleton className="h-24 w-full"/><Skeleton className="h-24 w-full"/></>}</div>;}
export function Confirm({open,onClose,onConfirm,title,text}:{open:boolean;onClose:()=>void;onConfirm:()=>void;title:string;text:string}){return <AlertDialog open={open} onOpenChange={v=>!v&&onClose()}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{text}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Go back</AlertDialogCancel><AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;}
export const when=(n:number)=>new Date(n).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
export function csvDownload(filename:string,headers:string[],rows:unknown[][]){const cell=(v:unknown)=>{let s=String(v??'');if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const blob=new Blob(['\uFEFF'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
