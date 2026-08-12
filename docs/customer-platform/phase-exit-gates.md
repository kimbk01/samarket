# Phase Exit Gates

**Status:** LOCK — required between every Phase  
**Rule:** Fail any gate → do not start the next Phase  

| Gate | Question | Evidence examples |
|------|----------|-------------------|
| **Product Gate** | Product contract (P1–P10 / App·Admin IA) violated? | Diff vs principles; IA screenshots |
| **Authority Gate** | SSOT still single per domain? | Writer/reader map; no new dual store |
| **Runtime Gate** | Android / iOS OK for this Phase scope? | Device logs / QA pack; **N/A** only for 0 / 1 / 1.5 with explicit note |
| **Admin Gate** | Operator path not worse? | Dashboard → queue → detail path still clear |
| **Regression Gate** | Prior in-scope behavior intact? | Smoke of previous Phase surfaces |
| **Cleanup Tag Gate** | Phase 1.5 tags current? | Diff of `phase1.5-cleanup-contract.md` for touched assets |

## Per-Phase completion block (copy)

```
Phase: __
Date: __
Product Gate: PASS | FAIL | N/A — evidence:
Authority Gate: PASS | FAIL | N/A — evidence:
Runtime Gate: PASS | FAIL | N/A — evidence:
Admin Gate: PASS | FAIL | N/A — evidence:
Regression Gate: PASS | FAIL | N/A — evidence:
Cleanup Tag Gate: PASS | FAIL | N/A — evidence:
Next Phase allowed: YES | NO
```

## Forbidden

- Skipping gates  
- Marking Runtime PASS without device evidence when UI/API shipped  
- Advancing while Cleanup Tag Gate fails  
