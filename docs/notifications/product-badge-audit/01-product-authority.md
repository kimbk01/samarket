# 01 — Product Authority Tree

**Mode:** STOP · Product audit only  
**Date:** 2026-08-03  
**HEAD:** `449e02771` (product ≈ Gate 3 `6c8e2c8eb`)  
**Code PASS / Runtime PASS / Hard Lock:** not used

---

## 0. Product authorities (intended)

Three mutually exclusive product authorities. One event belongs to exactly one.

| Authority | Scope identity | Product meaning |
|-----------|----------------|-----------------|
| **A — Member Notification** | `user:{member_id}` | Persistent non-chat alerts for a person |
| **B — Conversation** | room + member or store | Unread conversation / unresolved missed call |
| **C — Store Owner Ops** | `store:{store_id}` | Action-required store work for an owner |

---

## 1. A — Member Notification

| Layer | Product SSOT |
|-------|----------------|
| Authority | Eligible unread persistent member notification events |
| Writer | Server notification pipeline → `notification_events` (member recipient only) |
| Projection | `A_member_unread_notification_count` |
| Reader | Bell digit, Notification Center list, (feeds App Icon as A term) |
| Surface | Bell Digit, Bell/NC list, App Icon (A part) |

**Includes (product):** trade/order/delivery **status**, review/community activity (like/comment/reply), admin/service notice, security, friend request, orphan missed-call as notification (policy), marketing **if** product says persistent inbox.

**Excludes (product):** chat message rows, store owner ops (C), owner_intake on member Bell, ephemeral push-only.

---

## 2. B — Conversation (Member)

| Layer | Product SSOT |
|-------|----------------|
| Authority | Unread rooms (participant unread + last_message) + unresolved missed (policy) |
| Writer | Message insert / room unread bump (participants); missed-call lifecycle |
| Projection | Per-domain room counts: GD, Group, Trade, Customer Order |
| Reader | Bottom Chat, Hubs, Room rows, App Icon (B part) |
| Surface | Bottom Chat, General/Group/Trade/Order hubs & lists, room row badge, App Icon |

**B is not Bell.** Chat message never increases Bell.

---

## 3. B_store — Store Conversation

| Layer | Product SSOT |
|-------|----------------|
| Authority | Customer→store order chat unread rooms under `store:{id}` |
| Writer | Store-order chat messages |
| Projection | Owner FAB chat / Owner hub chat digit (store-scoped) |
| Reader | Owner surfaces only |
| Surface | Owner FAB chat, Owner hub chat, Owner row (message unit) |

**Never** Member Bell / Member Bottom / Member App Icon.

---

## 4. C — Store Owner Operational

| Layer | Product SSOT |
|-------|----------------|
| Authority | Action-required ops under `store:{id}` (new order, accept, cook, etc.) |
| Writer | Order ops pipeline → store attention / owner ops SSOT (not member A) |
| Projection | Owner FAB order attention / Owner hub ops |
| Reader | Owner-only UI |
| Surface | Owner FAB orders, Owner hub ops, Owner dashboard |

**Never** Member A, Member Bell, Member Bottom, Member App Icon.

---

## 5. App Icon (Member) — composed authority

| Layer | Product SSOT |
|-------|----------------|
| Authority | Composition of A + B_member only |
| Writer | Echo of MemberAppIconTotal (no independent invent) |
| Projection | `MemberAppIconTotal = A + B_member_rooms (+ unresolved missed per policy)` |
| Reader | Cap Badge / launcher / FCM·APNS badge_count |
| Surface | App Icon |

**C and B_store must not appear on Member App Icon.**

---

## 6. Forbidden product mixing

| Mix | Product rule |
|-----|----------------|
| Chat → Bell | FAIL |
| Owner C → Member A/Bell/App Icon | FAIL |
| Owner B_store → Member App Icon | FAIL |
| Dual App Icon totals in one payload with different inclusion | FAIL (product confusion) |
| API smoke PASS as Product PASS | FAIL |

---

## 7. Live observation (audit evidence, not code gate)

| Authority | Live symptom (2026-08-03 screenshots · asas55) |
|-----------|-----------------------------------------------|
| A | Bell digit empty; NC empty — consistent with A=0 |
| B | Bottom Chat = 3; Trade hub row = 2; Order hub row = 14; room rows show message unread |
| App Icon | Launcher shows **20** |
| Dual total | HTTP `unifiedAttention` was 22 while Cap/projection 20 — product cannot trust “one number” |
| C | Not audited on this member screenshot set (owner store UI separate) |
