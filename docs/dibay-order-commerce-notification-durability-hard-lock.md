# DIBAY Order/Commerce Notification Durability — HARD LOCK (SR-1 P2)

**ACTIVE.** Cursor: `.cursor/rules/dibay-order-commerce-notification-durability-hard-lock.mdc`  
Evidence: `.tmp/notification-sr1-class-c/FINAL_CLOSE.json`

## OWNER POLICY

**P2 — Durable inbox + recoverable push handoff**

| Layer | Contract |
|---|---|
| INBOX | DURABLE (`notification_events`) |
| PUSH INTENT | DURABLE (same row + handoff columns) |
| PUSH HANDOFF | RECOVERABLE / IDEMPOTENT (claim cron) |
| PROVIDER ACCEPTANCE | RECORDED (`notification_deliveries` audit) |
| DEVICE DISPLAY | **NOT GUARANTEED** |

## FINAL AUTHORITY

| | |
|---|---|
| HEAD / ORIGIN / PRODUCTION | `b3eecb8ee89349b6b67f6fdcad377022253ab8ac` |
| DEPLOYMENT | `dpl_6rN7aY3hByR2xmqhfFMXRYh7kfCX` |
| STATUS | Ready |
| ALIAS | `https://samarket.vercel.app` |
| DB | migration `20270324120000_commerce_notification_push_handoff.sql` applied |

## Locked mechanism

1. Commerce `appendUserNotification` → `createAndDispatch(..., { deferPush: true })` + `push_handoff_status=pending`
2. Hot paths **await** notify (payment / status) so intent lands before response when process lives
3. W1 reconcile: `store_order_events` → existing notify helpers (dedupe-safe)
4. Retry owner: `/api/cron/commerce-notification-push-handoff` (vercel `*/2`)
5. Claim RPC: `claim_commerce_notification_push_handoff` (SKIP LOCKED)
6. No new outbox table; `notification_deliveries` remains audit-only

## Failure windows (closed)

| Window | Close |
|---|---|
| W1 | RECOVERABLE_BY_RECONCILIATION (+ await intent) |
| W2a | insert failure rare; reconcile recreates intent |
| W2b | pending row + cron claim |
| W3 transient | retryable + backoff (max 8) |
| W4 | existing `user_id+dedupe_key` UNIQUE |

## DO NOT

- Claim device display guarantee
- Wire `notifyBuyerStoreOrderAutoCompleted`
- New parallel outbox SSOT
- Touch Page Nav / CD-1 / CD-2 / Call functional

## Change gate

Commerce notify / handoff columns / this cron → regression-only. Reopen only on Owner PRODUCT FAIL + first divergence.
