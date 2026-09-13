CREATE TABLE IF NOT EXISTS demo_sessions (
 token text PRIMARY KEY,
 identity text NOT NULL,
 expires bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_expires ON demo_sessions(expires);
CREATE TABLE IF NOT EXISTS demo_state (
 id integer PRIMARY KEY,
 data text NOT NULL,
 revision integer NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_limits (
 key text PRIMARY KEY,
 attempts integer NOT NULL,
 expires bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_limits_expires ON auth_limits(expires);
CREATE TABLE IF NOT EXISTS local_accounts (
 id text PRIMARY KEY,
 name text NOT NULL,
 email text NOT NULL UNIQUE,
 mobile text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 created bigint NOT NULL,
 referred_by text
);
