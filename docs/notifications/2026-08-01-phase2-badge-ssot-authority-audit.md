# Phase 2 Step 1 — Badge Authority Audit (Read-only)

**Date:** 2026-08-01  
**Status:** AUDIT COMPLETE — IMPLEMENTATION NOT STARTED  
**Phase 1:** ROOM UNREAD AUTHORITY CLOSED (do not modify)  
**Forbidden this step:** Bell rewrite · Notification Event rewrite · RoomUnread · Legacy delete · Heal · code implementation

This document **fixes product criteria** for Phase 2. It does not invent a new architecture; it freezes what DIBAY already intends and what the code currently does, plus **gaps** that implementation must close for **BADGE SSOT COMPLETE + Explain Matrix**.

Canonical prior LOCK (still valid for units):  
`docs/community-messenger/2026-07-31-badge-authority-map-lock.md`  
`docs/notifications/dibay-notification-surface-authority-product-lock.md`

---

## 0. Phase 2 product target (fixed)

| Surface | Must equal | Unit |
|---------|------------|------|
| **App Icon** | General + Group + Trade + Customer Order + Owner Order + Missed Call (orphan) | unread **rooms** (+ orphan missed events) |
| **Bottom Chat** | General + Group | unread **rooms** |
| **Trade Hub** | Trade | unread **rooms** |
| **Customer Order Hub** | Customer Order | unread **rooms** |
| **Owner Order Hub / FAB order-chat** | Owner Order (store-scoped on FAB) | unread **rooms** |
| **Native / Launcher / FCM / APNS** | **same** as App Icon (`appIconTotal`) | same |
| **List row** | that room’s message unread | **messages** (not equal to hub digit) |
| **Bell** | out of Phase 2 scope (Phase 3) | events |

**Fact SSOT (Phase 1 closed):** `community_messenger_participants.unread_count` + cursor authority (Room Unread).  
**Badge must not invent a second unread writer.** Badge only **projects** room sets where `unread_count > 0` (active, non-phantom).

---

## 1. Badge Authority Map (product)

```
Room Unread Authority (CLOSED)
  participant.unread_count + leave intervals + mark-read
       │
       ▼
Domain Fact Loaders (read-only consumers)
  loadMessengerUnreadRoomFactsFromParticipants     → GD / Group room ID sets
  loadTradeStoreOrderUnreadRoomFactsFromParticipants → Trade / Customer / Owner ID sets
  loadOrphanMissedCallFacts                        → orphan missed_call
       │
       ▼
buildNotificationBadgeProjection  (single Builder — pure)
       │
       ▼
Projection Authority COMPLETE → applyNotificationBadgeProjection
       ├─ domain-badge-surface-store.appIconTotal → NativeBadgeSync / Cap Badge.set
       ├─ messenger-bottom-chat-unread-projection → Bottom Chat
       ├─ owner-hub-badge-store axes → Trade / Customer / Owner aggregate
       │     (FAB storeOrderChatUnread preserved from Hub GET — store-scoped)
       └─ FCM badgeCount / APNS aps.badge = appIconTotal  (push path)
```

### Surface → Authority formula

| Surface | Formula (Explainable) |
|---------|------------------------|
| App Icon | `\|GD\| + \|Group\| + \|Trade\| + \|Customer SO\| + \|Owner SO\| + orphanMissed` |
| Bottom | `\|GD\| + \|Group\|` |
| Trade Hub | `\|Trade\|` |
| Customer Hub | `\|Customer SO\|` |
| Owner Hub / FAB chat | `\|Owner SO\|` (FAB: intersect current `storeId`) |
| Native / Launcher / FCM / APNS | `App Icon` |

**DO NOT:** Bell total → App Icon · App Icon → Bottom · Trade rooms in Bottom · Customer+Owner double-count same room · status/admin event SUM into App Icon.

---

## 2. Badge Surface Inventory (as-is code)

