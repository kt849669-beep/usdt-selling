# Public prototype

## Vercel migration preparation

The source now includes a light theme, uncluttered user login, PostgreSQL adapter and separate password-protected Vercel admin login. Building source is not proof of a live deployment. Before cutover, connect Neon, run the schema migration, configure the exact production origin and admin password hash, securely migrate existing hosted records if required, then verify the published app. No database export or secret is included in this repository.

The notes below describe the **retained Sites deployment**, not Vercel administrator authentication.

Customer experience: admin-published USDT sellers, Buy-only purchases with seller-fixed INR rates and INR 5,000–30,000 outer limits, account registration, referral attribution, and personal order history. No Binance reference rate or discount is displayed.

Real payments, wallet credit and blockchain transfers are disabled. The transfer section is an unavailable preview, not a custody service. Referral codes record signup attribution only; no reward program is configured.

Hosted administrator access uses Sites sign-in and an explicit server-side `NEXA_ADMIN_EMAIL` allowlist. A missing email locks all admin pages and APIs. Public signup never grants administrator privileges. Local one-click admin sessions are ignored by hosted requests. Configure the authorized email through Sites before deploying an environment update to enable staff access.

Hosted D1 starts fresh with only the public seller configurations for tiger and aman usdt seller. Local customers, passwords, sessions, sample trades and balances are not migrated. Password hashes remain separate from all user/admin JSON and report exports.

Verification: 73 focused account, referral, buy-only marketplace, order-isolation and payment-gate checks passed locally. Test accounts were restricted, test listings paused and test purchases cancelled. Public access must be verified separately after publishing.
