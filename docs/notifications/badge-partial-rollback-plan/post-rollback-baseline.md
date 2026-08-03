# Post-Rollback Baseline (target after P0 + quarantine)

**Mode:** PLAN — describes **desired** state after approved P0 + explicit quarantine commits  
**Not claimed:** product healthy · CODE/RUNTIME/PRODUCT PASS

---

## Baseline definition (section 9)

After partial rollback preparation, baseline MUST satisfy:

| Requirement | How achieved |
|-------------|--------------|
| Product need not be perfect | Interim FAIL OK |
| Duplicate authority writers/readers **removed or quarantined** | P0 removes 2-6 dual FCM wire; R1–R2 remove A dual (not in P0 alone) |
| New A single-source implementable | Contracts KEEP; A projection marked DELETE_AFTER_REBUILD |
| Owner/chat pollution **not revived** | No revert of 2-2/2-3/2-4/2-5 |
| Migration compatibility | C migration KEEP |
| Each rebuild slice independently revertable | New R* commits only; no amend of history |

---

## State after P0 only (2-6 reverted)

| Item | State |
|------|-------|
| FCM always-send 0 | Gone (pre-2-6 omit-when-zero likely) |
| Cap resume re-echo | **Still present** (native) |
| A digit attention keys | **Still present** |
| List event-row filter | **Still present** |
| Popup 중요대화 | **Still present** |
| B_store exclusion / C Action | **Still present** (good) |
| owner_intake in Bell | **Still filtered** (good) |
| Product PASS | **No** |

→ P0 alone is **not** sufficient baseline for R1 start criteria “duplicate A authority removed.”  
**R0 quarantine** (feature flags / dead-code fences / docs lock) may run **before** R1 code, still without “filter patches.”

---

## Full post-prep baseline (P0 + R0 quarantine gates)

Before writing new A SSOT code:

1. Document LOCK: no Slice PASS auto-inherit (`partial-rollback-verdict.md`).
2. Forbidden list active: no max(digit,list), no popup chat re-mix patches, no number force.
3. Contracts/tests 2-1 green as **contract-only**.
4. Owner exclusion + C RPC still in tree.
5. Explicit list of DELETE_AFTER_REBUILD symbols owned by R1–R2/R6.

**Then** R1 may start.

---

## What “success” looks like at baseline (not product PASS)

```text
KEEP:     A/B/C contracts, identity, B/C pure projections, C migration
REVERTED: e2cb00ec8 + f438f37e2
QUARANTINED (scheduled delete): attention-key digit SSOT, dual list filter authority,
                                popup important_room as Bell A, legacy mark-all,
                                Cap resume as authority
ABSENT:   full reset to 1e2a560c1
ABSENT:   new filter patches on dual A
```
