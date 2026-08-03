# 00 — Original Product Requirements (restored)

**Mode:** FULL ARCHITECTURE RE-AUDIT · AUDIT ONLY  
**HEAD:** `f438f37e2` · **Baseline:** `1e2a560c1`  
**Sources:** user product statements (this audit prompt) · Phase 1 contracts · Slice 2-* docs (input only, not assumed PASS)

---

## 1. Event domains (product)

### 1.1 Member notifications (A)

| Include | Clear rule |
|---------|------------|
| 공지 · 시스템 알림 | Read / delete |
| 거래 상태 변경 | Read / delete |
| 고객 주문 상태 변경 (buyer) | Read / delete |
| 결제·취소·환불 (buyer-facing) | Read / delete |
| 회원 대상 persistent 알림 | Read / delete |

**Surfaces:** Bell digit · Bell popup (A items) · full notification list · notice/system detail · Member App Icon **A component**

**Forbidden on these surfaces:** chat messages · owner ops · marketing ephemeral · ads

### 1.2 Member chat (B_member)

| Include | Clear rule |
|---------|------------|
| General / Group / Trade counterpart messages | Room read cursor |
| Customer-side Store Order messages | Room read cursor |
| Real unresolved missed call | Seen / resolve (not Bell read) |

**Surfaces:** room row (message unread) · Bottom Chat (GD+Group rooms) · Trade Hub · Customer Order Hub · Member App Icon **B component**

### 1.3 Owner chat (B_store)

| Include | Clear rule |
|---------|------------|
| Customer → store order chat | Owner room read cursor |

**Surfaces:** Owner room row · Owner Chat Hub/FAB  

**Forbidden:** Member Bell · Member App Icon · Bottom · Customer Hub

### 1.4 Store operations (C_store)

| Include | Clear rule |
|---------|------------|
| New order needing accept · refund request · cancel request · open inquiry | **Action Complete** (not read) |

**Surfaces:** Owner Operations Hub/FAB/Dashboard only

### 1.5 Ads / campaign push

OS notification may show. **No** Bell / inbox / App Icon authority increase. Tap → campaign target.

---

## 2. Product formulas (to validate)

```text
Bell                          = |member persistent unread notification A|
List unread (product intent)  = same A set as Bell
Bottom Chat                   = |GD unread rooms| + |Group unread rooms|
Room row                      = unread messages in that room
Trade Hub                     = |Trade unread rooms|
Customer Order Hub            = |Customer Order unread rooms|
Owner Chat Hub/FAB            = |active store unread owner-chat rooms|
Owner Operations              = |incomplete store actions|
Member App Icon               = |A| + |member unread rooms| + |unresolved missed calls|
```

---

## 3. Formula vs product — pre-implementation judgment

| Formula | Matches original demand? | Note |
|---------|--------------------------|------|
| Bell = A unread only | **YES** | Clear = read/delete |
| List unread = same A set as Bell | **YES (required)** | Digit≠list is product FAIL, not “UX polish” |
| Bottom = GD+Group rooms | **YES** | Trade/SO/missed/A/C out |
| Row = message unread | **YES** | Different unit from hub room count |
| Trade / Customer hubs = room counts | **YES** | Status events stay A |
| Owner Chat = store-scoped rooms | **YES** | Not member App Icon |
| Owner Ops = Action Required | **YES** | Clear ≠ read |
| App Icon = A + member rooms + missed | **YES** | B_store/C/ads out |

**Pre-code conclusion:** The **named A/B/C product model and App Icon formula match the restored original demand.**  
What must still be proven in code is whether **implementation preserves one A ID set across Bell digit / popup / list / mark-all**, and one App Icon membership set.

---

## 4. Explicit product conflicts to watch (not yet verdict)

1. **Bell popup showing “중요 대화” (chat rooms)** — if popup is an A surface, this violates A-only; if popup is a messenger chrome affordance, product must not treat it as Bell A truth.
2. **Bell count unit = attention keys vs list = event rows** — product said same A set; key compression vs raw events can diverge counts without diverging “membership intent.”
3. **owner_intake written to owner `user_id`** — product says C on store identity; residual user_id writer conflicts unless fully filtered from every A consumer.
