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
- ~~Wire `notifyBuyerStoreOrderAutoCompleted`~~ — 2026-10-20 커밋 `5cae6ca9d`(G-1 4-E/4-F/4-H)로 연결되어 운영 중. 2026-10-27 감사 N-09: 자동확정 insert 전에 `markPriorBuyerOrderStatusNotificationsRead` 로 주문당 미읽음 1건 유지 (`docs/audit/notification-system-full-audit-2026-10-27.md`)
- New parallel outbox SSOT
- Touch Page Nav / CD-1 / CD-2 / Call functional

## Change gate

Commerce notify / handoff columns / this cron → regression-only. Reopen only on Owner PRODUCT FAIL + first divergence.

---

## Reopen 기록

- **2026-10-27 (Owner 승인: 알림 전수 감사 N-01~N-14 · 재감사 D-1~D-8 · 결함 1~6)** — 커밋 `ffea7c6d1`·`ab183b750` 이 reopen 기록 없이 이 문서를 수정했다(절차 누락). 수정 내용은 운영 증거(감사 보고서 `docs/audit/notification-system-full-audit-2026-10-27.md`)에 근거한 상태 정정이며 유지한다. 같은 날 적용한 운영 DB 마이그레이션 `20270702120000`·`20270702130000`·`20270702140000`·`20270702150000` 의 적용 기록은 `docs/audit/notification-full-reaudit-2026-10-27.md` §5 및 `docs/audit/notification-system-full-audit-2026-10-27.md` 에 있다.
