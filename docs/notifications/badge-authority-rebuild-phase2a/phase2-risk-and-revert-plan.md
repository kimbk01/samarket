# Phase 2 Risk & Revert Plan

---

## Failure mode to avoid

`059b7dcbd` changed A/B/Owner axes broadly → runtime B path FAIL → **full revert** (`1e2a560c1`).  
Phase 2 must use **per-slice** revert boundaries.

---

## Per-slice revert

| Slice | Forward | Revert scope | Must not touch |
|-------|---------|--------------|----------------|
| 2-1 | classifier/types | delete/disable module; tests | live projection |
| 2-2 | A filter + Bell | restore attention membership; inbox filters | RoomUnread writers |
| 2-3 | B_member formula | restore ChatAttention parts for member-only (still no owner if 2-4 done) | C writers |
| 2-4 | B_store surfaces | hub/FAB chat wiring | Member App Icon |
| 2-5 | C_store | commerce notify + ops badge | A digit |
| 2-6 | FCM/Native | payload field mapping | Domain room facts |

Feature gate / projection switch recommended: old Phase B vs new axis behind flag until runtime PASS per slice.

---

## DB migration policy

If C moves off `notification_events.user_id`:

1. Dual-read period: events still written but **not counted in A**; C from store attention tables/hub  
2. Backfill optional and **separate** commit from code switch  
3. Forward: new writes store-scoped; Backward: old rows ignored by A classifier  
4. Never require irreversible delete of events for rollback  

If no migration in early slices: **REWRITE counting only** (exclude owner meta from A) is lower risk — preferred for 2-2.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Multi-axis one PR | Forbidden |
| Heal scripts as digit fix | Forbidden |
| Shrink AppIcon 20 without truth audit | Forbidden |
| Staff unread ≠ owner_user_id | UNPROVEN — explicit Slice 2-4 spike |
| Dual list vs digit | A invariant tests in 2-2 |
| Native OEM race | Keep absolute set; 2-6 identity probes |

---

## Stop conditions (any slice)

- Contract test fail  
- Adjacent axis regresses  
- Need cross-slice emergency patch → **stop**, revert slice, re-plan
