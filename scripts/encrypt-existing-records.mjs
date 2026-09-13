// Run only after deploying the dual-read/encrypted-write application. No schema
// changes or deleted records; CAS updates preserve concurrent user changes.
import {neon} from '@neondatabase/serverless';
import {moduleLoader} from './load-test-module.mjs';
async function migrate(){
if(!process.argv.includes('--apply'))throw new Error('Explicit --apply is required.');
const key=process.env.NEXA_DATA_ENCRYPTION_KEY,lookupKey=process.env.NEXA_DATA_LOOKUP_KEY;
if(!/^[a-f0-9]{64}$/i.test(key||'')||!/^[a-f0-9]{64}$/i.test(lookupKey||''))throw new Error('Both private keys must be configured.');
const codec=moduleLoader({})('lib/storage-crypto.ts'),sql=neon(process.env.DATABASE_URL);
let accounts=0,stateConverted=false;
for(let attempt=0;attempt<8;attempt++){
 const rows=await sql.query('SELECT * FROM local_accounts');let pending=0;
 for(const row of rows){
  if(codec.isEncrypted(row.name)){codec.decodeAccount(row,key,lookupKey);continue;}
  pending++;
  const next=codec.encodeAccount(row,key,lookupKey);
  const result=await sql.query('UPDATE local_accounts SET name=$1,email=$2,mobile=$3 WHERE id=$4 AND name=$5 AND email=$6 AND mobile=$7 RETURNING id',[next.name,next.email,next.mobile,row.id,row.name,row.email,row.mobile]);
  accounts+=result.length;
 }
 if(!pending)break;
 if(attempt===7)throw new Error('Accounts changed concurrently; rerun safely.');
}
for(let attempt=0;attempt<8;attempt++){
 const [row]=await sql.query('SELECT data,revision FROM demo_state WHERE id=1');
 if(!row)break;
 if(codec.isEncrypted(row.data)){JSON.parse(codec.decrypt(row.data,'state:1',key));break;}
 JSON.parse(row.data);
 const result=await sql.query('UPDATE demo_state SET data=$1,revision=revision+1 WHERE id=1 AND revision=$2 RETURNING revision',[codec.encrypt(row.data,'state:1',key),row.revision]);
 if(result.length){stateConverted=true;break;}
 if(attempt===7)throw new Error('State changed concurrently; rerun safely.');
}
const remaining=await sql.query("SELECT count(*)::int n FROM local_accounts WHERE name NOT LIKE 'enc:v1:%' OR email NOT LIKE 'lookup:v1:%' OR mobile NOT LIKE 'lookup:v1:%'");
if(remaining[0].n)throw new Error('Some account records remain unconverted.');
console.log(JSON.stringify({accountsEncrypted:accounts,stateConverted,plaintextAccountsRemaining:0,recordsDeleted:0}));
}
await migrate().catch(()=>{console.error('Private-data conversion could not complete. No records were deleted; verify the keys and database, then rerun.');process.exitCode=1;});
