# Badge Authority Contract (Phase 1)

**Status:** PHASE 1 AUTHORITY CONTRACT  
**Date:** 2026-08-02  
**Baseline HEAD:** `1e2a560c1`  
**Prior failed attempt:** `059b7dcbd` (fully reverted)  
**Phase 0:** AUDIT PASS (docs under `badge-authority-rebuild-phase0/` — not modified)  
**This phase declares:** `PHASE 1 AUTHORITY CONTRACT PASS` only when tests + docs satisfy §12  
**Not declared:** CODE / RUNTIME / PRODUCT / HARD LOCK

**Pure contract module (not wired to product runtime):**  
`lib/notifications/badge-authority-rebuild/phase1-authority-contract.ts`

---

## 0. Purpose

Lock A / B / C authorities, identities, and surface formulas **before** any product implementation.

---

## 1. Authorities (mutually exclusive per event)

### A — Member Notification Authority

Persistent non-conversational alerts for a member.

```text
recipient_scope = member
recipient_identity_key = user:{user_id}
A_member_unread_notification_count =
  count(eligible member notification events
    where persists_in_inbox = true
      and read_at is null
      and deleted_at is null)
```

**Includes:** trade/order/delivery status (member-facing), payment/cancel/refund, account/security, service/admin persistent notices.  
**Excludes:** all chat messages, missed calls, store new order / action-required, marketing ephemeral FCM.

**Contract violation (live Phase B):** `owner_intake` inside `NotificationAttentionTotal` / Bell.

### B — Communication Authority

Unread conversation / unresolved missed call state. **Not a single stored total** — project from rooms + missed events.

```text
B_unread_communication_item_count =
  unread_room_count
  + unresolved_missed_call_count
```

Member B domains: `general_direct`, `group`, `trade`, customer-side `store_order`.  
Store B: customer→store order chat under `store:{store_id}`.

**Critical:** Customer→owner **message** = **B** (store scope). Never C.

### C — Store Owner Operational Authority

Action-required store work under `store:{store_id}`.

**Includes:** new order waiting, accept/reject, cook/pickup/delivery handling, sold-out/cancel response.  
**Excludes:** chat messages, member Bell, member A.

**Contract violation (live Phase B):** `notifyStoreOwnerNewOrder` → `notification_events` on owner `user_id`.

---

## 2. Locked surface formulas (PRODUCT LOCK — 2026-08-02)

### Member App Icon (final)

```text
MemberAppIconTotal =
  A_member_unread_notification_count
  + B_member_unread_room_count
  + B_member_unresolved_missed_call_count
```

**B_member rooms include:** General, Group, Trade, customer-side Store Order, member unresolved missed.  
**Excluded from Member App Icon (BLOCK until separate product decision):** `B_store`, Owner Store Order chat, `C_store`, owner intake, marketing FCM.

### Other surfaces

| Surface | Formula |
|---------|---------|
| Bell | `A_member_unread_notification_count` only |
| Bottom Chat | `|GD unread rooms| + |Group unread rooms|` |
| Trade Hub | `|Trade unread rooms|` |
| Trade row | unread **messages** |
| Customer Order Hub | `|Customer SO unread rooms|` |
| Customer row | unread **messages** |
| Owner chat surface | `B_store` = `OwnerChatUnreadRoomCount(store_id)` |
| Owner operation surface | `C_store` = `OwnerOperationAttentionCount(store_id)` |
| Owner presentation (UI only) | B_store + C_store — **never** Bell / Member App Icon / DB / FCM / Native authority |

```text
B_store ∉ Member App Icon
B_store ∉ Member Bell
C_store ∉ Member App Icon
C_store ∉ Member Bell
C_store ∉ Native App Icon   # blocked until separate "owner-mode App Icon" product
```

**Unit lock:** App Icon / hubs use **room** counts (deduped room ids). Rows use **message** counts. Same room with 20 messages → App Icon B +1 only.

---

## 3. Samsung AppIcon 20 note (not a “fix digit” task)

QA observed `trade=3`, `buyer=17`, `appIcon=20` with `A=0`. Under a room-based formula that is **3+17 rooms**, not 20 messages.  
Whether those rooms match true unread cursors is **unverified** → projection **not trusted**. Phase 2+ must lock: unique unread rooms only, no duplicate room ids, member/store recipient split, read rooms removed immediately. **Do not** shrink 20 by patch.

---

## 4. Legacy status (unchanged from Phase 0)

| Item | Status |
|------|--------|
| Legacy DIBAY standalone APK | **NOT FOUND** |
| Kakao/Daangn/Baemin/Yogiyo device measurement | **NOT EXECUTED** |
| Publicly documented pattern comparison | **DOCUMENTED** |
| Legacy runtime parity | **NOT PROVEN** |

Public patterns are **not** legacy runtime PASS and **not** a substitute for DIBAY contracts.

---

## 5. Remaining open items (after 2026-08-02 lock)

**No longer undecided:** Member App Icon excludes `B_store`/`C_store`; Native App Icon excludes `C_store` (and `B_store`). See §2.

Still deferred to Phase 2A mapping (not product undecided):

- KEEP/ROUTE/DELETE of live Phase B writers  
- Unread cursor truth verification method  
- Slice order for implementation  

## 6. Phase 1 stop

After CONTRACT PASS: **stop**. Phase 2 **implementation** requires Phase 2A mapping + explicit approval. No KEEP/ROUTE/DELETE applied to live writers in Phase 1.
