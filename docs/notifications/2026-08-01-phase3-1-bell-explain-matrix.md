# Phase 3-1 — Bell Explain Matrix

**Status:** PASS (2026-08-01)  
**Authority:** `bell_explain_v1`  
**Code:** `lib/notifications/bell-explain-matrix.ts`  
**Loader:** `lib/notifications/load-bell-explain-unread-events.ts`  
**Runtime:** `.qa-logs/badge-ssot-phase3/bell-explain-matrix-runtime.json`

## Locked formula

```text
bellTotal
  = |generalMessage|
  + |groupMessage|
  + |tradeMessage|
  + |customerOrder|      (store_order_message · customer)
  + |ownerOrder|         (store_order_message · owner)
  + |tradeStatus|
  + |orderStatus|        (customer/owner order_status + delivery_status)
  + |missedCall|
  + |systemAdmin|        (admin_notice + community_activity / system)
```

Each part = `{ count, eventIds[] }` with `count === eventIds.length`.  
Presentation classifier: `resolveBellPresentationType` (Inbox SSOT).

## Runtime sample (asas55)

| Kind | Count |
|------|------:|
| Bell total | **2** |
| General Message | 2 |
| Group / Trade / Orders / Status / Missed / System | 0 |

`bellTotal === explain.total === 2` · Badge neighbor App Icon 32 untouched.

## Wired

`buildDomainBadgeAuthorityHttpPayload.bellExplainMatrix` — **additive**. Does not change Badge Projection / Writer / Native.

## Forbidden (still)

Badge reopen · RoomUnread · Heal · Legacy delete · digit hacks · Product PASS / LOCK

## Next

Phase 3-2 Writer Authority (explicit start only)
