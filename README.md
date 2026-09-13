# Nexa P2P

Buy-only USDT/INR application with separate customer and administrator workspaces. Light surfaces, charcoal accents, mobile navigation, account registration, referral attribution, seller listings, and order records.

**This is a prototype, not a real cryptocurrency exchange or custody service. Real wallet credit and blockchain withdrawals remain disabled. Do not collect real money with this app.**

## Deployment targets

- **Vercel:** Next.js with Neon PostgreSQL. Configuration: `vercel.json`.
- **Existing Sites deployment:** Vinext with managed D1 and Sites administrator identity. The original build remains available; it is not a proxy for Vercel.

### Vercel setup

1. Connect this repository to your Vercel project. The included settings use `npm run build:vercel`.
2. Connect a Neon **free** database. Store `DATABASE_URL` as a server-only environment variable. Never commit its connection string.
3. Run `npm run db:migrate:vercel` with `DATABASE_URL` configured. Schema creation is a separate explicit deployment step, not a request-time action.
4. Set `NEXA_PUBLIC_ORIGIN` to the exact HTTPS production origin.
5. Set `NEXA_ADMIN_EMAIL` and `NEXA_ADMIN_PASSWORD_HASH`. The hash format is `scrypt:32768:8:3:<16-byte hex salt>:<32-byte hex hash>`. Never place a plaintext admin password in source.
6. Set `NEXA_REGISTRATION_CODE` to `NX` followed by 16 random uppercase hexadecimal characters. The reusable shared code is visible only in the authenticated administrator workspace.
7. Keep `NEXA_ENABLE_GATEWAY_CHECKOUT=false`. No payment secret is included.

For local Next.js testing use `npm run dev:vercel -- --port 3000`. For the retained Sites/D1 development environment use `npm run dev`. Both share UI and domain logic, but have separate persistence and administrator authentication.

## Routes

- `/`: Buy marketplace; only published admin seller listings.
- `/register`, `/login`: user registration and sign-in. The user login has no admin link.
- `/orders`, `/wallet`, `/profile`: customer account.
- `/admin/login`: Vercel administrator email/password sign-in.
- `/admin`, `/admin/users`, `/admin/offers`, `/admin/orders`, `/admin/reports`, `/admin/settings`, `/admin/profile`: staff workspace.

## Authentication and data

Customers use an app-specific password (15–128 characters), never a Gmail/Google password. Passwords use salted scrypt and are not exposed in customer/admin APIs or reports. Signup does not verify email/mobile ownership or confer admin rights.

Vercel admin authentication uses independently configured server-side credentials, durable throttling, and separate random HttpOnly session cookies. Untrusted Sites identity headers and local one-click admin personas are rejected. Changing admin email/hash invalidates existing Vercel admin sessions.

PostgreSQL stores account, session, throttle and marketplace records. Multi-statement writes use transactions; marketplace updates retain optimistic compare-and-swap revisions. Local/browser storage is not the authoritative database.

A new database has no transferred customer data. The initial seed contains only the two existing public test seller configurations. **Existing hosted accounts/orders require a separate secure database migration before cutover; no private database exports belong in Git.** The original deployment is not modified by creating a new target.

## Buying and referrals

Admins register sellers and set INR prices, names, inventory and limits. Customers can only buy, with outer INR limits of ₹5,000–₹30,000. Seller listing changes appear through periodic refresh. Purchase quotes are checked server-side and stored at order time. No Binance reference price or fabricated discount is used.

New registration requires a valid referral code on both the form and server. Administrators can share one reusable registration code/link from Customers & sellers or Admin profile. Existing user referral codes still work and retain signup attribution. Existing account login is unchanged. A referral reward program is not configured.

## Payment and wallet limitations

The server-side DivinePay adapter implements the contract supplied by the app owner. Provider keys are never returned to the client. Order identifiers, UTR format, checkout origin and expected amounts are validated.

Checkout remains off by default. Adding a key does **not** turn this into a functioning exchange: successful provider status goes to review, never to automatically credited real USDT. Settlement, real asset custody, withdrawals, compliance and production security are not implemented.

The wallet address field is transient UI state only. Paste requires a user click. The Withdraw button is disabled, sends no request and does not store the address. These limitations remain visible in the trading/wallet UI even though unnecessary demo wording was removed from the login page.

## Verification

- `npm run build:vercel`: production Next.js build.
- `npm run build`: retained Sites Worker build.
- `npx tsc --noEmit`: TypeScript checks.
- `node scripts/check-vercel-runtime.mjs`: offline PostgreSQL-adapter, admin-authentication and request-origin checks. Not a substitute for testing the connected database.
- `scripts/check-registered-market.mjs`: local D1 account/marketplace test suite; creates labelled test records. Do not run it on production.
- `scripts/check-divinepay.mjs`: provider contract tests using mocks, not live payments.

Never commit `.env*`, `.dev.vars*`, database files, access tokens, payment keys, deployment credentials, or private customer records.
