# 12 — M1a Acceptance Criteria

> **Version:** 2026-07-05 · **Status: APPROVED FOR SCOPE DEFINITION** — code change requires **explicit separate “M1a start”** message after docs merged.

## Purpose

**M1a is not a refactor.** It is the first safety gate:

```text
Block forbidden transition: LEFT/NONE + HOME_SYNC critical_patch → ACTIVE
```

Mechanism: `mergeCriticalRoomPatchesIntoLists` must **not INSERT** unknown `roomId` via `newRooms`.

## Frozen scope

### Allowed files (max 2)

| File | Required |
|------|----------|
| `lib/community-messenger/home-list-patch.ts` | ✅ |
| `tests/unit/home-list-patch.test.ts` | ✅ |

### Forbidden (zero lines changed)

- `app/api/**` — API change forbidden  
- `lib/community-messenger/service.ts`  
- `lib/community-messenger/bootstrap-cache.ts`  
- `use-community-messenger-home-bootstrap.ts`  
- `use-community-messenger-home-realtime-bootstrap-list.ts`  
- `private-group-left-room-tombstone.ts`  
- `leave-private-group*.ts` / leave client  
- `merge-bootstrap-room-summary-into-lists.ts` — **M1b**  
- `CommunityMessengerHome.tsx`  
- Dead file deletion  
- Native / Call / Push  
- `supabase/migrations/**`  

## Allowed code changes

| Change | Allowed |
|--------|---------|
| Remove / disable `newRooms` loop in `mergeCriticalRoomPatchesIntoLists` | ✅ |
| DROP unknown incoming ids on `critical_patch` | ✅ |
| Trace: `droppedStale` / stats / CONTRACT comment | ✅ |

## Required tests

### TC-M1a-01 — unknown id not inserted (**tombstone-independent**)

```text
Given: base.chats = [room("a")], groups = []
When:  applyHomeListPatch(base, {
         kind: "home_sync",
         chats: [room("unknown-x")],
         roomMode: "critical_patch",
       }, "home-sync")
Then:  chats.length === 1
       chats[0].id === "a"
       "unknown-x" ∉ chats ∪ groups
```

Repeat or parameterize for `direct`, `private_group`, trade `contextMeta`, delivery — **without** `markPrivateGroupRoomLeftLocally`.

### TC-M1a-02 — existing row still patches

Existing test **must pass**:

- `home_sync critical_patch preserves richer trade meta`

### TC-M1a-03 — row count stable on PATCH

```text
Given: base contains id
When:  critical_patch updates lastMessage / unread
Then:  row count unchanged; fields merged
```

### TC-M1a-04 — REPLACE still authoritative

Existing tests **must pass**:

- `remove_room`
- `home_sync replace` (server ADD/REMOVE allowed on replace — not M1a regression)

### TC-M1a-05 — full suite

```bash
vitest run tests/unit/home-list-patch.test.ts
```

All tests **PASS** (including tombstone tests — unchanged behavior).

## PASS conditions (all required)

| # | Condition | Verification |
|---|-----------|--------------|
| P1 | Unknown id critical_patch re-insert = **0** | TC-M1a-01 |
| P2 | Existing critical_patch row merge regression = **0** | TC-M1a-02, 03 |
| P3 | trade / group / delivery create via **replace** regression = **0** | existing replace/seed tests |
| P4 | `npm run verify:messenger-home-list-owner` | PASS |
| P5 | `npx tsc --noEmit` | PASS |
| P6 | `git diff --name-only` ⊆ 2 allowed files | PR |
| P7 | Forbidden paths diff = **0** | PR |

**M1a incomplete** if any P1–P7 fails. **Do not start M1b.**

## Completion report template (mandatory)

```text
git diff --name-only
git diff --stat
Changed files count ≤ 2? (yes/no)
Forbidden file diff = 0? (yes/no)
vitest run tests/unit/home-list-patch.test.ts — PASS/FAIL
verify:messenger-home-list-owner — PASS/FAIL
npx tsc --noEmit — PASS/FAIL
M1b blocked until explicit approval? YES
```

## Explicitly NOT solved by M1a

| Item | Milestone |
|------|-----------|
| `merge_room_summary` INSERT | M1b |
| RT → home-summary merge | M1b+ |
| Cache direct prime / remove | M2 |
| Tombstone removal | post-SSOT |
| Leave API unification | M2 (separate approval) |
| E2E swipe-leave 100% | M1b/M2 + QA |
| Dead code deletion | 5-condition gate |

## Red Team sign-off (before code)

- [x] Docs 01–12 fixed in `docs/cm-home-list-ssot/`  
- [ ] Explicit **“M1a start”** instruction  
- [ ] TC-M1a-01 without tombstone dependency agreed  
- [ ] KV-2–5 untouched in M1a agreed  

## Approval statement

```text
M1a = critical_patch unknown roomId INSERT ban only.
2 files max. No tombstone / leave / cache / RT / API changes.
```