| # | Surface | Primary UI / path | Display | Current source | Domains |
|---|---------|-------------------|---------|----------------|---------|
| 1 | App Icon (runtime) | `NativeBadgeSync` → Capawesome `Badge.set` | `appIconTotal` | `domain-badge-surface-store` ← Domain Apply | GD+Group+Trade+SO buyer+SO owner+orphan missed |
| 2 | Android Launcher / tray | Cap Badge + `DibayFirebaseMessagingService.setNumber` | same | Cap / FCM `badgeCount` | same as App Icon |
| 3 | iOS Badge | Cap Badge + APNS `aps.badge` | same | Cap / APNS | same |
| 4 | FCM `badge_count` | `notify-push-dispatcher` | `appIconTotal` | Domain payload force rebuild | same |
| 5 | APNS badge | `apns-sender-impl` | `appIconTotal` | same | same |
| 6 | Bottom Chat | `BottomNav` + messenger bottom projection | room count | Domain Apply only | **GD+Group only** |
| 7 | Trade Hub | `MessengerPillarSummaryRow` trade | room count | Hub `chatUnread` ← Domain `tradeHub` | **trade** |
| 8 | Trade List row | `MessengerChatListItem` / domain canary | **message** unread | participant / bootstrap | trade |
| 9 | Customer Order Hub | delivery pillar | room count | `buyerOrderAttention` / domain customer cache | **SO customer** |
| 10 | Customer Order List row | domain customer list / delivery rows | message unread | participant | SO customer |
| 11 | Owner FAB — order chat | `useOwnerFabOrderChatBadgeCount` | store-scoped rooms | Hub GET `storeOrderChatUnread` | **SO owner @ store** |
| 12 | Owner FAB — orders / store ops | same sector | commerce attention | Hub targets (non-chat) | **not Room Unread** — see Gap G3 |
| 13 | Owner Order Hub / List | order-chats shell / `OwnerStoreOrderChatsView` | rooms / row messages | Hub + order-chats API | SO owner |
| 14 | All chat list badges | CM / domain list items | message unread | participant.unread_count | by room domain |
| 15 | Header Bell | Philife header | event total | **Bell store** | Phase 3 — **do not change in P2** |
| 16 | Phase H App Icon mirror | `app-icon-badge-projection` | mirror | Apply | contract only — Native must not read |

### Inventory notes

- Bottom Trade/Community/Stores **tab digits** are locked **0** (feed only).
- List row unit ≠ Hub/App Icon unit (messages vs rooms) — intentional; Explain Matrix uses **room ID sets** for hubs/App Icon.
- Web: no launcher badge; UI hubs only.

---

## 3. Badge Writer Inventory (as-is)

### 3.1 Primary (must remain single pipeline)

| Writer | Path | Surfaces | Trigger | Class |
|--------|------|----------|---------|-------|
| Fact loaders | `load-*-unread-room-facts-from-participants.ts`, orphan missed | Facts for Builder | badge-count / ACK / push | **Primary facts (read)** |
| Builder | `build-notification-badge-projection.ts` | pure digits | called by HTTP builder | **Primary pure** |
| Domain HTTP | `build-domain-badge-authority-http.ts` | payload + **ID sets** | GET / ACK / push | **Primary** |
| notify-badge-service cache | `notify-badge-service.ts` | cached payload | fetch / invalidate | **Primary cache** |
| badge-count route | `app/api/me/notifications/badge-count/route.ts` | client COMPLETE | boot / poll / resync | **Primary** |
| Read ACK | `domain-badge-read-ack.ts` + read routes | all Domain surfaces | mark-read APIs | **Primary** |
| Push embed | `notify-push-dispatcher.ts` | FCM/APNS badge | push send | **Primary** |
| Projection Authority | `projection-authority.ts` | gate COMPLETE / room fact | HTTP/ACK/RT | **Primary** |
| Apply | `domain-badge-authority-product-bridge.ts` `applyNotificationBadgeProjection` | Bell* / App Icon / Bottom / Hub axes | Authority only | **Primary apply** |
| App Icon store | `domain-badge-surface-store.ts` | `appIconTotal` | Apply | **Primary** |
| NativeBadgeSync | `NativeBadgeSync.tsx` + `sync-native-badge-count.ts` | Cap Badge | store subscribe | **Primary foreground** |
| Bottom projection | `messenger-bottom-chat-unread-projection.ts` | Bottom Chat | Domain Apply only | **Primary** |
| Hub Domain optimistic | `applyDomainAuthorityHubBadgeOptimistic` | Trade / Customer / Owner aggregate + Bottom | Apply | **Primary** |
| Hub GET (FAB shell) | `owner-hub-badge-store` + store-owner-hub-badge API | **FAB** `storeOrderChatUnread`, philife, commerce | Hub poll/fetch | **Primary FAB/shell** (must not overwrite Domain axes) |
| Logout wipe | auth epoch resets + `clearNativeBadgeCount` | all → 0 | logout | **Primary clear** |

