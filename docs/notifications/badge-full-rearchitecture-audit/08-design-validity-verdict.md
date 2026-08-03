# 08 — Design Validity Verdict

**Mode:** AUDIT ONLY

---

## Criteria check

### DESIGN VALID (local fix only) — conditions

| Condition | Met? |
|-----------|------|
| A/B/C matches product clear rules | **YES** |
| Each axis one clear origin | **PARTIAL** — C has RPC + residual events; A has events + legacy |
| Surfaces differ only by projection | **NO** — popup not A projection; digit≠list unit |
| Bell mismatch only reader/filter | **NO** — structural dual-unit + dual popup |
| Fix scope limited | **NO** |
| Keep migrations/data as-is | Mostly yes for C RPC |

→ **Local-fix-only REJECTED.**

### DESIGN VALID, IMPLEMENTATION COLLAPSED — conditions

| Condition | Met? |
|-----------|------|
| A/B/C concept matches product | **YES** (see `00`) |
| Dual-source / cache / override accumulated | **YES** (see `04`) |
| Surfaces use different readers | **YES** (see `03`) |
| Partial patches break other surfaces | **HIGH RISK** |
| Hard to keep slices as-is | **YES** for A surface layer |

→ **MATCHES.**

### DESIGN INVALID — conditions

| Condition | Met? |
|-----------|------|
| Bell vs list product definitions different from start | **NO** — product required same set; implementation diverged |
| Chat/notice/ops classification wrong vs user | **NO** — Phase1 table matches |
| Identity cannot express member/store | **NO** — model can; residual writers violate |
| Room vs message unit wrong for product | **NO** — product wants both |
| App Icon formula wrong | **NO** — matches restored demand |

→ **DESIGN INVALID REJECTED** (axes/formulas stand; implementation/surface wiring does not).

---

## Declared design verdict

# DESIGN VALID — IMPLEMENTATION REBUILD REQUIRED

**Meaning:** Keep the restored A/B/C product contract and App Icon formula.  
Do **not** treat current Slice stack as product-locked. Rebuild the **implementation layer** (especially A digit≡list≡popup≡mark-all identity, legacy collapse, Cap freshness, residual owner_intake writer routing) so surfaces share proven ID sets.

**Not claimed:** that a one-file Bell filter patch is enough.  
**Not claimed:** that git reset to `1e2a560c1` is correct.
