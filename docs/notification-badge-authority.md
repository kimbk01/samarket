# Notification · Chat · Call Badge Authority (DOCUMENT CONTRACT DRAFT)

**Status:** DOCUMENT CONTRACT DRAFT — 2026-08-02  
**Product decision locked (identity):** Member App Icon / Bell **exclude** all Store operational attention — **APPROVED** 2026-08-02 (team)  
**NOT declared:** CODE PASS · RUNTIME PASS · PRODUCT HARD LOCK · Slice 2 implementation Yes  
**Slice 2 impl:** still requires separate Yes after design absorbs this contract  

**SSOT index:** [`docs/notifications/2026-08-02-ab-axis-document-contract-draft.md`](./notifications/2026-08-02-ab-axis-document-contract-draft.md)

---

## 0. Authority layers (extensible architecture)

DIBAY aggregates by **Identity first**. Same `user_id` never shares Bell / App Icon / unread across unequal identities.

```text
Level 1 — Identity
  Member | Store | Admin

Level 2 — Domain
  Notification | Chat | Call | Commerce

Level 3 — Surface
  Bell | Bottom | Hub | FAB | AppIcon | Native Badge
```

Rules:

- A Surface may read only Domains allowed for its Identity.  
- Store Commerce status never writes Member Bell or `memberAppIconTotal`.  
- New business features add Domain×Identity bindings — they must not invent a cross-identity digit.

---

## 0b. Member Identity vs Store Operational Identity (PRODUCT LOCK — design)

Same login may be member + customer + store owner simultaneously. **Authorities must not merge.**

| Identity | Key | Surfaces |
|----------|-----|----------|
| **Member** | `recipient_user_id` / member | Personal Tier1 Bell · `memberAppIconTotal` · GD/Group/Trade · **customer** order chat · missed calls |
| **Store operational** | `store_id` (+ owner/admin) | Delivery bottom · Owner FAB · Store Admin · Store Dashboard · Owner order hub · Store push → admin context |
| **Admin** (platform) | admin capability | Future / existing admin tools — not member App Icon |

```text
memberNotificationUnreadTotal
  = member A-axis unread (NOT store ops)

storeOwnerAttentionTotal(storeId)
  = order/delivery/settlement/admin actions needed for that store

storeOrderChatUnreadRoomCount(storeId)
  = owner-side unread store_order rooms for that store
```

**Personal Bell (fixed):**

```text
bellTotal = memberNotificationUnreadTotal
```

**Personal App Icon (fixed — APPROVED):**

```text
memberAppIconTotal =
  memberNotificationUnreadTotal
  + generalUnreadRoomCount
  + groupUnreadRoomCount
  + tradeUnreadRoomCount
  + customerOrderUnreadRoomCount
  + missedCallCount
```

**Absolutely excluded from member Bell and memberAppIconTotal:**

- `storeOwnerAttentionTotal` / owner intake  
- `ownerOrderWaiting` / cooking / delivery waiting / settlement waiting  
- `ownerCommerceStatus` / store operational actions  
- **owner-side** order chat room counts (`ownerOrderUnreadRoomCount`) — those stay on Store surfaces only  

**Why:** N stores × M new orders must not produce Member Bell/App Icon = M when the person has no personal chat/notice unread.

**Must:**

- New store order → member Bell **+0** · memberAppIcon **+0** (from that event)  
- Same event → store attention / delivery-bottom / FAB / admin **+1** (`storeId`)  
- Customer-facing status → member A only  
- Owner next-action → store attention only  
- Never dual-attribute one event to member A and store attention as the same identity  
- Never sum owner badges by `user_id` across stores  

### mark-all-read (fixed)

| Action | Clears |
|--------|--------|
| Personal Bell mark-all | **member** notifications only |
| Store Admin mark-all | **store** attention for that store context only |

Cross-clear is **forbidden**.

### 0-1 Event attribution table (target)

| Event | Customer member Bell A | Store owner attention | Owner FAB / delivery bottom / admin | Order chat |
|-------|------------------------|---------------------|--------------------------------------|------------|
| Customer places order | **+0** | **+1** (`storeId`) | **+1** that store | — |
| Owner accepts / progresses order | customer A **+1** (status) | intake attention **−** for that order | recompute store surfaces | — |
| Customer → owner message | **+0** | **+0** (not status) | chat hub/FAB via rooms | owner room row + hub |
| Owner → customer message | **+0** (A) | **+0** | — | customer room unread |
| Order status (buyer-facing) | customer A | **+0** | — | — |
| Owner next-action / intake | **+0** | store attention | store surfaces | — |

