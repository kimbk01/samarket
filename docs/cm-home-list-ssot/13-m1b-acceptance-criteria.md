# 13 — M1b Acceptance Criteria

> **Version:** 2026-07-05 · **Status: SCOPE DEFINITION ONLY** — code change requires explicit **「M1b start」** after Red Team sign-off.
>
> **Prerequisite:** M1a committed (`39f9b3f4`) — **must not revert**.

## Purpose

**M1b is not a refactor.** It is the second safety gate (KV-2 / P2):

```text
Block forbidden transition: LEFT/NONE + ROOM_SUMMARY (merge_room_summary) → ACTIVE
```

Mechanism: `mergeBootstrapRoomSummaryIntoLists` must **not INSERT** when `summary.id` is absent from base `chats` ∪ `groups`.

### Root cause (As-Is)

| Priority | Path | Mechanism |
|----------|------|-----------|
| **P2** | RT miss → `scheduleHomeMissingRoomSummaryMerge` → `GET home-summary` → `merge_room_summary` | `mergeSummaryIntoDescSortedBucket` prepends absent id (`merge-bootstrap-room-summary-into-lists.ts` L43–59, L90–108) |
| **P2** | bus `cm.home.merge_room_summary` | same reducer kind |
| **P2** | compose / `requestMessengerHomeListMergeFromSummary` | same reducer kind |

**M1b does not change RT hook** — fixing the helper makes RT → `applyHomeListPatch({ kind: "merge_room_summary" })` a **no-op** for unknown ids.

## Relationship to M1a

| Milestone | Patch kind | Function | Forbidden transition |
|-----------|------------|----------|----------------------|
| M1a ✅ | `home_sync` `critical_patch` | `mergeCriticalRoomPatchesIntoLists` | LEFT/NONE + CRITICAL_PATCH → ACTIVE |
| M1b | `merge_room_summary` | `mergeBootstrapRoomSummaryIntoLists` | LEFT/NONE + ROOM_SUMMARY → ACTIVE |

M1a behavior **must remain** — M1b PR must not modify `mergeCriticalRoomPatchesIntoLists`.

## Frozen scope

### Allowed files (max 3)

| File | Required | Role |
|------|----------|------|
| `lib/community-messenger/home/merge-bootstrap-room-summary-into-lists.ts` | ✅ | Primary fix — absent id no-op |
| `tests/unit/home-list-patch.test.ts` | ✅ | `applyHomeListPatch` + `merge_room_summary` contract tests |
| `lib/runtime/__tests__/messenger-merge-sort-perf.test.ts` | ⚠️ If needed | Perf tests currently assume **new id insert** — update to **existing id patch** only |

**Max 3 files.** No `home-list-patch.ts` change unless Red Team explicitly expands scope (default: **forbidden** — helper-only fix).

### Forbidden (zero lines changed)

- `app/api/**`
- `lib/community-messenger/service.ts`
- `lib/community-messenger/bootstrap-cache.ts`
- `use-community-messenger-home-bootstrap.ts`
- **`use-community-messenger-home-realtime-bootstrap-list.ts`** — RT hook
- `private-group-left-room-tombstone.ts` / tombstone paths
- `leave-private-group*.ts` / leave client
- `CommunityMessengerHome.tsx`
- `home-list-patch.ts` — **default forbidden** (M1a contract must not regress)
- Dead file deletion
- Native / Call / Push
- `supabase/migrations/**`
- **M1a revert** (`mergeCriticalRoomPatchesIntoLists` `newRooms` restoration)

## Allowed code changes

| Change | Allowed |
|--------|---------|
| Early return `data` when `summary.id` ∉ base chats ∪ groups | ✅ |
| CONTRACT comment: PATCH ONLY — no absent id INSERT | ✅ |
| Existing id: coalesce + sort merge **unchanged** | ✅ |
| Cross-bucket id move (same id in wrong bucket) **unchanged** | ✅ (rare type change) |

## Forbidden code changes

| Change | Forbidden |
|--------|-----------|
| Re-enable INSERT for absent id | ❌ |
| Tombstone filter as substitute for contract | ❌ |
| RT hook / `scheduleHomeMissingRoomSummaryMerge` edit | ❌ |
| New CREATE path via summary | ❌ |
| `home_sync replace` / bootstrap REPLACE behavior | ❌ |

## Required tests

### TC-M1b-01 — unknown id not inserted (tombstone-independent)

