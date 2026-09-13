import 'server-only';
import {neon} from '@neondatabase/serverless';

// A small adapter for the prepared statements already used by the application.
// All values remain parameters; a batch is one atomic PostgreSQL transaction.
function client(){
 const url=process.env.DATABASE_URL;
 if(!url)throw new Error('DATABASE_URL is not configured.');
 return neon(url,{fullResults:true});
}
function postgresQuery(query:string){
 if(query.includes("'")||query.includes('"')||query.includes(';'))throw new Error('Only single parameterized application statements are supported.');
 let index=0;
 return query.replace(/\?/g,()=>'$'+(++index));
}
function normalized(row:Record<string,unknown>){
 const result={...row};
 for(const key of ['created','expires'])if(typeof result[key]==='string'){
  const n=Number(result[key]);if(!Number.isSafeInteger(n))throw new Error('Invalid database timestamp.');result[key]=n;
 }
 return result;
}
class Statement{
 constructor(readonly query:string,readonly values:unknown[]=[]){}
 bind(...values:unknown[]){return new Statement(this.query,values);}
 async result(){
  const result=await client().query(postgresQuery(this.query),this.values);
  return {success:true,results:result.rows.map(normalized),meta:{changes:result.rowCount??0}};
 }
 async first<T=Record<string,unknown>>(){return (await this.result()).results[0] as T|undefined??null;}
 async all(){return this.result();}
 async run(){return this.result();}
}
const database={
 prepare(query:string){return new Statement(query);},
 async batch(statements:Statement[]){
  const sql=client();
  const results=await sql.transaction(statements.map(s=>sql.query(postgresQuery(s.query),s.values)));
  return results.map(result=>({success:true,results:result.rows.map(normalized),meta:{changes:result.rowCount??0}}));
 }
};
export const env=new Proxy({} as Record<string,unknown>&{DB:D1Database},{
 get(_target,key){
  if(key==='DB')return database;
  if(key==='NEXA_RUNTIME')return 'vercel';
  return typeof key==='string'?process.env[key]:undefined;
 }
});
