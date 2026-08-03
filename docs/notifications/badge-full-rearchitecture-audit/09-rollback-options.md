# 09 — Rollback Options (comparison only · not executed)

**Mode:** AUDIT ONLY · no revert run

---

## Option map (section 11)

| ID | Name | Revert commits | Keep | DB migrations | Prod impact | Errors fixed | Errors revived | Rebuild difficulty | Risk |
|----|------|----------------|------|---------------|-------------|--------------|----------------|-------------------|------|
| A | NO ROLLBACK — LOCAL SOURCE/FILTER FIX | none | all slices | keep | low deploy | maybe empty list only | leaves popup dual, legacy mark-all, Cap | low | **High incomplete** — rejected by design verdict |
| B | PARTIAL IMPLEMENTATION ROLLBACK | e.g. `e2cb00ec8` ± cache commits selectively | A/B/C contracts + most slices | keep | medium | FCM wire issues only | little for Bell/list | medium | Medium — **does not fix A identity** |
| C | SLICE 2-2~2-6 IMPLEMENTATION ROLLBACK, CONTRACT KEEP | `d6dbb91d4`…`f438f37e2` (impl) | Phase1 contracts / 2-1 tests ideally | keep C migrations or reverse carefully | **high** | removes slice bugs | **owner_intake Bell, owner rooms App Icon** return | high | **High** — returns to known FAIL |
| D | FULL BADGE REBUILD ROLLBACK TO PRE-IMPLEMENTATION | reset toward `1e2a560c1` | almost nothing of slices | keep DB as-is | **very high** | none product | **full baseline pollution** | n/a | **Unacceptable** as “stable” |
| E | CONTRACT + IMPLEMENTATION FULL RESTART | wide | none | possibly redesign identity | extreme | clean slate later | all interim | extreme | Only if DESIGN INVALID — **not selected** |
| F | INSUFFICIENT EVIDENCE | — | — | — | — | — | — | — | Live ID dumps missing for App Icon 23 membership — **not blocking** architecture verdict |

---

## Fit to design verdict

Design = **VALID, IMPLEMENTATION REBUILD REQUIRED**

| Option | Fit |
|--------|-----|
| A | Too weak |
| B | Useful as **surgical** piece inside rebuild (e.g. FCM) — not whole answer |
| C | Tempting for clean rewrite base — **revives baseline FAIL** unless rewrite lands immediately |
| D | Forbidden by baseline evidence |
| E | Overkill vs design validity |
| F | Incomplete for live membership only |

**Preferred rollback class for separate verdict:** **PARTIAL ROLLBACK** — selective, approval-gated, subordinate to forward A-surface rebuild; **not** full return to `1e2a560c1`.