```text
Given: base.chats = [room("a")], groups = []
When:  applyHomeListPatch(base, {
         kind: "merge_room_summary",
         summary: room("unknown-summary"),
       }, "realtime")
Then:  chats.length === 1
       chats[0].id === "a"
       "unknown-summary" ∉ chats ∪ groups
       next === base OR reference-stable no-op
```

Variants: `private_group` summary into empty `groups` with only unrelated chat in `chats`; trade `contextMeta` on unknown id.

### TC-M1b-02 — direct helper unit (recommended)

```text
Given: emptyBootstrap([room("a")])
When:  mergeBootstrapRoomSummaryIntoLists(data, summary("unknown"))
Then:  result.chats.length === 1
       result === data (reference equal preferred)
```

### TC-M1b-03 — existing row still patches (regression)

Existing test **must pass**:

- `merges room summary via realtime source` (id `"a"` in base)

### TC-M1b-04 — M1a suite regression

All M1a tests in `home-list-patch.test.ts` **must pass** unchanged intent:

- unknown `critical_patch` not inserted
- `home_sync replace` server ADD still works

### TC-M1b-05 — perf test alignment (if file touched)

`messenger-merge-sort-perf.test.ts` must not assert **new id `"c"` insert**. Rewrite to patch **existing** id sort behavior only.

## PASS conditions (all required)

| # | Condition | Verification |
|---|-----------|--------------|
| P1 | Unknown id `merge_room_summary` insert = **0** | TC-M1b-01, 02 |
| P2 | Existing id summary merge regression = **0** | TC-M1b-03 |
| P3 | M1a critical_patch tests regression = **0** | TC-M1b-04 |
| P4 | `npm run verify:messenger-home-list-owner` | PASS |
| P5 | `npx tsc --noEmit` | PASS |
| P6 | `git diff --name-only` ⊆ allowed files (≤3) | PR |
| P7 | Forbidden paths diff = **0** | PR |
| P8 | M1a `mergeCriticalRoomPatchesIntoLists` unchanged | `git diff` review |

**M1b incomplete** if any P1–P8 fails. **Do not start M2.**

## Verification commands (M1b minimum)

```bash
git diff --name-only
npm run verify:messenger-home-list-owner
vitest run tests/unit/home-list-patch.test.ts
vitest run lib/community-messenger/home/__tests__/patch-bootstrap-room-list-truth-version.test.ts
vitest run lib/runtime/__tests__/messenger-merge-sort-perf.test.ts   # if touched
npx tsc --noEmit
```

## Completion report template (mandatory)

```text
git diff --name-only
git diff --stat
Changed files count ≤ 3? (yes/no)
Forbidden file diff = 0? (yes/no)
M1a regression (critical_patch tests) — PASS/FAIL
TC-M1b-01 unknown merge_room_summary — PASS/FAIL
verify:messenger-home-list-owner — PASS/FAIL
npx tsc --noEmit — PASS/FAIL
M2 blocked until explicit approval? YES
```

## Explicitly NOT solved by M1b

| Item | Milestone |
|------|-----------|
| RT `scheduleHomeMissingRoomSummaryMerge` removal / refactor | M1b+ or M2 |
| RT → `refresh(true)` → critical_patch chain | M1a mitigated; full RT contract M2 |
| Cache direct prime / remove | M2 |
| Tombstone layer removal | post-SSOT |
| Leave API unification | M2 (separate approval) |
| Dead code deletion | 5-condition gate |
| `stash@{0}` 21-file patch restore | **separate decision** |
| E2E swipe-leave product PASS | M2 + QA |

## Red Team sign-off (before code)

- [ ] This document merged / reviewed
- [ ] Explicit **「M1b start」** instruction
- [ ] Allowed file list ≤3 agreed
- [ ] `home-list-patch.ts` touch forbidden unless exception documented
- [ ] `messenger-merge-sort-perf.test.ts` update strategy agreed
- [ ] M1a commit `39f9b3f4` must remain intact

## Approval statement

```text
M1b = merge_room_summary absent roomId INSERT ban only.
Primary: merge-bootstrap-room-summary-into-lists.ts
No RT / tombstone / leave / cache / API / M1a revert.
```

## State transition satisfied on PASS

```text
LEFT/NONE + ROOM_SUMMARY → ACTIVE   ❌ blocked
NONE + ROOM_SUMMARY → NONE          ✅ (no-op)
ACTIVE + ROOM_SUMMARY → ACTIVE      ✅ (patch merge)
```
