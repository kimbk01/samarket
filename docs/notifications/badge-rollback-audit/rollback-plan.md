# Badge Rollback Audit — Plan (approval-gated)

**Status:** PLAN ONLY — **do not execute** until explicit user approval  
**Audit verdict:** `NO ROLLBACK — SOURCE/FILTER FIX REQUIRED`  
**See:** `rollback-verdict.md`

---

## Immediate (already done this phase)

1. Commit impact map  
2. Surface source map  
3. First-bad analysis  
4. Options + verdict  

**Not done / forbidden this phase:** code patch · git revert · deploy · number force · PRODUCT/HARD LOCK

---

## If user approves next work (recommended order)

### Step 1 — Digit ↔ list identity audit (no axis rollback)

Same account, same moment:

| Probe | Action |
|-------|--------|
| Server A | `badge-count` → `memberUnreadNotificationCount` / `bellTotal` / explain keys |
| Bell digit | Header store `badgeCountTotal` |
| List | `/api/me/notifications` raw rows **before** client filter + after `filterMemberNotificationAInboxRows` + each pushKind tab |
| Popup | Messenger summary `importantCount` vs digit |

Stop when first filter/API mismatch is proven. **Fix only that reader/filter after separate approval.**

### Step 2 — App Icon vs Bell (contract check)

If App Icon ≫ Bell: verify `B_member` explain equals delta.  
Do **not** treat Bell≠App Icon as Slice 2-6 failure.

### Step 3 — Cap / lastApplied freshness (separate)

Only after Web surface `appIconTotal` matches server.  
Do **not** open FCM revert until Web path is proven stale independent of FCM.

### Step 4 — Slice 2-6 FCM revert (optional, separate gate)

Execute **only if** approved after FCM-specific regression proof:

```text
# illustrative — do not run now
git revert e2cb00ec8
# then decide f438f37e2 (test-align) with or after
```

Does **not** claim to fix Bell↔list.

### Step 5 — Never without explicit order

- Full reset to `1e2a560c1`
- Revert Slice 2-2 / 2-3 / 2-4 / 2-5 as “quick fix”
- Working-tree clean / force push
- PRODUCT PASS / HARD LOCK

---

## Decision table for approver

| Question | Answer from audit |
|----------|-------------------|
| Full rollback now? | **NO** |
| Patch now? | **NO** (this phase) |
| Slice 2-6 REQUIRED revert? | **NO** |
| Slice 2-6 optional later? | **YES** (FCM wire only) |
| A/B/C keep? | **YES lean** — fix readers/filters |
| Declared verdict | **NO ROLLBACK — SOURCE/FILTER FIX REQUIRED** |
