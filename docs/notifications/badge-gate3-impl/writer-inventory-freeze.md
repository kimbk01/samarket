# Gate 3 — Writer Inventory Freeze (HEAD `f438f37e2`)

**Frozen at:** 2026-08-03 Gate 3 start  
**Rule:** Track delete/remain counts during rebuild. Do not add writers without inventory update.

---

## Summary counts (logical writers)

| Surface | Logical writer groups (HEAD) | Notes |
|---------|------------------------------|-------|
| **Bell digit** | **5** | events A projection · badge-count HTTP · badge store apply · RT/poll resync · (legacy not in digit but mark-all dual) |
| **Bell list** | **2** | GET `/api/me/notifications` · client A filter |
| **Bell mark-all** | **2** | legacy `notifications` · `notification_events` |
| **App Icon** | **6** | Domain projection · surface store · NativeBadgeSync · Cap Badge.set · Delivery Adapter · FCM badge_count echo · **+ Cap resume re-echo** |
| **Bottom Chat** | **3** | Domain bottomChat · messenger-bottom store · optimistic RT list |
| **Trade Hub** | **2** | Domain tradeHub · hub store optimistic |
| **Order Hub** | **2** | Domain customer rooms · hub store |
| **Owner** | **4** | C RPC/state · B_store room count · hub snapshot/cache · owner_intake user_id events (contaminant) |

---

## Bell writers (detail) — freeze = 5 digit paths + dual mark-all

| # | Writer | Path | Keep aim |
|---|--------|------|----------|
| B1 | A projection digit (`attentionKeys`) | `member-notification-a-projection.ts` | **REPLACE** → event-id A |
| B2 | badge-count HTTP total | `build-domain-badge-authority-http.ts` | KEEP shell · swap A unit |
| B3 | `notification-badge-count-store` / apply | `apply-badge-count-authority-response.ts` | KEEP apply · single A |
| B4 | RT / poll badge resync | `NotificationsBadgeRealtimeBridge` / poll | KEEP trigger · no invent |
| B5 | Header digit reader | `resolveTier1HeaderBellBadgeTotal` | KEEP · must read A only |
| M1 | mark-all legacy | `markMemberANotificationsAllRead` | **DELETE** dual-write |
| M2 | mark-all events | `markNonChatNonOwnerNotificationEventsRead` | KEEP as sole mark-all |
| L1 | list API | `GET /api/me/notifications` | KEEP · align filter to A |
| L2 | list client filter | `filterMemberNotificationAInboxRows` | REWRITE with A |
| P1 | Popup important_room | `CommunityMessengerHome` | **DELETE** as Bell authority |

**Target after Bell A:** digit/list/mark-all = **1 canonical event unread set**; popup chat authority = **0**.

---

## App Icon writers — freeze = 6 (+ resume)

| # | Writer | Path | Keep aim |
|---|--------|------|----------|
| I1 | `memberAppIconWebTotal` builder | `build-notification-badge-projection.ts` | REWRITE = A_events+B_rooms components |
| I2 | surface `appIconTotal` | `domain-badge-surface-store` | KEEP pipe |
| I3 | `NativeBadgeSync` | absolute set | KEEP display |
| I4 | Cap `Badge.set` | `sync-native-badge-count` | KEEP echo cache only |
| I5 | Delivery Adapter setNumber/setBadge | Android/iOS | KEEP absolute |
| I6 | FCM `badge_count` | `notify-push-dispatcher` | KEEP echo of App Icon |
| I7 | `applyFromCapBadgeCache` resume | AppDelegate / MainActivity | **DELETE as authority** |

---

## Bottom / Trade / Order — freeze

| Surface | Writers | Target |
|---------|---------|--------|
| Bottom | Domain `bottomChat` · bottom store · list optimistic | 1 Domain B_general+B_group subscribe |
| Trade | Domain `tradeHub` · hub optimistic | 1 Domain B_trade |
| Order | Domain customer rooms · hub | 1 Domain B_order |

---

## Owner — freeze = 4

| # | Writer | Keep aim |
|---|--------|----------|
| O1 | `store_orders` / inquiries Action Required | KEEP C_operational |
| O2 | owner SO room unread count | KEEP C_chat |
| O3 | hub snapshot / cache | KEEP read model |
| O4 | `notifyStoreOwner*` → owner user_id `owner_intake` | **DELETE/ROUTE** off member A |

---

## Forbidden adds during Gate 3

```text
UI badge++ / badge--
resume number invent
new attention-key digit path
new legacy dual-write
Native arithmetic
separate Popup Bell authority
```

---

## Tracking template (update each step)

```text
Step: ____
Bell digit writers: was 5 → now __
mark-all writers: was 2 → now __
App Icon authority writers: was 7 → now __
Owner contaminant writers: was 1 → now __
```
