# Evidence Gate Verdict

**Date:** 2026-08-03  
**Mode:** EVIDENCE ONLY · no revert · no patch

---

## Declared status

```text
PARTIAL ROLLBACK PLAN : EVIDENCE INSUFFICIENT
P0 REVERT 승인        : 보류
```

**Not declared:** PLAN PASS · ROLLBACK EXECUTED · CODE/RUNTIME/PRODUCT PASS · HARD LOCK

---

## What is proven

1. **Bell digit and full list are not the same ID authority** — keys vs event rows; unread vs read+unread; digit ignores list sync.  
2. **Popup 중요대화 is not A inbox** — room synthetic IDs; exists since before badge rebuild baseline.  
3. **mark-all touches legacy `notifications` + `notification_events`.**  
4. **`e2cb00ec8` / `f438f37e2` do not modify Bell digit, list, or popup sources.**  
5. **Cap resume re-echo predates Slice 2-6.**  
6. **Full git revert of Slice 2-2 is unsafe** relative to owner_intake exclusion (would remove those filters).

---

## What is not proven

1. Live FAIL-account: exact DigitEventIds vs list unread ids (mechanism of empty list).  
2. Live App Icon 23 membership ID dump.  
3. That reverting e2cb improves any Bell surface.  
4. Final delete schedule for each REBUILD_CANDIDATE symbol.  
5. That design is “100% correct and only implementation wrong” beyond clear-rule alignment already argued — **implementation fracture is proven; contract perfection is still a product judgment, not a new proof this turn.**

---

## Answers to user’s three demands

| Demand | Result |
|--------|--------|
| Each commit → which screens | See `commit-surface-impact.md` — **done for Slice ladder + popup/Cap ancestry** |
| Same event ID set per screen? | **No structurally** — `surface-id-set-comparison.md`; live dump pending |
| KEEP/REVERT/DELETE = dependency analysis? | Re-graded — see `classification-evidence-grade.md`; prior DELETE/P0 overstated |

---

## Safe next steps (still no auto-revert)

1. Optional: same-account **ID dump script/read-only probe** (digit explain eventIds vs list ids vs mark-all candidates) — audit only.  
2. Only after that + explicit approval: choose revert scope (likely **not** P0-for-Bell).  
3. Rebuild design for single `AUnreadEventIds` remains a **candidate**, not a locked delete list.

---

## Relation to prior plan folder

`docs/notifications/badge-partial-rollback-plan/` remains historical draft.  
Its `PARTIAL ROLLBACK PLAN PASS` is **revoked** (`00-verdict-revocation.md`).  
Do not execute P0 from that folder.
