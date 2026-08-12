# O01 Park Status

**Parked:** 2026-08-03  
**Choice:** **B** — stop here; iPhone later; no Product PASS / HARD LOCK  
**Commit:** `3ba369255` — `feat(badge): project owner Operation O into Bell and App Icon`  
**Prod:** `samarket.vercel.app` → deployment after push (Ready)

---

## Locked verdict

| Gate | Status |
|------|--------|
| O Projection CODE | COMMITTED + DEPLOYED |
| Xiaomi O01 device | PASS |
| Samsung O01 device | PASS |
| iPhone O01 device | BLOCKED (verification path, not product FAIL) |
| **PRODUCT PASS** | **NOT DECLARED** |
| **HARD LOCK** | **NOT DECLARED** |

Evidence (Android): `.qa-logs/badge-o01-prod-2026-08-03/1785728954489/` (`VERDICT-RESCORED.md`)  
Evidence (iPhone block): `.qa-logs/badge-o01-prod-2026-08-03/iphone-o01-blocked/`

---

## What PASS means (Android only)

Same operation 1건:

- pending **+1**
- Top Bell / OwnerOp / `hub.orderAttention` / App Icon (incl. Cap `Badge.get`) **+1**
- accept → all **−1**

N11 · C01 paths: **not modified** in this commit.

---

## Why iPhone is BLOCKED (not product FAIL)

1. App launches to prod OK (iOS 26.6)
2. `ios_webkit_debug_proxy` page WS: **no Runtime/Page domains** → cannot evaluate Bell/hub/Badge.get
3. Native prefs readable (`capacitor.badge` = 19) but ≠ asas55 prod appIcon (~35) → session not proven asas55; inject needs Runtime

Unblock later (any one): working WK Runtime · manual asas55 login + Runtime · approved alternate surface path.

---

## DO NOT (while parked)

- Declare O01 Product PASS or HARD LOCK
- Treat local PASS as Product PASS
- Patch N11 / C01 “to finish O01”
- Bundle other Bell / Bottom / App Icon rebuild into this park

---

## Resume

Next badge work: **separate explicit instruction** only.  
Resume O01 Product PASS candidate: **A** — iPhone same O01 scenario only, after verification path opens.
