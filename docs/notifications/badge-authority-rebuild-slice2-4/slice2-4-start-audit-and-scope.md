# Slice 2-4 — B_store Start Audit & Implementation Scope

**Status:** AUDIT / SCOPE ONLY — **no product code in this step**  
**Baseline HEAD / origin/main:** `c89caaddb`  
**Prior locks:** 2-1 CODE PASS · 2-2 MEMBER NOTIFICATION RUNTIME PASS · 2-3 B_MEMBER RUNTIME PASS  
**This slice does NOT declare:** PRODUCT · HARD LOCK · Native · C_store · B_member reopen

---

## 0. Goal

```text
B_store = OwnerChatUnreadRoomCount(store_id)
recipient_scope = store
recipient_identity_key = store:{storeId}
```

Customer → store owner order chat = **B_store** (communication), not C_store (ops).

### Hard exclusions (must hold)

```text
B_store ∉ Member Bell
B_store ∉ Member App Icon (web/server)
B_store ∉ Bottom Chat
B_store ∉ Customer Order Hub
B_store ∉ Native Member App Icon   (unchanged; Slice 2-6)
```

### In-scope surfaces

| Surface | Unit | Authority key |
|---------|------|----------------|
| Owner Hub / FAB chat digit | unread **rooms** for **active** `storeId` | `store:{storeId}` |
| Owner order-chat list / hub rows | unread **messages** (row) | room under that store |
| Domain bag `storeOrderOwnerUnreadByStoreId` | rooms per store | `store:{storeId}` |
| Aggregate `storeOrderOwnerUnreadRooms` | diagnostic / multi-store sum | user — **not** Member App Icon |

---

## 1. What Slice 2-3 already locked (do not reopen)

| Item | Status |
|------|--------|
| Member App Icon = A + B_member (buyer SO only for store_order) | RUNTIME PASS |
| Owner rooms excluded from Member App Icon / Bottom / Customer hub | RUNTIME PASS |
| `storeOrderOwnerUnreadRooms` still computed for Owner FAB / Hub | KEEP as input |
| Tip-scoped read-clear for CM + customer SO | KEEP |
| Bell = A_member only | KEEP |

Slice 2-4 **must not** change B_member formulas or Bell A writers.

---

## 2. Current runtime map (post 2-3)

### Facts (KEEP shape)

`load-trade-store-order-unread-room-facts-from-participants.ts`

- Partition: buyer → customer · `stores.owner_user_id === uid` → owner
- Already emits `ownerOrderUnreadByStoreId: Record<storeId, roomCount>`
- Row unit = participant `unread_count` (messages)
- Room unit for owner bag = distinct rooms with unread > 0

### Projection (partial)

`build-notification-badge-projection.ts`

- `storeOrderForAppIcon = buyer` only (2-3)
- `storeOrderOwnerUnreadRooms` / `storeOrderOwnerUnreadByStoreId` still on projection output
- Member B helpers reject owner contamination

### Owner Hub / FAB (KEEP shell; VERIFY store scope)

`build-owner-hub-badge-payload.ts` + `owner-hub-badge-store.ts`

- FAB `storeOrderChatUnread` intended as **active hub store** shell
- Also still receives target-bundle / optimistic paths (`fab_owner_order_chat`)
- Risk: user-aggregate owner rooms vs active-store rooms drift

### Identity gap (REWRITE target)

Today ownership for partition is **`owner_user_id === viewer`**, not a first-class `store:{storeId}` recipient authority key in badge rebuild modules.  
Facts are already store-keyed; Slice 2-4 should make **store identity** the product authority for Owner chat surfaces.

---

## 3. Gaps / risks to close in 2-4

| ID | Gap | Severity |
|----|-----|----------|
| G1 | No dedicated `B_store` projection module / eligibility (rebuild package) | Required |
| G2 | Multi-store: FAB must use `byStoreId[activeStore]`, never silent all-store sum as FAB digit | Required |
| G3 | Staff / non-`owner_user_id` membership unread | UNPROVEN — spike only; default out of PASS |
| G4 | Owner chat optimistic Apply must not write Member App Icon / Bell / Bottom | Regression gate |
| G5 | Customer SO read / Member B must remain unchanged when owner side updates | Isolation |
| G6 | C_store (`orderAttention` / owner_intake) must stay separate — do not merge into B_store | Boundary |
| G7 | Store-scoped missed call | NOT IN 2-4 (unless already on row); defer |

---

## 4. Implementation scope (proposed)

### In

1. **Audit + contract docs** under `docs/notifications/badge-authority-rebuild-slice2-4/`
2. **`member` rebuild helpers or new `store-communication-b-projection.ts`**
   - `buildBStoreUnreadRoomCount(storeId, byStoreId)`
   - eligibility: B_store surfaces only
3. **Wire Owner Hub/FAB** to prefer `storeOrderOwnerUnreadByStoreId[hubStoreId]` as chat authority (with existing shell/target merge rules documented)
4. **Regression tests**
   - B_store ∉ Bell / Member App Icon / Bottom / Customer hub
   - Store A unread does not inflate Store B FAB
   - Owner room still excluded from Member App Icon after owner message
   - C_store fields unchanged by B_store writers
5. **Isolation allowlist** update if new rebuild module
6. Runtime QA matrix (after CODE PASS + deploy): multi-store if available; Xiaomi/Samsung owner FAB + row

### Out (forbidden this slice)

- Bell A / mark-all
- B_member formula / tip idempotency reopen
- C_store ops accept/reject / owner_intake rewrite (→ 2-5)
- Native / FCM badge_count (→ 2-6)
- Digit hacks, full unread reset, `.qa-logs` commits
- Staff multi-role product PASS (unless proven in spike)

---

## 5. Acceptance (CODE → RUNTIME)

### CODE PASS

- B_store projection + Hub/FAB store-scope wiring
- Exclusion tests green
- isolation · related vitest · lint · tsc · build
- Product diff excludes Native/FCM/Bell A / C writers

### RUNTIME PASS (later)

- Active store FAB = that store’s unread **room** count
- Row = message count
- Other store independent
- Member Bell / App Icon / Bottom / Customer hub unchanged by owner chat receive
- Owner read clear reduces that store only
- **Not** PRODUCT / HARD LOCK / Native PASS

---

## 6. Revert unit

Owner chat projection consumers + Hub/FAB B_store wiring only.  
Do not revert 2-2/2-3 with 2-4.

---

## 7. Suggested first code step (after approval)

1. Add `store-communication-b-projection.ts` (+ tests) pure helpers  
2. Point Hub FAB resolve to `byStoreId[active]` with contract comments  
3. Add exclusion regression tests  
4. Stop for review before broad Apply/optimistic rewrites

---

## 8. Verdict this document

**SLICE 2-4 SCOPE DRAFTED**  
**SLICE 2-4 CODE PASS** — not started  
**B_STORE PASS** — not declared  

Next: user approval → implement proposed step 1–3 only.
