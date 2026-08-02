# Slice 2-5 — C_store Authority Contract

**Status:** AUTHORITY CONTRACT (docs + pure tests)  
**HEAD / origin/main / Production:** `c673ac444`  
**Prior:** `SLICE 2-5 C_STORE AUDIT PASS`  
**Locked axes (untouched):** A_member · B_member · B_store  
**Code module (pure only):** `lib/notifications/badge-authority-rebuild/c-store-authority-contract.ts`

---

## One-line lock

```text
C_store는 “알림을 안 읽은 수”가 아니라 “아직 끝내지 않은 매장 업무 수”다.
C_store is unfinished store work count, not unread notification count.
```

---

## 1. Definition

```text
C_store(storeId)
  = count(distinct active Action Required for store:{storeId})

active =
  completedAt = null
  AND cancelledAt = null
  AND identity = store:{storeId}
```

| Property | Contract |
|----------|----------|
| Unit | Action Required item (`actionId`) |
| Identity | `store:{storeId}` only |
| Increase | new active `actionId` opened |
| Decrease | Action Complete (or cancelled-no-longer-required) |
| Not decrease | screen open · notification read · refresh · chat read |

---

## 2. Identity Contract

**Allowed:** `scope=store`, `identity=store:{storeId}`  
**Forbidden:** `user:{ownerId}`, owner userId, viewer userId, first owned store, all-store sum

1 account ↔ 1 store product today does **not** relax this. Multi-store future must keep per-store independence.

---

## 3. Confirmed C_store event set

| Action Type | Source | Increase | Complete | Status |
|-------------|--------|----------|----------|--------|
| `NEW_ORDER_PENDING` | `pending` | enters pending | accept **or** reject | **CONFIRMED** |
| `REFUND_REQUESTED` | `refund_requested` | refund opened | approve/deny/resolve | **CONFIRMED** |
| `CANCEL_REQUESTED` | `cancel_requested` | cancel request needing store action | approve/deny/resolve | **GAP_ADD** (∈ C_store) |
| `OPEN_STORE_INQUIRY` | `store_inquiries.status=open` | ticket open | reply/close | **CONFIRMED** |

### `cancel_requested` decision (locked)

```text
cancel_requested ∈ C_store
```

**Exclusion:** if `storeActionRequired=false` (auto-resolved / no owner decision), do **not** open a C action.  
Live Hub RPC omits this count today → CODE must ADD (GAP).

### Inquiry decision (locked from code evidence)

`countOpenStoreInquiriesForStore` counts `store_inquiries` rows with `status=open` (“미답변 문의”) — **ticket/work status**, not chat unread.  
→ `OPEN_STORE_INQUIRY` = **C_store CONFIRMED**.  
Chat unread remains **B_store**.

### Review / cooking / delivery

| Item | Decision |
|------|----------|
| `REVIEW_ACTION` | **UNKNOWN_BLOCKED** — not in C sum |
| Cooking / delivery stages | **OUT_OF_BADGE** — Dashboard CTA only |

---

## 4. Exclusions (never C_store)

- B_store owner chat unread rooms / messages / chat read
- A_member Bell / member notices
- Member App Icon / Native Member App Icon
- Screen visit, Hub open, Dashboard open, FCM receive, inbox dismiss
- Completed / terminal ops with no remaining Action Required

---

## 5. Dual-authority bans (must remove in CODE)

| Live anti-pattern | Contract |
|-------------------|----------|
| `orderAttention = max(state, fab_owner_orders)` | **FORBIDDEN** as authority (`C_STORE_FORBIDS_MAX_DUAL_AUTHORITY`) |
| Header/ops total = C + B_store chat | **FORBIDDEN** as authority; presentation-only sum allowed |
| `owner_intake` user_id as C truth | **REWRITE** — transport ≠ C count |

Single authority source for C_store. Other lanes ROUTE as projection/inbox only.

---

## 6. Hub formula candidate (contract)

```text
C_store =
  pendingOrderActions
  + refundActions
  + cancelActions
  + openInquiryActions
```

Each term = **distinct active actionId count**, not notification unread, not max().

---

## 7. Surfaces

**Allowed:** Owner Operations Hub · Owner Operations FAB · Owner Dashboard action section · Owner order action-required list  

**Forbidden:** Member Bell · Member App Icon · Bottom Chat · Customer Order Hub · Owner Chat Hub/FAB · chat row · Native Member App Icon  

```text
OwnerChatBadge        = B_store
OwnerOperationBadge   = C_store
OwnerPresentationTotal = B_store + C_store   # presentation only
```

---

## 8. Notification separation

| Signal | Effect |
|--------|--------|
| notification read | inbox unread may fall |
| operation complete | C_store falls |
| read without complete | **C stays** |
| complete with inbox row left | **C falls** |

`owner_intake` classification remains `C_STORE_OPERATION` for routing, but **row read is not C truth**.

---

## 9. KEEP / ROUTE / REWRITE / DELETE (contract)

See audit `keep-route-delete.md` + updates:

| Class | Items |
|-------|--------|
| **KEEP** | store_id pending/refund/inquiry state counts; Action Complete status clear; Dashboard action list |
| **ROUTE** | Hub `orderAttention` consumers; FAB ops; Dashboard counts; notification tap routes; presentation sum |
| **REWRITE** | `notifyStoreOwner*`; `owner_intake` identity; Tier1 user targets; add `cancel_requested` into Hub C |
| **DELETE** | max dual authority; authority use of C+B sum; open-as-clear; read-as-clear; Member Bell/App Icon inflow |
| **BLOCK** | REVIEW_ACTION; cooking/delivery badge expansion without product YES |

---

## 10. Completeness vs Audit

Audit docs retained (not overwritten). Contract resolves:

| Audit open item | Contract decision |
|-----------------|-------------------|
| cancel_requested GAP | **∈ C_store** (GAP_ADD for CODE) |
| inquiry ticket vs chat | **ticket → C_store CONFIRMED** |
| review FAB | **UNKNOWN_BLOCKED** |
| cooking/delivery | **OUT_OF_BADGE** |
| max() dual source | **FORBIDDEN** |
| Header C+B mix | presentation only |

---

## 11. Next step (do not auto-start)

After `SLICE 2-5 C_STORE AUTHORITY CONTRACT PASS` → **stop**.  
CODE / RUNTIME / PRODUCT / HARD LOCK / Slice 2-6 require a new explicit prompt.