Distinct `dedupe_key` / `attention_key` and recipient identity per side  
(e.g. LIVE already: `commerce:buyer:owner_status:…` vs `commerce:owner:new_order:…`).

### 0-2 LIVE mix (evidence — conflict)

| Path | Behavior today | Conflict |
|------|----------------|----------|
| `notifyStoreOwnerNewOrder` → `appendUserNotification({ user_id: ownerId })` | Writes `notification_events` on **owner user_id** | Inflates personal Bell via `order_status:owner_intake:{orderId}` (`notification-attention-key.ts`) |
| `loadBellExplainUnreadEventRows` | `eq("user_id", uid)` all unread | No store-ops exclusion from Bell digit |
| `notification_targets` + `p_store_id` | Store-scoped FAB / `owner_commerce_inbox` / hub bundle | **Partial KEEP** — operational surfaces |
| Tier1 `excludeOwnerStoreCommerce` | List filter on some surfaces | Digit still counts owner events |
| `mark_all_owner_store_commerce_read` | Separate from global mark-all | Partial separation; global mark-all risk to store rows still must be audited at impl |
| App Icon ChatAttention | Includes **owner** unread order-chat rooms | **CONFLICT** — product forbids owner rooms in `memberAppIconTotal` |

---

## 1. Top-level separation (target — APPROVED formulas)

| Axis | Name | Meaning |
|------|------|---------|
| **A member** | Member notification | Member system/status/notice (excludes store ops) |
| **A store** | Store operational attention | Per-`storeId` owner/admin queue — Store surfaces only |
| **B member chat/call** | Member communication | GD + Group + Trade + **customer** SO rooms + missed calls |

```text
bellTotal            = memberNotificationUnreadTotal
memberAppIconTotal   = memberNotificationUnreadTotal
                     + generalUnreadRoomCount
                     + groupUnreadRoomCount
                     + tradeUnreadRoomCount
                     + customerOrderUnreadRoomCount
                     + missedCallCount

# Native / FCM / APNs personal badge echo = memberAppIconTotal only
# Store surfaces use storeOwnerAttentionTotal(storeId) and store chat room counts
```

**App Icon is a Projection, not a store.** Forbidden: direct `±`, durable independent `badge_count`, FCM invent, merging Store Identity into Member Bell/App Icon.
---

## 2. LIVE formula (code today — Phase B LOCK)

Source: `lib/notifications/chat-notification-attention-projection.ts`,
`lib/notifications/pipeline/build-domain-badge-authority-http.ts`,
`lib/notifications/domain-app-icon-badge.ts`.

```text
ChatAttentionTotal         = |unread room IDs| (GD+Group+Trade+Customer+Owner)
NotificationAttentionTotal = |distinct active non-chat attention_key|
                             INCLUDING orphan missed_call
                             EXCLUDING chat_message family, room-bound missed,
                             admin_test, admin_marketing_banner, incoming_call*

appIconTotal = ChatAttentionTotal + NotificationAttentionTotal
bellTotal    = NotificationAttentionTotal   // orphan missed INCLUDED
```

**LIVE vs APPROVED member App Icon (intentional product delta):**

```text
LIVE appIconTotal
  ≡ (GD+Group+Trade+Customer+Owner rooms)
    + (member A + store-ops attentions in NotificationAttention + orphan missed)

APPROVED memberAppIconTotal
  ≡ (GD+Group+Trade+Customer rooms only)
    + member A (no store-ops)
    + missedCallCount
```

Impl will **lower** personal icon vs LIVE when the user has owner intake and/or owner chat unread — **by design** (multi-store UX). Not a silent packaging tweak; call out in Slice 2 / 2b impl approval.

---

## 3. Event classification table (type → axis)

Types from `lib/notifications/core/notification-event-types.ts` /
`notification-event-registry.ts`.

