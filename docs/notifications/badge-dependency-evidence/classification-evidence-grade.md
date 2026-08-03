# KEEP / REVERT / DELETE — Evidence Grades

Prior plan used `DELETE_AFTER_REBUILD` and P0 `REVERT` as if confirmed.  
This file re-grades each claim.

**Grades:** PROVEN_DEP · CONTRADICTED · CANDIDATE · UNPROVEN

---

## Re-grade table

| Prior tag | Item | Evidence | Re-grade |
|-----------|------|----------|----------|
| REVERT P0 | `e2cb00ec8` for Bell/list/popup | No files; empty ∩ with 2-2 | **CONTRADICTED** as Bell fix |
| REVERT P0 | `e2cb00ec8` for FCM always-send | File diff PROVEN | **CANDIDATE** FCM-only revert (separate goal) |
| REVERT P0 | `f438f37e2` | Tests follow e2cb | **CANDIDATE** only with e2cb FCM goal |
| DELETE_AFTER_REBUILD | attention-key digit | Digit = `attentionKeys.length` PROVEN; dual vs list PROVEN | **CANDIDATE** replace/unify — **not** “scheduled delete proven” |
| DELETE_AFTER_REBUILD | list A filter | Separate importer PROVEN | **CANDIDATE** unify under one set |
| DELETE_AFTER_REBUILD | popup important_room | Disjoint source PROVEN; **pre-baseline** | **CANDIDATE** product boundary — **not** Slice revert |
| DELETE_AFTER_REBUILD | mark-all legacy dual | Dual table PROVEN | **CANDIDATE** collapse |
| DELETE_AFTER_REBUILD | Cap resume re-echo | Pre-e2cb PROVEN | **CANDIDATE** Native order change — **not** e2cb revert |
| KEEP | classifier / identity / units | Imported by A/B/C paths | **PROVEN_DEP KEEP** |
| KEEP | B owner exclusion / C Action | Used by Hub + App Icon builders | **PROVEN_DEP KEEP** |
| KEEP | no full reset `1e2a560c1` | Phase0 pollution docs + baseline maps | **PROVEN_DEP** (do not reset) |
| REVERT | entire `d6dbb91d4` | Would remove A filters that exclude owner_intake | **CONTRADICTED** as safe rollback |

---

## Why `DELETE_AFTER_REBUILD` was overstated

Proven: **dual-source / dual-unit exists.**  
Not proven: that the only valid next step is “delete symbol X after rebuild Y,” versus rewrite-in-place, flag quarantine, or different SSOT shape.

Correct language until rebuild design is approved:

```text
REBUILD_CANDIDATE — dual authority proven; removal/replace pending design approval
```

---

## Why P0-only was overstated

| Goal | Does P0 suffice? |
|------|------------------|
| Fix Bell digit ≠ list | **No** — CONTRADICTED |
| Fix popup 중요대화 | **No** — pre-baseline, not in e2cb |
| Fix Cap resume stale | **No** — Cap path not in e2cb |
| Undo FCM always-send | **Maybe** — CANDIDATE only |

---

## Dependency proof method used

1. `git show --name-only <sha>`  
2. Empty file intersection check (`d6dbb` ∩ `e2cb`)  
3. `git merge-base --is-ancestor` for Cap / popup vs e2cb / baseline  
4. Symbol importers via ripgrep  
5. Read count/unit lines in projection + mark-all  

**Not used:** speculation from prior PASS docs · device re-measure this turn.
