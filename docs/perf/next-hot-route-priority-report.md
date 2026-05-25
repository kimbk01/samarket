# NHR1 — Next Hot Route Priority Report

> **Track:** NHR1 (Next Hot Route Discovery & Prioritization)  
> **Generated:** 2026-05-25  
> **Command:** `npm run nhr1:discover`  
> **Routes scanned:** 244 (`app/api/**/route.ts`)

---

## Executive summary

| Item | Value |
|------|-------|
| **Recommended next priority** | **/api/me/stores/[storeId]/orders** (OOL1) |
| Structural PASS routes (skip) | 6 |
| DANGER (request-time aggregate) | 12 |
| WARNING | 17 |
| Snapshot migration candidates | 7 |

**Principle:** Optimize **request-time aggregate removal**, not slow-query tuning alone. Linked RTT ≠ structural regression.

---

## 1. Top 10 hot routes (hotness score)

| Rank | Route | Group | hotness | wall_ms | RTT | risk | snapshot | action |
|------|-------|-------|---------|---------|-----|------|----------|--------|
| 1 | `/api/community-messenger/bootstrap` | messenger | 4241 | 450 | 1 | WARNING | no | hotpath_instrument_then_snapshot |
| 2 | `/api/chat/rooms` | messenger | 3689 | 320 | 7 | DANGER | no | snapshot_first_migration |
| 3 | `/api/me/store-orders/[orderId]` | delivery | 3629 | 260 | 6 | DANGER | no | snapshot_first_migration |
| 4 | `/api/me/stores/[storeId]/orders` | delivery | 3310 | 280 | 3 | DANGER | no | snapshot_first_migration |
| 5 | `/api/me/stores/[storeId]/orders/[orderId]` | delivery | 2993 | 170 | 3 | DANGER | no | snapshot_first_migration |
| 6 | `/api/me/store-orders` | delivery | 2925 | 220 | 6 | DANGER | no | snapshot_first_migration |
| 7 | `/api/me/notifications` | notification | 2241 | 168 | 4 | SAFE | yes | none_pass_track |
| 8 | `/api/chat/rooms/[roomId]/messages` | messenger | 1955 | 260 | 4 | DANGER | no | snapshot_first_migration |
| 9 | `/api/admin/store-orders` | delivery | 1889 | 260 | 4 | DANGER | no | snapshot_first_migration |
| 10 | `/api/me/stores/[storeId]/order-chats` | owner | 1822 | 170 | 2 | WARNING | no | hotpath_instrument_then_snapshot |

---

## 2. Top structural risks (DANGER)

| Route | round_trips | aggregate | fallback | joins | sequential |
|-------|-------------|-----------|----------|-------|------------|
| `/api/chat/rooms` | 7 | 1 | 0 | 0 | 0 |
| `/api/me/store-orders/[orderId]` | 6 | 1 | 1 | 0 | 1 |
| `/api/me/stores/[storeId]/orders` | 3 | 1 | 0 | 0 | 0 |
| `/api/me/stores/[storeId]/orders/[orderId]` | 3 | 1 | 1 | 0 | 1 |
| `/api/me/store-orders` | 6 | 1 | 0 | 0 | 1 |
| `/api/chat/rooms/[roomId]/messages` | 4 | 1 | 0 | 0 | 1 |
| `/api/admin/store-orders` | 4 | 1 | 0 | 0 | 0 |
| `/api/admin/chat/rooms` | 3 | 1 | 0 | 0 | 0 |
| `/api/community/meetings/[meetingId]/invite-candidates` | 4 | 1 | 0 | 0 | 0 |
| `/api/admin/delivery-operation-alerts` | 6 | 1 | 0 | 0 | 0 |
| `/api/admin/ops-console/summary` | 6 | 1 | 0 | 0 | 1 |
| `/api/admin/delivery-release-gate` | 3 | 1 | 0 | 0 | 0 |

---

## 3. Fallback cleanup candidates (PASS tracks)

| Route | branch | log hits | can_delete gate |
|-------|--------|----------|-----------------|
| `/api/me/store-owner-hub-badge` | legacy_aggregate | 0 | await_ops1b_3_signoff |
| `/api/community-messenger/home-sync` | legacy_multi_wave | 0 | await_ops1b_3_signoff |
| `/api/community-messenger/rooms/[roomId]/bootstrap` | legacy_wave_a | 2 | fallback_used_in_logs |
| `/api/stores/[slug]/menus` | legacy_products_popular | 4 | fallback_used_in_logs |
| `/api/me/notifications` | segmented_unread | 1 | fallback_used_in_logs |
| `/api/me/stores/[storeId]/order-counts` | dashboard_rpc | 1 | fallback_used_in_logs |
| `/api/me/stores/[storeId]/order-counts` | legacy_25_count | 0 | await_ops1b_3_signoff |
| `/api/me/store-orders/[orderId]` | legacy_parallel | 0 | await_ops1b_3_signoff |
| `/api/me/stores/[storeId]/orders/[orderId]` | legacy_parallel | 0 | await_ops1b_3_signoff |

