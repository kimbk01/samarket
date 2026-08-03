# Badge Phase 1 Test Report

**Date:** 2026-08-02  
**HEAD:** `1e2a560c102cc3605a2ef29dcf68ccda0bd08a14` (`1e2a560c1`)  
**Command:**

```bash
npx vitest run lib/notifications/badge-authority-rebuild/__tests__/phase1-authority-contract.test.ts
```

**Result:** 36 passed / 0 failed  

---

## Artifacts

| Path | Role |
|------|------|
| `lib/notifications/badge-authority-rebuild/phase1-authority-contract.ts` | Pure contract (not imported by product runtime) |
| `lib/notifications/badge-authority-rebuild/__tests__/phase1-authority-contract.test.ts` | Contract tests |

Product runtime importer check: only the test file references the contract module (`rg` over `lib/`, `components/`, `app/`).

Phase 0 docs: **unchanged**.

Tracked product badge files (`chat-notification-attention-projection.ts`, `build-notification-badge-projection.ts`, `domain-app-icon-badge.ts`, `projection-authority.ts`, writers, FCM, Native): **unchanged**.

---

## Required cases covered

| Requirement | Test |
|-------------|------|
| owner_intake ∉ A | `owner_intake is never member A / Bell eligible` |
| owner_intake ∉ Bell | same + classification `store_new_order.bell = 0` |
| store new order = C | `owner_intake / store_new_order is C not A` |
| customer→owner message = B | `customer→owner message is B not C` |
| multi-store B/C split | `keeps multi-store B/C independent` |
| 20 messages → App Icon B = 1 | `one room with 20 messages → App Icon B = 1` |
| two rooms → App Icon B = 2 | `two rooms → App Icon B = 2` |
| Bottom Chat GD+Group only | `Bottom Chat = General + Group rooms only` |
| Trade/Order hubs only | same test projects Trade/Customer hubs |
| trade/order status = A | classification cases |
| marketing A/B/C = 0 | classification + FCM marketing |
| persistent notice = A | `service_notice` |
| missed call once per call_id | missed call tests |
| C ∉ App Icon | `App Icon = A + B only; C forbidden` |
| App Icon = A+B only | same |
| user_id ≠ store_id | identity tests |
| message vs room named units | room vs message + branded helpers |
| Bell mark-all ≠ B/C | `Bell mark-all-read clears A only` |
| room read ≠ A/C (delta only B) | room read delta −1 |
| owner accept ≠ A/B | `owner order accept changes C only` |

---

## Legacy status (carried forward — not PASS)

| Item | Status |
|------|--------|
| Legacy DIBAY standalone APK | **NOT FOUND** |
| Kakao/Daangn/Baemin/Yogiyo device measurement | **NOT EXECUTED** |
| Publicly documented pattern comparison | **DOCUMENTED** |
| Legacy runtime parity | **NOT PROVEN** |

---

## Remaining items after product lock (2026-08-02)

| Item | Status |
|------|--------|
| Store B in Member App Icon | **LOCKED EXCLUDE** |
| Store C in Member / Native App Icon | **LOCKED EXCLUDE / BLOCK** |
| KEEP/ROUTE/DELETE of Phase B runtime | → Phase 2A |
| Unread cursor truth method | → Phase 2A |
| Implementation slices | → Phase 2A |

| Gate | Status |
|------|--------|
| A/B/C exclusive | PASS (contract tests) |
| member/store identity split | PASS |
| owner chat B ≠ owner ops C | PASS |
| Bell=A / AppIcon=A+B / C excluded | PASS |
| message vs room units | PASS |
| increase/read/delete/process contracts | PASS (pure) |
| FCM transport ≠ authority | PASS |
| Required contract tests | **36 PASS** |
| Product runtime code unchanged | **YES** |

**Declaration:** `PHASE 1 AUTHORITY CONTRACT PASS`

**Not declared:** CODE PASS · RUNTIME PASS · PRODUCT PASS · HARD LOCK · Phase 2 start
