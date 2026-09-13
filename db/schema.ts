import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const demoState=sqliteTable('demo_state',{id:integer('id').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull()});
export const demoSessions=sqliteTable('demo_sessions',{token:text('token').primaryKey(),identity:text('identity').notNull(),expires:integer('expires').notNull()},t=>[index('idx_demo_sessions_expires').on(t.expires)]);
export const localAccounts=sqliteTable('local_accounts',{
 id:text('id').primaryKey(), name:text('name').notNull(), email:text('email').notNull().unique(),
 mobile:text('mobile').notNull().unique(), passwordHash:text('password_hash').notNull(), created:integer('created').notNull(), referredBy:text('referred_by'),
});
export const authLimits=sqliteTable('auth_limits',{
 key:text('key').primaryKey(), attempts:integer('attempts').notNull(), expires:integer('expires').notNull(),
},t=>[index('idx_auth_limits_expires').on(t.expires)]);
