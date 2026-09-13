import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL in the server environment first.');
const sql=neon(process.env.DATABASE_URL);
const text=await readFile(new URL('../postgres/0001_initial.sql',import.meta.url),'utf8');
const statements=text.split(';').map(s=>s.trim()).filter(Boolean);
await sql.transaction(statements.map(statement=>sql.query(statement)));
console.log('Nexa PostgreSQL schema is ready. No existing records were changed.');
