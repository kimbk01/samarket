# Badge Rollback Audit — First Bad Commit Analysis

**Mode:** AUDIT ONLY

---

## Question A — When did “full product FAIL” start?

**Not at Slice 2-6.**

Baseline `1e2a560c1` is documented as already contaminated:

- `owner_intake` counted into Bell + App Icon notification axis (phase0 / phase2a maps)
- Owner rooms included in Member App Icon room projection
- Runtime: `RUNTIME_PARTIAL_OR_FAIL`

Therefore **full reset to `1e2a560c1` is not a return to a healthy product.**

---

## Question B — Bell digit ≠ empty list

| Candidate first bad / responsible window | Evidence |
|------------------------------------------|----------|
| Pre-rebuild / Phase B | digit/list identity already fragile historically |
| `d6dbb91d4` (Slice 2-2) | Introduced A-only digit + A list filters — **runtime was declared PASS** but current empty-list vs digit>0 **forces revalidation** |
| `e2cb00ec8` (Slice 2-6) | **Ruled out** for Bell UI — no Bell/list/popup files; NativeBadgeSync **comment-only** |

**First-bad for Bell↔목록:** **UNPROVEN exact SHA**, but **window = Bell list/digit pipeline (Slice 2-2 era + readers)**, **not** Slice 2-6.

---

## Question C — App Icon Native Cap ≠ server App Icon

| Candidate | Evidence |
|-----------|----------|
| Pre-2-6 NativeBadgeSync absolute set + skip_same | Path existed before e2cb |
| `e2cb00ec8` | FCM resolver change only for push wire; Web→Cap path **unchanged logically** |
| Resume cache replay (iOS AppDelegate applyFromCapBadgeCache) | Audited earlier — resume does not re-fetch authority |

**iOS Cap lag cannot be pinned as DEFINITE regression introduced by e2cb.**  
Android Cap==web was measured PASS after 2-6 for Member App Icon echo.

---

## Question D — Samsung App Icon 23 / Bell 3

Under Slice 2-3+ contract this **can be correct**:

`App Icon = A + B_member`, `Bell = A only`  
→ Bell 3, App Icon 23 ⇒ B_member ≈ 20.

That is **not** automatic proof of Native corruption.  
The FAIL is **list empty under Bell 3**, and overall surface identity — not necessarily App Icon≠Bell.

---

## Summary

| Symptom | First-bad commit |
|---------|------------------|
| Owner/chat pollution at baseline | Already at `1e2a560c1` (pre-slice) |
| Bell digit vs empty list | **UNPROVEN SHA**; **not** `e2cb00ec8`; revalidate Slice 2-2 readers |
| Cap≠App Icon after chat | **UNPROVEN** as e2cb-caused; Web sync path comment-only in e2cb |
| FCM absolute wire | Introduced/adjusted in `e2cb00ec8` — separate from Bell UI |