| `type` / family | Target axis | LIVE Bell digit (`NotificationAttention`) | LIVE App Icon path | Notes |
|-----------------|-------------|-------------------------------------------|--------------------|-------|
| `trade_status` | A member | include | via notification | KEEP member A |
| `order_status` (buyer / customer) | A member | include | via notification | KEEP; buyer supersede per event SSOT |
| `order_status` (owner intake / owner kinds) | **A store** (target) | **include today → CONFLICT** | via notification today | Target: **exclude from bellTotal**; count in `storeOwnerAttentionTotal(storeId)` |
| `delivery_status` | A member or A store by recipient | include (if rows exist) | via notification | Classify by buyer vs owner recipient; writers often use `order_status` |
| `community_activity` | A | include | via notification | KEEP A |
| `admin_notice` | A | include | via notification | KEEP A; campaign → inbox |
| `admin_marketing_banner` | A conditional | **exclude** digit | exclude | Persist policy → notices-campaign draft |
| `admin_test` | QA only | **exclude** digit | exclude | Must not show as product copy in A list |
| `chat_message` / `group_message` / `mention_message` / `pin_message` | B room | **exclude** digit | via ChatAttention rooms | Inbox history quarantine — not Bell digit |
| `trade_message` / `store_order_message` | B room | **exclude** digit | via ChatAttention rooms | Status ≠ message |
| `missed_call` orphan (`room_id` null) | **B missed** | **include (CONFLICT)** | via NotificationAttention | Target: leave Bell; stay in App Icon as B |
| `missed_call` room-bound | B (row policy) | exclude digit | room unread if message path | Do not double-count with orphan |
| `incoming_call_signal` / `incoming_call` | delivery only | exclude | exclude | Not unread origin |

**Absolute mix bans (target = LIVE intent where already true):**

- Trade peer message ≠ trade status A  
- Order peer message ≠ order status A  
- Same `callId` / session must not add both chat-room unread and missed attention  
- FCM/APNs receive ≠ new unread origin  

---

## 4. Surface formulas (target)

| Surface | Formula | Unit |
|---------|---------|------|
| **Bell digit** | `memberNotificationUnreadTotal` | member A only — **no** store ops, no orphan missed (Slice 2), no chat |
| **Bell list** | member A inbox rows only | not B replicas; not store ops rows |
| **Delivery bottom (owner context)** | store-scoped attention / targets | not personal Bell |
| **Owner FAB / admin** | `storeOwnerAttentionTotal(storeId)` and/or `storeOrderChatUnreadRoomCount(storeId)` per product surface | never user-global sum without store filter |
| **Comm summary card** | unread rooms K + missed M | navigation only → messenger / calls |
| **Room row** | `unreadMessageCount` for that room | messages after read cursor |
| **General / Group / Trade / Order hub** | count of rooms with unreadMessageCount > 0 in that domain | rooms |
| **Bottom chat** | `generalUnreadRoomCount + groupUnreadRoomCount` | rooms; **no** trade/order |
| **Call tab** | `unacknowledgedMissedCallCount` | ≤1 per callId |
| **memberAppIconTotal** | member A + GD+Group+Trade+**customer** SO rooms + missed | Projection only — **no** store ops, **no** owner SO rooms |
| **Native / FCM personal** | echo `memberAppIconTotal` | never store ops |

---

## 5. Increase / decrease (target — authority paths)

### Increase

| Event | Authority write | Surfaces |
|-------|-----------------|----------|
| A system event | `createNotificationEvent` (+ dedupe) `unread`, `read_at` null | Bell +1 attention; App Icon recompute |
| First peer msg in previously-read room | participants / room unread 0→N | row N; hub +1; bottom +1 if GD/Group; App Icon +1 room |
| Extra msgs in already-unread room | room unread N→N+k | row only; hub/bottom/App Icon room contribution unchanged |
| Readable foreground room | message persist + cursor advance | no unread increase |
| Real missed (policy) | missed event / ack store once | call tab +1; App Icon +1; **Bell A +0** |

Missed policy evidence (LIVE keep): `decideMissedCallBellNotify` in  
`lib/community-messenger/call-authority/call-missed-bell-authority.ts`  
(ring_timeout/missed + presentation evidence; cancel/busy/elsewhere → no notify).

### Decrease

| Event | Authority write | Surfaces |
|-------|-----------------|----------|
| A item select | server `read_at` | Bell recompute; App Icon; then navigate |
| A item delete (unread) | `deleted_at` / dismiss | remove from A unread |
| A mark-all-read | all visible A unread → read | A=0; **B unchanged** |
| A delete-all (scoped) | bulk delete | A shrink; **B unchanged** |
| Room read | read cursor commit | row→0; hub/bottom/App Icon **−1 room** (not −message count) |
| Missed ack | acknowledgment / orphan clear | call tab −1; App Icon −1; Bell A unchanged |

