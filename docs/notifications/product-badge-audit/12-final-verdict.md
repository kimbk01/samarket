# 12 — Final Verdict

**Mode:** STOP  
**Date:** 2026-08-03  
**Scope:** Product only (user-visible Badge)

---

## Invalidated declarations

The following are **void** for this audit:

- Authority PASS  
- Device PASS  
- Runtime PASS  
- Product PASS (prior)  
- Hard Lock  
- Code / smoke / API JSON PASS as product proof  

---

## Product definition (locked for judging)

1. **A** = Member Notification → Bell / NC / App Icon A term. Chat never.  
2. **B_member** = Conversation rooms (GD, Group, Trade, Customer SO) + missed once → Hubs / Bottom(GD+Group) / App Icon B.  
3. **B_store + C** = Owner only → never Member Bell / Bottom / App Icon.  
4. **Member App Icon = A + B_member** — **one** number from authority → Cap → launcher.  
5. Surfaces must tell one coherent story; chrome defects on badge screens fail product.

---

## Evidence that fails the product

| # | Failure |
|---|---------|
| 1 | App Icon dual truth: launcher/Cap **20** vs `unifiedAttention.appIconTotal` **22** (owner rooms in second formula) |
| 2 | Bell UX: popup expectation vs Gate 3 NC-only click path — product not signed off |
| 3 | Messenger list **red vertical stripe** on badge-bearing home — visual product defect |
| 4 | Payload still exposes two App Icon stories — user/support cannot trust “the” badge |
| 5 | Prior Device/Runtime PASS based on API smoke — not user-visible product |

Directionally correct pieces (Bottom=3, Trade Hub=2, Order Hub=14, Bell empty with A=0) do **not** override the above.

---

## Forbidden next steps (until product re-approval)

- Code patch / refactor  
- Rollback  
- Gate progress  
- Hard Lock  
- Declaring any PASS except a future explicit **PRODUCT PASS** after fixes + re-audit  

---

## Addendum — NC screenshot 2026-08-03 (user device)

User-visible `/notifications` (Gate 3 Step 8 NC):

| Defect | Product reading |
|--------|-----------------|
| Top chrome: 「주문 현황」「받은 문의」+ badge **16** overlapping NC header | Owner lite / store chrome leaking onto Member NC — shell FAIL |
| Green **+** FAB bottom-left | Global `FloatingAddButton` (`showFloat`) not excluded for `/notifications` — NC must not show write FAB |
| Empty A list + 「새로운 알림이 없습니다」 | Consistent with A=0 / Bell empty |
| Bottom Chat **3** | B surface OK; unrelated to NC empty |
| Safe-area / notch collision | Header stack broken |

Does not change verdict.

## Verdict

# PRODUCT FAIL
