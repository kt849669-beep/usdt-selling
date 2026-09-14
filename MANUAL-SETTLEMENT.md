# Manual USDT delivery — TRC20

This app does not sign or send blockchain transactions. The operator manually delivers genuine USDT from its own funded TRON wallet. Historical sample/listing balances are never converted into customer holdings.

## Before collecting payments

1. Keep `DIVINEPAY_API_KEY` in server-only deployment settings. Never put keys in frontend code or messages. Rotate any previously exposed key.
2. In Admin → Settings, enter the public sending-wallet address, actual delivery time, refund/delayed-delivery policy and customer support contact. Only enter a public address — never a seed phrase or private key.
3. Fund that wallet with genuine TRC20 USDT and the TRON resources needed to send it. Saving setup performs a read-only reserve check. This is a point-in-time balance, not proof of wallet control or a custody guarantee.
4. Only after setup is complete, set the server deployment variable `NEXA_ENABLE_GATEWAY_CHECKOUT=true` and redeploy. Setting it to `false` pauses new payments but does not prevent processing already-paid eligible orders or withdrawals.

Each purchase requires customer acceptance of delivery terms. The server checks reserves against outstanding customer balances and unresolved eligible payments before creating a hosted checkout. A failed or uncertain provider response never triggers an automatic replacement payment.

## Approve a purchase

Open Admin → Orders, inspect the existing payment in DivinePay, add a review note, and select **Verify payment & approve USDT**. The backend independently checks the same provider order ID, successful status and exact INR amount, then rechecks USDT reserves. Credit occurs exactly once. A redirect, screenshot, UTR submission, or admin click alone is not payment proof.

## Complete a withdrawal

1. The customer requests an amount and confirms a TRC20 receiving address. The amount moves from available to locked; the total does not change yet.
2. In Admin → Withdrawals, select **Start manual transfer**. Cancellation is disabled from this point to prevent a duplicate payout.
3. Check the sending wallet history, then manually send the exact requested amount on TRC20 to the displayed recipient. The app does not send it.
4. Record the existing 64-character transaction ID and select **Verify on TRON & complete**. The server checks a solidified successful receipt for the official USDT contract, matching sending address, recipient, amount and request time. It then deducts the locked amount exactly once.

Do not send a replacement if verification is pending/unavailable. A recorded transaction ID cannot be silently replaced or reused for another withdrawal. Mistyped or failed transfers require operator reconciliation; do not clear locked funds merely to make the UI show success.

Optional server-only `TRONGRID_API_KEY` supports read-only TRON queries. Node outages/rate limits pause verification instead of assuming success.

## Existing uncertain payments

Legacy orders without a funded manual-delivery checkout cannot be credited under this flow. Reconcile them with the payment provider using their existing order reference. Never reset an uncertain attempt, collect again, or convert an old simulated balance into real USDT.

## Verification performed

Offline tests mock all gateway and TRON responses; they do not create live pay-ins or transfer funds. Production deployment checks should be read-only. A real end-to-end purchase and payout require the operator's funded wallet and deliberate customer/admin actions.

Implementation references: [Tether supported protocols](https://tether.to/en/supported-protocols/), [TRON confirmed transaction receipt](https://developers.tron.network/reference/gettransactioninfobyid-1), [TRON event format](https://developers.tron.network/docs/event).
