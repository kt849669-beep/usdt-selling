# Nexa P2P — local prototype

Independent-brand, Binance-inspired USDT/INR marketplace with user and admin workspaces. Not affiliated with Binance. This is not a real cryptocurrency exchange or custody service.

## Open locally

- User registration: http://127.0.0.1:5173/register
- User login: http://127.0.0.1:5173/login
- Marketplace: http://127.0.0.1:5173/
- Admin listings: http://127.0.0.1:5173/admin/offers
- Admin orders: http://127.0.0.1:5173/admin/orders
- Admin settings: http://127.0.0.1:5173/admin/settings

These URLs work on this computer while the server runs. Use `start-local.ps1` to restart it. Nothing was publicly registered or deployed; RS Wallet remains separate and untouched.

## User accounts

New users register a name, email (including Gmail), 10-digit mobile number and a **separate Nexa password** of 15–128 characters, then log in with email/password. Never enter a Google/Gmail account password.

Accounts persist in local D1. Passwords use salted scrypt (N=32768, r=8, p=3); no plaintext passwords or hashes appear in user/admin API responses, reports or exports. Registration and login are throttled in D1. Sessions use HttpOnly, SameSite=Strict cookies. The user session is separate from the admin session. Logout invalidates the session.

New accounts start with zero USDT. Email/mobile ownership and KYC are **not verified**. Registration does not claim otherwise. No real password-recovery email, email verification, mobile OTP or 2FA service is connected.

The old one-click user personas are no longer accepted. Existing historical records remain archived in the database. Admin is still **one-click local demo access**, not production authentication. Do not expose it to the internet or use it for real customer funds.

## Admin listings

1. Open Admin → P2P listings → Create listing.
2. Enter an advertiser name, rate (for example ₹96 or ₹98), and test-USDT inventory.
3. Choose Users buy / Users sell. All new listings use UPI and the fixed ₹5,000–₹30,000 INR order range.
4. Publish; the user marketplace refreshes automatically (2.5-second polling and on focus).
5. Edit name, rate, quantity or direction; pause/activate any listing.

Only admin-published listings appear in the user app. Old seeded merchant ads are not shown there. Users cannot create ads. Listings are clearly labelled admin-published, not independent verified merchants with fabricated reputations. Each listing's inventory is local test data, not proof of real reserves.

The server enforces limits and rate quotes. A changed rate requires reconfirmation; existing orders keep their price/quantity. Safe request IDs avoid duplicate order reservations. Admin can also create an awaiting-payment order for a registered user; this does not credit their balance.

## DivinePay adapter — disabled until configured

Implements the **user-supplied** contract:

- Create: POST `https://divinepay.us.cc/api/payin/payin/create`, body `{amount}`.
- Submit UTR: POST `/api/payin/submit-utr`, body `{order_id, utr}`.
- Status: POST `/api/payin/status`, body `{order_id}`.
- `x-api-key` stays server-side.
- Only HTTPS checkout origin `https://cashiernew.blue-pay.vip` and the expected mobile route are accepted.
- Upstream redirects are rejected; timeouts or ambiguous create results are recorded as unknown and never automatically retried.
- UTR submission alone is not settlement. Status checks require the stored order ID and exact expected amount.
- In-flight/unknown gateway payments cannot be casually cancelled or expired; they require provider reconciliation.
- No supplied API key exists. `sk_live_xxx` is only a placeholder. No real payment request was made during development.

The Buy form creates a local order, then opens the returned hosted checkout **only when server configuration enables it**. Otherwise it shows the saved order with an explicit unconfigured state and no generated QR/link. The gateway hosts its own QR; this app does not fabricate one.

For provider-approved sandbox testing, copy `gateway.env.example` to the ignored `.dev.vars`, configure `DIVINEPAY_API_KEY`, explicitly enable `NEXA_ENABLE_GATEWAY_CHECKOUT`, and restart the local preview. Never put a live key in chat, client code, VITE_/NEXT_PUBLIC_ variables, admin forms or Git. No secrets file was created by this update.

**Wallet credit is deliberately disabled, even when the provider reports success.** The supplied status schema omits currency/settlement-unit guarantees, and no real USDT custody, reconciliation or production security is connected. A successful response enters review, not a completed/credited trade. Before real payments, obtain a verified provider contract/test credentials, validate currency/amount units, implement exactly-once settlement and real asset backing, and replace demo admin authentication. Do not collect real money with this prototype.

## Data and architecture

- Vinext/React, Cloudflare Worker, local D1.
- `demo_state`: bounded test marketplace state with atomic optimistic compare-and-swap.
- `local_accounts`: separate authentication records, never returned to the admin.
- `demo_sessions`, `auth_limits`: session and throttling records.
- Integer paise for INR; integer micro-units for USDT.
- Only unpaid, non-gateway orders (or definitively failed gateway orders) expire. Expiry happens on reads.
- Simulated payment/release and free wallet-funding actions are blocked for new accounts/orders.
- API rejects non-loopback hosts and cross-origin writes.
- Browser navigation, statuses, reports, profile and order chat remain available.

## Verification and development

Dependencies are already installed. This host needs the sibling x64 Node runtime; the Windows npm shim used by the standard Sites helper fails here. The build uses the same package script through npm's JavaScript entry point.

Applied local migrations (do not replay):
- `drizzle/0000_late_ben_grimm.sql`
- `drizzle/0001_confused_raza.sql`

Checks:
- `tsc --noEmit`
- `node scripts/check-registered-market.mjs`: registers labelled test accounts, checks auth/listing visibility/limits/rate snapshots/isolation/payment gates; pauses test listings, restricts test accounts and cancels test orders.
- `node --experimental-transform-types scripts/check-divinepay.mjs`: mocked provider contract/URL/amount/id/retry checks, **zero real payment calls**.
- Older `check-demo.mjs` and `check-admin-orders.mjs` target the retired one-click-persona workflow and are historical, not current regression tests.

The local database under `.wrangler/state` is ignored and persists across restarts. No browser interaction/visual QA or real-provider checkout was performed for this update.