---

## 4. Request-time aggregate remaining (GET, non-PASS)

| Route | waves | perf tagged | est. wall |
|-------|-------|-------------|-----------|
| `/api/community-messenger/bootstrap` | 1 | yes | ~450ms |
| `/api/chat/rooms` | 4 | no | ~320ms |
| `/api/me/store-orders/[orderId]` | 2 | no | ~260ms |
| `/api/me/stores/[storeId]/orders` | 2 | no | ~280ms |
| `/api/me/stores/[storeId]/orders/[orderId]` | 1 | no | ~170ms |
| `/api/me/store-orders` | 2 | no | ~220ms |
| `/api/chat/rooms/[roomId]/messages` | 2 | no | ~260ms |
| `/api/admin/store-orders` | 2 | no | ~260ms |
| `/api/me/stores/[storeId]/order-chats` | 1 | no | ~170ms |
| `/api/admin/chat/rooms` | 1 | no | ~170ms |
| `/api/community/meetings/[meetingId]/invite-candidates` | 2 | no | ~260ms |
| `/api/stores/products/[productId]` | 1 | no | ~170ms |
| `/api/cron/store-order-accept-reminders` | 0 | no | ~120ms |
| `/api/community-messenger/rooms/[roomId]` | 0 | no | ~80ms |
| `/api/stores/[slug]/reviews` | 0 | no | ~80ms |

---

## 5. Snapshot migration candidates

| Priority | Route | reason | RTT reduction est. | UI impact |
|----------|-------|--------|-------------------|-----------|
| 1 | `/api/me/stores/[storeId]/orders` | request_time_aggregate · multi_rtt_waves | ~302ms | high |
| 2 | `/api/chat/rooms` | request_time_aggregate · multi_rtt_waves | ~630ms | high |
| 3 | `/api/me/store-orders` | request_time_aggregate · multi_rtt_waves | ~528ms | high |
| 4 | `/api/me/store-orders/[orderId]` | request_time_aggregate · legacy_fallback_present · multi_rtt_waves | ~537ms | high |
| 5 | `/api/me/stores/[storeId]/orders/[orderId]` | request_time_aggregate · legacy_fallback_present · multi_rtt_waves | ~278ms | high |
| 6 | `/api/chat/rooms/[roomId]/messages` | request_time_aggregate · multi_rtt_waves | ~377ms | high |
| 7 | `/api/community/meetings/[meetingId]/invite-candidates` | request_time_aggregate · multi_rtt_waves | ~377ms | low |

---

## 6. Realtime / cross-tab risk routes

| Route | group | risk | note |
|-------|-------|------|------|
| `/api/community-messenger/bootstrap` | messenger | WARNING | MRC1 separate — aggregate read path |
| `/api/chat/rooms` | messenger | DANGER | MRC1 separate — aggregate read path |
| `/api/chat/rooms/[roomId]/messages` | messenger | DANGER | MRC1 separate — aggregate read path |
| `/api/admin/chat/rooms` | messenger | DANGER | MRC1 separate — aggregate read path |
| `/api/community-messenger/rooms/[roomId]` | messenger | WARNING | MRC1 separate — aggregate read path |

---

## 7. Long-session global analysis

_No `[long-session-stability]` logs in terminals — enable `NEXT_PUBLIC_SAMARKET_OPS1_MONITOR=1` during 30min session._

---

## 8. Recommended next priority (NHR1 verdict)

**Route:** `/api/me/stores/[storeId]/orders`

**Rationale:** request_time_aggregate · multi_rtt_waves

**Do not touch:** HUB BADGE · HS2 · RB1 · SM1 · ODN1 · DSA1 · MRC1 (Structural PASS)

**After migration pattern:** unified RPC · counter row · event refresh · regression lock · verify e2e (copy SM1/ODN1 template)

---

## NHR1 PASS checklist

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Full hot route analysis | ✓ 244 routes |
| 2 | hotness score computed | ✓ |
| 3 | fallback global audit | ✓ |
| 4 | long-session analysis | ▲ probe wired, no prod session log |
| 5 | snapshot candidates | ✓ 7 |
| 6 | this report | ✓ |
| 7 | next priority route | ✓ `/api/me/stores/[storeId]/orders` |

---

## Re-run

```bash
npm run nhr1:discover
```
