# Risk and Recovery

**Mode:** PLAN ONLY

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Reverting `d6dbb91d4` “to clean A” | If mistaken | **Critical** — owner_intake Bell returns | **Forbidden** in plan; DELETE_AFTER_REBUILD only |
| P0 FCM revert → badge omit-on-0 on devices | Medium | Clear-to-0 regressions | Track in R6; do not number-force |
| Cap resume left after P0 | Certain | iOS stale badge continues | R6 mandatory; P0 ≠ Native done |
| Interim dual A during R1 | Certain | Digit/list still diverge | Freeze patches; short R1–R2 window |
| Hub cache dual path (c673) | Medium | Owner FAB stale/wrong | R5 REVIEW; keep invalidate |
| Dropping C migration | If panicked | Ops counts break | MIGRATION_KEEP |
| Treating harness PASS as R8 | Process | False PRODUCT PASS | REFERENCE_ONLY enforcement |
| Starting R1 before P0 approval | Process | Mixed trees | Hard stop in verdict |

---

## Recovery

| Failure | Recovery |
|---------|----------|
| P0 revert conflict | Abort; do not force; report files |
| P0 bad Production behavior | `git revert` the revert commits (restore e2cb) — still no baseline reset |
| R1 breaks Bell digit | Revert R1 commits only; contracts stay |
| Pollution detected (owner in Bell) | Stop; compare to KEEP exclusion predicates; **do not** reset to `1e2a560c1` |
| Need emergency “old app” | Use prior **deploy** pin if exists — not git reset of badge rebuild |

---

## Forbidden recovery moves

- `git reset --hard 1e2a560c1`
- Migration DROP
- Force badge 0 in DB
- max(attention, event) “fix”
- Re-add 중요대화 into Bell A to “match Kakao”
- Auto-declare PASS from old Slice logs
