// Never display an HTML error document or retry a state-changing request here.
export async function readApiResponse<T>(response:Response):Promise<T>{
 const fallback=response.status===429?'Too many attempts. Please try again shortly.':'The service is temporarily unavailable. Please try again; your form has not been cleared.';
 if(!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw new Error(fallback);
 let value:unknown;
 try{value=await response.json();}catch{throw new Error(fallback);}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(fallback);
 if(!response.ok){
  const message=(value as {error?:unknown}).error;
  throw new Error(typeof message==='string'&&message.length<=500&&!/[<>]/.test(message)?message:fallback);
 }
 return value as T;
}
