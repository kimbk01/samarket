# Slice 2 — Bell A-axis Packaging Design (DESIGN UPDATED · NOT IMPLEMENTED)

**Status:** Slice 2a+2b **CODE implemented** (2026-08-02) — awaiting CONTRACT/RUNTIME gates.  
**NOT declared:** CONTRACT PASS · RUNTIME PASS · PRODUCT PASS · HARD LOCK

## Product decisions already APPROVED (do not reopen casually)

1. `bellTotal = memberNotificationUnreadTotal` (no store ops, no orphan missed in digit)  
2. `memberAppIconTotal` formula fixed — **excludes** all store operational attention **and** owner-side order chat rooms  
3. Store ops only on delivery bottom / FAB / admin / dashboard / owner hub  
4. Member push vs Store push split; mark-all never shared  
5. Authority layers: Identity → Domain → Surface  

Canonical text: [`docs/notification-badge-authority.md`](../notification-badge-authority.md) §0–§1.

---

## 0. Member vs Store (summary)

```text
bellTotal = memberNotificationUnreadTotal

memberAppIconTotal =
  memberNotificationUnreadTotal
  + generalUnreadRoomCount
  + groupUnreadRoomCount
  + tradeUnreadRoomCount
  + customerOrderUnreadRoomCount
  + missedCallCount

# FORBIDDEN in member Bell / memberAppIconTotal:
storeOwnerAttentionTotal | ownerOrderWaiting | ownerCommerceStatus | ownerOrderUnreadRoomCount
```

LIVE conflict remains until impl: `notifyStoreOwnerNewOrder` → personal events → Bell; App Icon includes owner rooms + owner attentions.

---

## 1. Target formulas (post-impl)

```text
memberNotificationAttention =
  |distinct active MEMBER non-chat attention_key|
  EXCLUDING orphan missed_call
  EXCLUDING store owner operational attentions
  EXCLUDING chat_message family, room-bound missed,
            admin_test, admin_marketing_banner, incoming_call*

missedCallCount = unacknowledged orphan missed (B)

memberChatRooms =
  |GD| + |Group| + |Trade| + |Customer SO|
  // Owner SO rooms EXCLUDED from memberAppIconTotal

bellTotal          = memberNotificationAttention
memberAppIconTotal = memberNotificationAttention + memberChatRooms + missedCallCount
```

**I1 note (updated):** vs LIVE, personal App Icon **will decrease** when owner intake/owner chat unread exist — **approved product delta**, not a regression if Explain matches the new formula.

---

## 2. Change set (candidates — not approved to code yet)

### 2-1 Member packaging (Slice 2a — orphan + member A digit)

| Module | Change |
|--------|--------|
| `buildNotificationAttentionProjection` | Exclude orphan missed **and** store-ops attentions from member digit total |
| `buildUnifiedAppIconProjection` / builder / HTTP | `memberAppIconTotal` = member A + GD+Group+Trade+Customer + missed; **drop owner rooms from personal icon** |
| `buildBellExplainMatrix` | `total` = member A only |
| Tier1 list + member mark-all | Exclude missed + store-ops; mark-all member-only |
| Badge Explain | Parts match new memberAppIconTotal |

### 2-2 Store identity surfaces (Slice 2b — may ship with or before 2a)

| Module | Change |
|--------|--------|
| Store attention selectors | FAB / delivery bottom / admin use `storeId` only |
| Owner event rows | May remain in DB for owner inbox; **must not** feed `bellTotal` / `memberAppIconTotal` |
| Store mark-all | `mark_all_owner_store_commerce_read` (or successor) only |
| Store push | `recipient_role` + `store_id` + admin route; no member home |

### 2-3 Forbidden in these slices

RoomUnread writers for GD/Group/Trade · call `decideMissedCallBellNotify` · heal · messenger mixed center discard (Slice 4) · inventing App Icon ±  

---

## 3. Invariants

| ID | Invariant |
|----|-----------|
| I-M1 | `bellTotal` has zero store-ops attentions |
| I-M2 | `memberAppIconTotal` has zero store-ops and zero owner SO rooms |
| I-M3 | New order → member Bell/AppIcon +0; store surfaces +1 |
| I-M4 | Member mark-all ↛ store attention; store mark-all ↛ member Bell |
| I-M5 | Native/FCM personal badge = `memberAppIconTotal` |
| I-S1 | Store badges never aggregate by `user_id` alone |
| I-B1 | Call decision matrix unchanged |
| I-C1 | GD/Group bottom chat formula unchanged (member rooms) |

---

## 4. Regression tests (at impl)

- Orphan missed ∈ memberAppIcon, ∉ bellTotal  
- Owner new_order ∈ store attention, ∉ bellTotal, ∉ memberAppIcon  
- Owner chat unread ∈ store FAB/hub, ∉ memberAppIcon  
- Customer order status ∈ member A; owner intake ∉ member A  
- Member mark-all leaves store attention  
- Multi-store: store A badge independent of store B  

---

## 5. Rollback

- Member Bell increases on new order after “fix” → revert  
- memberAppIcon includes store ops or owner rooms → revert  
- Member mark-all clears store attention → revert  
- Call/GD/Group/Trade room math breaks → revert  

---

## 6. Slice include vs separate

| Work | Slice |
|------|-------|
| Orphan missed packaging + memberAppIcon formula (no owner rooms) | **2a** |
| Store ops excluded from Bell digit/list/mark-all | **2a or 2b** (must not ship 2a without this) |
| Store push identity + admin route gate | **2b / 8** |
| Messenger mixed center discard | **4** |
| Notices domain | **7** |

**Recommended:** one impl approval covering **2a+2b minimum** (member formula + store-ops exclusion). Push gate can follow if scoped.

---

## 7. Implementation gate

```text
PRODUCT IDENTITY: APPROVED
SLICE 2a+2b CODE: LANDED (unit/contract tests)
NEXT: CONTRACT PASS → RUNTIME → devices → PRODUCT PASS (separate approvals)
```
