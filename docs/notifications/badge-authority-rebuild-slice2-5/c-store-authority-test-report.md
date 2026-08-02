# Slice 2-5 — C_store Authority Contract Test Report

**Date:** 2026-08-03  
**HEAD:** `c673ac444c274440a2c48ee70a4dc9a70a54348b`  
**Command:**

```bash
npx vitest run lib/notifications/badge-authority-rebuild/__tests__/c-store-authority-contract.test.ts
```

**Result:** **26 / 26 PASS**

---

## Coverage vs required cases

| Required case | Covered |
|---------------|---------|
| NEW_ORDER_PENDING → C_store | YES |
| REFUND_REQUESTED → C_store | YES |
| CANCEL_REQUESTED → C_store (GAP_ADD) | YES |
| OWNER_CHAT_UNREAD → B_store | YES |
| owner_intake row ≠ C truth | YES |
| store identity only | YES |
| owner user identity fails | YES |
| screen open no decrease | YES |
| notification read no decrease | YES |
| accept complete decreases | YES |
| reject complete decreases | YES |
| refund resolve decreases | YES |
| cancel resolve decreases | YES |
| re-complete no extra decrease | YES |
| re-receive no extra increase | YES |
| Member Bell forbidden | YES |
| Member App Icon forbidden | YES |
| Owner Chat forbidden | YES |
| B_store message no C change | YES |
| max() dual authority forbidden | YES |
| review UNKNOWN_BLOCKED | YES |
| cooking/delivery OUT_OF_BADGE | YES |
| store A ≠ store B | YES |
| notification delete no C change | YES |
| inquiry resolve / chat read split | YES |

---

## Scope of code under test

| Path | Role |
|------|------|
| `lib/notifications/badge-authority-rebuild/c-store-authority-contract.ts` | Pure contract + in-memory ledger |
| `__tests__/c-store-authority-contract.test.ts` | Pure tests |

**Not imported / not modified:** Hub API, Bell projection, App Icon, FCM, Native, SQL, UI, `notifyStoreOwner*`, B_store / A_member / B_member product paths.

---

## Verdict input

Pure contract tests **PASS** → eligible for `SLICE 2-5 C_STORE AUTHORITY CONTRACT PASS`.
