# Commit Revert Order

**Mode:** PLAN ONLY — do not execute until approval  
**Principle:** File/symbol judgment · not “whole Slice keep/drop”

---

## Critical rule

| Action | Allowed? |
|--------|----------|
| `git reset --hard 1e2a560c1` | **FORBIDDEN** |
| Revert all of 2-2…2-5 as one block | **FORBIDDEN** (revives owner/chat pollution) |
| Revert 2-6 wire commits | **PLANNED** (first mechanical revert) |
| Replace A dual-source in place (R1–R2) | **PLANNED** after revert gate (DELETE_AFTER_REBUILD) |
| Patch more filters on current dual A | **FORBIDDEN** |

---

## Phase P0 — Mechanical git reverts (approval-gated)

Execute **newest first** (linear, no conflict expected on badge-only files):

| Order | SHA | Title | Decision | Surfaces | Migration dep |
|-------|-----|-------|----------|----------|---------------|
| 1 | `f438f37e2` | align Native/FCM wire tests | **REVERT** | tests / identity scan | none |
| 2 | `e2cb00ec8` | echo MemberAppIconTotal Native/FCM | **REVERT** | FCM always-send, resolver, dispatcher, ack, campaign, comments | none |

**After P0:** FCM returns toward pre-2-6 badge encoding; Cap resume stale path **still exists** (native AppDelegate) → must be R6 DELETE_AFTER_REBUILD, not “done.”

---

## Phase P1 — Do NOT git-revert (quarantine → rebuild)

| SHA | Title | Decision | Why not revert |
|-----|-------|----------|----------------|
| `d6dbb91d4` | separate member bell authority | **DELETE_AFTER_REBUILD** | Revert restores owner_intake Bell |
| `1a814053b` | mark-all member stores | **DELETE_AFTER_REBUILD** | Same dual bridge; rebuild mark-all on `AUnreadEventIds` |
| `06bab8001` | member communication projection | **KEEP direction** | Owner exclusion + room units needed |
| `f3dd1bb5d` | room read reconcile | **KEEP** | Cursor clear |
| `5ee177ca6` | store communication projection | **KEEP** | B_store room unit / exclusion |
| `c78dd7a1e` | hub cache invalidate | **KEEP / REVIEW in R5** | Stale mitigation |
| `c673ac444` | hub cache hit refresh | **KEEP / REVIEW in R5** | Dual-path — validate |
| `aa2d46b09` | C_store authority | **KEEP** (+ MIGRATION_KEEP) | Action Complete |
| `3b8f836c5` | docs 2-5 runtime | REFERENCE_ONLY | docs only |
| `ca86a20c1` | foundation | **KEEP** | Contracts/tests |

---

## Per-commit manifest rows

### `e2cb00ec8` — REVERT

| Field | Value |
|-------|-------|
| Files | `native-fcm-member-app-icon-authority.ts`, `fcm-data-payload-contract.ts`, `notify-push-dispatcher.ts`, `domain-badge-read-ack.ts`, `campaign-send-user.ts`, `read-order-chat.ts` (badge resolve), `NativeBadgeSync.tsx`, `sync-native-badge-count.ts`, tests/docs |
| Symbols | `resolveMemberAppIconTotalForNativeFcm`, always-send `fields.badgeCount` |
| Surface | FCM / Native wire |
| Effect | Removes 2-6 absolute-always wire; does **not** fix Bell/list |
| Revert order | #2 (after f438) |

### `f438f37e2` — REVERT

| Field | Value |
|-------|-------|
| Files | `member-communication-b-projection.test.ts`, `badge-native-runtime-identity.ts` |
| Effect | Test/identity align for 2-6 |
| Revert order | #1 |

### `d6dbb91d4` — DELETE_AFTER_REBUILD (no git revert)

| Field | Value |
|-------|-------|
| Files | `member-notification-a-projection.ts`, UI filters, HTTP wire, mark-all bridge, projection builders |
| Keep from it | owner_intake / chat / marketing **exclusion predicates** |
| Replace with | `AUnreadEventIds` single reader |

### `06bab8001` / `f3dd1bb5d` — KEEP + membership rebuild

| Field | Value |
|-------|-------|
| Keep | B room sets, missed, owner exclusion, read cursor |
| Rebuild | Export ID membership with totals |

### `5ee177ca6` + cache fixes — KEEP / R5 review

### `aa2d46b09` — KEEP + migration KEEP

---

## Suggested execution command shape (DO NOT RUN YET)

```bash
# After explicit approval only — order newest first
git revert --no-edit f438f37e2
git revert --no-edit e2cb00ec8
# STOP — do not revert d6dbb91d4 / 06bab8001 / aa2d46b09
# Then begin R1 AUnreadEventIds implementation (new commits)
```

---

## Popup / Cap (outside Slice SHAs)

| Item | Action |
|------|--------|
| `important_room` in CM Home | DELETE_AFTER_REBUILD in R2 (no git revert SHA) |
| `applyFromCapBadgeCache` resume | DELETE_AFTER_REBUILD in R6 (native files; may need dedicated revert/PR) |