**Forbidden heal / ±:** revive `heal-*` writers; Native/FCM inventing counts; stale snapshot overwriting newer `projectionVersionMs` / attention version.

---

## 6. Dedupe (A)

Candidate key fields (align with LIVE writers in `notification-event-ssot.md`):

```text
source_domain · source_event_type · source_entity_id ·
source_event_id|version · recipient_user_id
→ attention_key via resolveNotificationAttentionKey
```

Same key → at most one unread attention. Multi-path (DB / realtime / FCM / resume) must not create a second unread.

---

## 7. Multi-device

- Read/delete/ack on device 1 → server authority → device 2 Projection rebuild.  
- Local optimistic A/B updates must reconcile by version; failed mutation must not permanent-zero.  
- Room readable gate before chat unread clear on push tap (see notification-center draft § push).

---

## 8. Projection SSOT (target packaging — Slice 2, not implemented)

One builder (LIVE name retained conceptually):

```text
buildUnifiedAppIconProjection / buildNotificationBadgeProjection
  → selectors:
       bellBadge              = A only
       appIconTotal           = A + rooms + missed
       bottomChatBadge        = GD + Group rooms
       *HubBadge              = domain rooms
       unacknowledgedMissed   = B missed
  → NativeBadgeSync consumes appIconTotal only
```

**Slice 2 minimum (when LOCK reopen approved):** packaging change so  
`bellTotal` excludes orphan missed while `appIconTotal` numeric identity is preserved.  
No App Icon ±; no RoomUnread reopen; no heal.

---

## 9. Conflict register (LIVE LOCK vs this draft)

See § conflicts in companion docs; summary:

| LIVE locked statement | Draft change | Reopen required? |
|-----------------------|--------------|------------------|
| `bellTotal = NotificationAttentionTotal` includes orphan missed (`chat-notification-attention-projection.ts`) | Bell = A only; missed → B | **Phase 3 Bell** |
| Phase 2-1 explain may fold orphan into notification axis | Explicit B missed part in Explain | Phase 2 Badge Explain (if matrix fields change) |
| `dibay-notification-surface-authority-product-lock.md` §7 Bell kinds include chat + missed in inbox model | A list only; B summary cards | Product surface + Phase 3 list identity |
| `CommunityMessengerBellPinnedAlerts` sum ≠ Bell digit | Discard / demote mixed center | UI (Slice 4), not Projection |

---

## 10. Non-regression protection list

| Domain | Protect |
|--------|---------|
| Call | `decideMissedCallBellNotify` skip reasons; no missed on cancel/busy/elsewhere; callId dedupe `missed:{sessionId}:{userId}` |
| Chat RoomUnread | participants unread origin; no event SUM revival on bottom/hubs |
| Bottom chat (messenger) | GD+Group only |
| Trade chat | trade room facts only |
| Push badge | `badge_count` / `aps.badge` = `appIconTotal` echo only |
| Native | `NativeBadgeSync` ← `domain-badge-surface-store.appIconTotal` only |
| Bell mark-all (member) | member A only — must not clear store attention / owner rooms |
| Owner ops | store-scoped targets/FAB — do not delete while fixing Bell |

## 10b. Push split (APPROVED)

| Kind | Recipient | Entry |
|------|-----------|-------|
| **Member Push** | `recipient = member` | Personal screens only |
| **Store Push** | `recipient = owner/admin` + `store_id` | **Store Admin** (never member home) |

Store push required data:

```text
audience / recipient_role = store_owner | store_admin
store_id
order_id | room_id
event_type
deep_link | canonical route
dedupe_key
```

Tap order: auth → verify owner/admin for `store_id` → store admin context → order/chat admin → clear **store** attention/chat only → **member Bell / memberAppIconTotal unchanged**.  
No permission / inactive store → admin-denied or store-picker; **not** personal home; **do not** clear unread first.

LIVE gap: `resolve-push-route-from-fcm-data.ts` lacks first-class role/`store_id` gate.

---

## 11. Verdict for this file

**DOCUMENT CONTRACT DRAFT only.**  
Do not treat as CONTRACT LOCK or CODE PASS.  
**Do not merge member Bell and store operational badges by convenience.**