\* Apply also patches Bell store — **Phase 2 must not change Bell policy**; treat as frozen neighbor.

### 3.2 Competing / risk writers (document, do not delete in P2)

| Writer | Risk | Phase 2 stance |
|--------|------|----------------|
| Cap `Badge.set` vs FCM `setNumber` vs APNS `aps.badge` | OEM order race on launcher | Same formula; runtime prove identity |
| Deprecated split App Icon publish | stale axis merge | Keep banned on product path |
| Heal participant scripts | fact repair | **Forbidden operational use** in P2 |
| Phase H / canary mirrors | confusion | KEEP non-runtime |
| Hub network overwrite of Domain axes | digit drift | P1-c preserve; verify in P2 QA |

### 3.3 Writer singularity verdict

| Surface | Single writer? | Notes |
|---------|----------------|-------|
| App Icon **formula** | Yes (Builder) | Multiple **platform** setters, one number |
| Bottom Chat | Yes (messenger projection ← Domain Apply) | Contract-enforced |
| Trade / Customer hubs | Yes (Domain Apply → hub axes) | |
| Owner FAB order-chat | Hub GET store-scoped | Domain Apply must **preserve** FAB field |
| List rows | participant / list store | Not App Icon writer |
| Bell | separate | Phase 3 |

---

## 4. Explain Matrix (required Phase 2 deliverable)

### 4.1 Target shape (always)

```
AppIcon = N
  General          |GD|     roomIds = [...]
  Group            |Group|  roomIds = [...]
  Trade            |Trade|  roomIds = [...]
  Customer Order   |Cust|   roomIds = [...]
  Owner Order      |Own|    roomIds = [...]
  Missed Call      orphan   eventIds / count
  TOTAL            = N

Bottom = |GD| + |Group|
Trade  = |Trade|  + roomIds
Customer = |Cust| + roomIds
Owner    = |Own|  + roomIds (+ byStoreId for FAB)
```

### 4.2 Already present in server payload (as-is)

`buildDomainBadgeAuthorityHttpPayload` returns:

- `messengerUnreadRoomIds.general_direct` / `.group`
- `tradeUnreadRoomIds`
- `storeOrderUnreadRoomIds.customer` / `.owner`
- `domainAppIcon` parts: `{ messenger, trade, storeOrder, missedCall }`
- `projection.appIconTotal`, `bottomChatTotal`, domain counts

**Gap G1:** Client / QA **Explain Matrix harness** is not yet a first-class Phase 2 PASS artifact (numbers exist; end-to-end “always explain AppIcon=N” runtime report not locked as gate).

**Gap G2:** `domainAppIcon.messenger` collapses GD+Group; Explain requires **split** GD vs Group (IDs already split — display/QA must use ID sets, not only `messenger` sum).

### 4.3 Example (normative)

```
AppIcon = 37
  General        4   ids=[...]
  Group          3   ids=[...]
  Trade          5   ids=[...]
  Customer      21   ids=[...]
  Owner          3   ids=[...]
  Missed Call    1
  TOTAL        37

Bottom = 7 = 4+3
Trade  = 5
Customer = 21
Owner = 3
Native = Launcher = FCM = APNS = 37
```

Invariant: `sum(parts) == appIconTotal` and each part `== |roomIdSet|` (orphan = event count).

---

## 5. Badge Lifecycle Matrix

Legend: **+1 room** = room enters unread set · **−1 room** = room leaves unread set · **recompute** = full Domain rebuild · **0** = no change on that surface

