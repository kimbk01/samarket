# 06 — App Icon Product

**Mode:** STOP · Most important product surface  
**Prior smoke “Device PASS”:** void

---

## 1. What App Icon means (product)

App Icon digit = “How many things need my attention **as a member of DIBAY** before I open the app?”

It is **not**:
- Bell alone
- Bottom Chat alone  
- Sum of every hub digit shown on messenger home without rules
- Owner ops for stores I manage

---

## 2. Intended formula (product sentence)

```text
Member App Icon =
  (unread persistent member notifications — Authority A)
  +
  (unread conversation rooms in member domains — Authority B_member)
  +
  (unresolved member missed calls — only if product maps them into B or A once, never twice)
```

**B_member rooms include:** General Direct, Group, Trade, Customer Store-Order.  
**B_member rooms exclude:** Owner Store-Order rooms (B_store).  
**Always exclude:** Authority C (store ops).

In short: **App Icon = A + B_member.**  
Not “ChatAttention + NotificationAttention with owner rooms still inside Chat.”

---

## 3. Inclusion matrix

| Source | In Member App Icon? |
|--------|---------------------|
| Member Notification (A) | **YES** |
| Conversation General | **YES** |
| Conversation Group | **YES** |
| Conversation Trade | **YES** |
| Conversation Order (Customer) | **YES** |
| Conversation Owner SO (B_store) | **NO** |
| Owner Ops (C) | **NO** |
| Missed Call (member unresolved, once) | **YES** (B or A per policy, not both) |
| Community like/comment (as A) | **YES** (via A) |
| Community like (as local UI only) | No separate icon term |
| Bell-only marketing ephemeral | **NO** unless A |

---

## 4. Relation to other surfaces

| Surface | Relation to App Icon |
|---------|----------------------|
| Bell | A ⊂ App Icon |
| Bottom Chat | GD+Group ⊂ App Icon B; Bottom ≤ App Icon always |
| Trade Hub | ⊂ App Icon B |
| Order Hub | ⊂ App Icon B |
| Owner FAB | **disjoint** from Member App Icon |

**Product invariant:**

```text
AppIcon >= Bell
AppIcon >= BottomChat
AppIcon >= TradeHub + OrderHub + BottomChat + Bell
            (allowing missed/A overlap rules; no double-count rooms)
```

If launcher digit ≠ Cap set ≠ single HTTP authority field → PRODUCT FAIL.

---

## 5. Is current product A+B?

| Claim | Product answer |
|-------|----------------|
| Intended Gate contract | Yes — A + B_member |
| Live dual fields | `memberAppIcon` / projection `appIconTotal` ≈ A+B_member; `unifiedAttention.appIconTotal` still larger (includes owner rooms) | 
| User-visible truth | Launcher followed Cap **20**; payload also advertised **22** | 
| Product coherence | **FAIL** — one icon cannot mean two formulas |

So: **product requirement is A+B_member; live shipping still allows a second larger “unified” story.** That is not Product PASS.

---

## 6. Live evidence (asas55)

| Source | Value |
|--------|-------|
| Launcher DIBAY | **20** |
| Cap / projection (prior HTTP) | **20** |
| unifiedAttention.appIconTotal | **22** |
| Bottom Chat UI | **3** |
| Trade Hub UI | **2** |
| Order Hub UI | **14** |
| Bell | empty / 0 |

Rough room sum 3+2+14 = 19 (+ A0 + maybe missed) ≈ 20 — **launcher matches A+B_member room sum**, not unified 22. User still cannot reconcile why API offered 22.
