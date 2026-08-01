# Phase 2-2 — Badge Writer Authority SSOT

**Status:** PASS (2026-08-01)  
**Authority:** `domain_badge_writer_ssot_v1`  
**Code:** `lib/notifications/badge-writer-authority.ts`  
**Runtime:** `.qa-logs/badge-ssot-phase2/writer-authority-runtime.json`

## Locked pipeline

```
RoomUnread facts
  → Builder + Explain Matrix
  → Projection Authority COMPLETE
  → applyNotificationBadgeProjection   ← THE client Authority commit
       → App Icon surface store
       → Bottom / Trade / Customer / Owner hub axes
       → NativeBadgeSync / FCM / APNS (echo appIconTotal)
```

Bootstrap / Realtime / Poll / Reconnect / Cold Start / Foreground may **trigger** rebuild.  
They must **not** invent a second Authority Writer.

## Surface Writer Inventory (required report)

| Surface | Writer Count (Authority) | Primary Writer | Bootstrap | Realtime | Poll | Secondary / Emitter | Legacy | Fallback |
|---------|--------------------------|----------------|-----------|----------|------|---------------------|--------|----------|
| App Icon | **1** | `publishDomainAppIconCompleteSnapshot` via Apply | badge-count COMPLETE | room-fact → Apply | dirty/resync → Apply | Native/FCM/APNS echo | split shell/missed publish (banned product) | — |
| Bottom | **1** | `applyMessengerBottomChatUnread` via optimistic Apply | same Apply | same | same | — | Hub absolute CM (deleted; no revive) | — |
| Trade | **1** | hub `chatUnread` ← tradeHub via optimistic Apply | same | same | Hub GET **preserves** axis | — | — | — |
| Customer | **1** | hub `buyerOrderAttention` via optimistic Apply | same | same | Hub GET preserves | — | — | — |
| Owner | **1** | hub `storeOrderOwnerUnreadRooms` via optimistic Apply | same | same | Hub GET preserves | FAB `storeOrderChatUnread` = store-scoped **shell** (Hub) | — | — |
| Native Badge | **1** | `appIconTotal` surface store | NativeBadgeSync | subscribe | subscribe | Cap `Badge.set` echo | — | logout clear → 0 |
| Launcher Badge | **1** | same `appIconTotal` | Cap/push | Cap | Cap | OEM Cap + FCM setNumber (2-4 identity) | — | — |
| FCM badge_count | **1** | dispatcher ← Domain `appIconTotal` | push | — | — | Android `setNumber` echo | — | — |
| APNS badge | **1** | `aps.badge` ← Domain `appIconTotal` | push | — | — | — | — | — |

## PASS criteria (met)

| Criterion | Result |
|-----------|--------|
| Writer Authority PASS | PASS |
| Projection bypass 0 | PASS (static product call-site scan) |
| Duplicate Authority Writer 0 | PASS |
| Explain Matrix == Projection | PASS (Runtime ×3 × triggers) |
| Runtime Writer conflict 0 | PASS |

## Explicitly not done (forbidden / later)

- Bell / Notification Event
- Lifecycle (Phase 2-3)
- Native Badge **implementation** change (Phase 2-4)
- Legacy / Dead Writer **delete** (Phase 4)
- Heal / Product PASS / LOCK