| Event | App Icon | Bottom | Trade | Customer | Owner | Native/FCM/APNS | Notes |
|-------|----------|--------|-------|----------|-------|-----------------|-------|
| Peer message (GD/Group) | + if 0→>0 | + if 0→>0 | 0 | 0 | 0 | = App Icon | Room Unread append |
| Peer message (Trade) | + | 0 | + | 0 | 0 | = App Icon | |
| Peer message (SO customer) | + | 0 | 0 | + | 0 | = App Icon | role-scoped |
| Peer message (SO owner) | + | 0 | 0 | 0 | + | = App Icon | role-scoped; FAB if store match |
| Own send | usually 0 / clear self | same | same | same | same | recompute | sender cursor |
| Mark read (room) | − if >0→0 | − if GD/Group | − if trade | − if customer | − if owner | = App Icon | atomic mark-read |
| Leave group | room out of active set | − if was unread | 0 | 0 | 0 | recompute | left_at; leave interval (P1) |
| Rejoin group | restore pre-leave unread rooms only | same | 0 | 0 | 0 | recompute | P1 Case 2 |
| Room / group delete | remove from sets | same | same | same | same | recompute | |
| Owner transfer | owner/customer sets may move | 0 | 0 | maybe | maybe | recompute | role maps |
| Trade complete / archive | if room unread cleared or deleted | 0 | − | 0 | 0 | recompute | |
| Order complete | if chat unread cleared | 0 | 0 | −/0 | −/0 | recompute | |
| Orphan missed call create | + missed | 0 | 0 | 0 | 0 | = App Icon | room_id null |
| Missed call clear / read | − missed | 0 | 0 | 0 | 0 | = App Icon | |
| Logout | 0 | 0 | 0 | 0 | 0 | 0 | auth epoch |
| Retry / race / multi-device | same stored facts → same Explain | same | same | same | same | same | shared participant SSOT |

**Bell lifecycle:** Phase 3 only (event read_at). Phase 2 must not use Bell read to clear App Icon without room read.

---

## 6. Gaps to close in implementation (after this audit)

| ID | Gap | Why it blocks SSOT COMPLETE |
|----|-----|------------------------------|
| G1 | Explain Matrix not a Runtime PASS gate | Numbers can “look right” without ID-set proof |
| G2 | App Icon parts UI/QA must split GD vs Group | Product Explain requires six lines, not four |
| G3 | Owner FAB commerce axes (orders/store ops) vs Owner Order chat | Phase 2 Owner digit = **Order rooms only**; commerce attention must stay labeled separate or excluded from “Owner Order” Explain |
| G4 | Dual native writers (Cap vs FCM/APNS) | Prove identical `appIconTotal` on Xiaomi/Samsung/Web |
| G5 | Hub GET vs Domain Apply on FAB | Keep store-scoped FAB; never global owner overwrite |
| G6 | List message counts ≠ hub room counts | Document in Explain; do not force equality |

**Out of Phase 2:** Bell SSOT · Notification Event redesign · RoomUnread changes · Dead code delete · Heal ops · Product PASS / LOCK.

---

## 7. Step 1 completion checklist

| Deliverable | Status |
|-------------|--------|
| 1. Badge Authority Map | **DONE** (this §1) |
| 2. Badge Surface Inventory | **DONE** (this §2) |
| 3. Badge Writer Inventory | **DONE** (this §3) |
| 4. Explain Matrix + Lifecycle | **DONE** (this §4–§5) |
| Implementation | **NOT STARTED** |
| Phase 2 PASS | **NOT DECLARED** |

---

## 8. Next (implementation kickoff — awaiting explicit approval)

Order when approved:

1. Wire **Explain Matrix** as first-class payload/QA (G1/G2)  
2. App Icon ↔ Native ↔ Launcher ↔ FCM/APNS identity  
3. Bottom / Trade / Customer / Owner surfaces against Room Unread room sets  
4. Lifecycle Runtime (Xiaomi / Samsung / Web) with Explain proof  
5. Only then: **DIBAY BADGE SSOT COMPLETE** → Phase 3 Bell

**Do not start Step 2 until product explicitly approves implementation.**

---

## 9. Phase 2-1 status (2026-08-01)

**EXPLAIN MATRIX RUNTIME: PASS**

- `explainMatrix` on Domain badge HTTP + read ACK
- `assertBadgeExplainMatrix` + Runtime ×3 PASS
- Implementation order remains: 2-1 → 2-2 Writer → 2-3 Lifecycle → 2-4 Native
