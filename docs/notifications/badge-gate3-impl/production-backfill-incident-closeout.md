# Production Backfill Incident Closeout

**Status:** CLOSED (pending Deploy re-approval gate)  
**Gate 3 freeze baseline (unchanged):** `6c8e2c8eb`  
**Deploy candidate:** post-closeout re-freeze SHA (must include fixed apply logic)

## 1. Incident scope

| Field | Value |
| --- | --- |
| Cause | Second-run replan omitted `contentIdentitySeed` |
| Impact | 7 content-identity duplicate rows briefly inserted into canonical `notification_events` |
| Recovery | Deleted those **7 canonical** rows only |
| Legacy | `notifications` untouched (no delete / no semantic mutate) |
| Final canonical A (legacy-prefixed) | **789** |
| Current health | duplicate-in-A 0 · unknown 0 · contamination 0 · unsafe 0 · second-run inserts 0 |

### Timeline

1. Preflight matched approved dry-run (6580 / A789 / B2660 / C3059 / dup7 / Q65).
2. First-run inserted **789** (`legacy:notifications:*`).
3. Second-run planned **without** `contentIdentitySeed` → 7 collapsed trade-offer siblings re-entered `backfill_a` and were inserted (796).
4. Repair deleted the 7 content-identity duplicate canonical keys only → **789**.
5. Apply script updated to require seed on second-run; repair path kept separate.

### Actual duplicate legacy ids (repair targets)

```
legacy:notifications:d7b2b66b-f365-440d-94f9-3b3653f27cd1
legacy:notifications:85abc498-e09c-4e1e-b7ef-7a2847c3af5b
legacy:notifications:3fb6527d-9e3e-4ee2-bb96-69151b8d745b
legacy:notifications:042af49d-f9e5-4674-a8a5-e4d6d7d8f685
legacy:notifications:587cbd42-91e0-41b3-a849-daea71d1fb1d
legacy:notifications:bf9e29ed-6339-44a6-b989-4cee76685bd6
legacy:notifications:c9ad1dd4-c798-4422-a20a-92d8381b2c7d
```

Evidence:

- `.qa-logs/badge-gate3-live-dry-run/apply-preflight-1785717016851.json`
- `.qa-logs/badge-gate3-live-dry-run/apply-repair-verify-1785717092050.json`
- `.qa-logs/badge-gate3-live-dry-run/apply-final-verify-1785717121693.json`

## 2. Apply contract (post-incident)

Shared planner SSOT: `lib/notifications/badge-authority-rebuild/legacy-cutover-backfill.ts`

- `planBackfillFirstRun` — seed always passed (`new Set()` on cold first-run)
- `planBackfillSecondRun` — **requires** `contentIdentitySeed` from first plan
- `listRepairCandidatesFromCanonicalKeys` — repair-only; not used by apply insert path

Scripts:

| Script | Mutates Production? | Role |
| --- | --- | --- |
| `scripts/gate3-production-backfill-apply.ts` | INSERT only (gated) | Normal apply; **no DELETE** |
| `scripts/gate3-production-backfill-repair-verify.ts` | DELETE repair only (gated) | Incident repair; separated |
| `scripts/gate3-production-backfill-readonly-verify.ts` | **No** | Deploy gate read-only |

### Required invariants

1. dry-run / apply / verify use the same classifier + dedupe helpers.
2. Second-run does not invent a separate abbreviated plan.
3. Content-identity duplicates are excluded **before** INSERT (`toInsert` ∩ dupKeys = ∅).
4. Repair delete path is not reachable from normal apply.

### Forbidden

- First/second run with different dedupe implementations
- Apply-only temporary fields omitted from verify
- Adding seed only in verify
- Judging duplicates by count comparison alone

## 3. Regression coverage

`lib/notifications/badge-authority-rebuild/__tests__/production-backfill-incident-regression.test.ts`

- 7-fixture content-identity duplicates (actual Production dup legacy ids)
- First-run → 7 canonical winners; second-run with seed → 0
- Seed omitted → proposes 7 (FAIL mode / incident reproduction)
- dry-run/apply/verify disposition parity
- Repair candidates never include winners; healthy state repair = 0
- Planner does not mutate legacy fixture rows

## 4. Deploy re-approval

Declare **DEPLOY READY** only when all hold:

- Production read-only verify PASS
- proposed additional inserts = 0
- repair candidates = 0
- incident regression PASS
- final SHA = `origin/main`
- badge/backfill working tree clean
- deployed SHA includes fixed apply + seed helpers

Otherwise: **DEPLOY BLOCKED**.

## 5. Explicitly not declared

- Production Deploy
- Native / APK / iOS
- Device Runtime / Product PASS / Hard Lock
- Further Production data mutation
