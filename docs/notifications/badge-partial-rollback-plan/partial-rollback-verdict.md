# Partial Rollback Plan Verdict — REVOKED

**Superseded by:** `docs/notifications/badge-dependency-evidence/`

---

## Status

```text
PARTIAL ROLLBACK PLAN PASS  →  REVOKED
PARTIAL ROLLBACK PLAN       →  EVIDENCE INSUFFICIENT
P0 REVERT                   →  HOLD (not approved, not executed)
```

### Why revoked

1. PASS was declared without live ID-set proof and with overstated delete/revert certainty.  
2. P0 (`f438`/`e2cb`) is **proven unrelated** to Bell digit / list / popup code paths.  
3. `DELETE_AFTER_REBUILD` overstated dual-source proof as a delete schedule.

See evidence pack for dependency grades. **Do not execute P0 from this folder.**
