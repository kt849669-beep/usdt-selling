# Private account storage

User and administrator passwords use salted scrypt, not reversible encryption.
Application private data uses AES-256-GCM, fresh 96-bit nonces, 128-bit tags and
record-specific authenticated context. Encryption and HMAC lookup keys are
independent 32-byte server-only secrets, stored outside Git and the database.

To preserve existing tables and unique indexes, `local_accounts.name` holds an
encrypted JSON bundle containing name, email and mobile. The email/mobile
columns contain field-separated HMAC-SHA256 blind indexes. The full
`demo_state.data` document is encrypted too, including duplicate profile fields,
order messages and admin records. Authorized requests decrypt on the server.
User IDs and timestamps are not secrets and remain available for joins.

Deployment: configure `NEXA_DATA_ENCRYPTION_KEY` and `NEXA_DATA_LOOKUP_KEY` as
64-character random hex secrets, deploy, then run the bounded
`scripts/encrypt-existing-records.mjs --apply` with those same secrets and the
database environment. The script validates decryption and uses conditional
updates. Existing passwords, IDs, orders, referrals and balances are preserved.
Do not reapply or rewrite the initial SQL migration for this change.

Keep both keys in a secure backup. Do not simply replace them: encryption-key
rotation requires decrypting with the old key and re-encrypting with the new
one; lookup-key rotation also requires reindexing all accounts. Missing or
incorrect keys fail closed. Legacy plaintext reads are supported only to allow
conversion. Provider backups may retain older plaintext according to their
retention policy. Encryption does not protect against a compromised authorized
application server or administrator.

Real checkout, wallet credit and withdrawals remain disabled: current seller
inventory is simulated, not funded USDT custody. An API key or an administrator
click is not evidence of delivery or a blockchain transfer.
