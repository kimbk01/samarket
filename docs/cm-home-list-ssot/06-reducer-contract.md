# 06 — Reducer Contract (`applyHomeListPatch`)

> **Version:** 2026-07-05 · Single list mutate entry: `lib/community-messenger/home-list-patch.ts`.

## CONTRACT header (code)

```text
CONTRACT: list 행 변경은 본 모듈 applyHomeListPatch 만.
직접 setData 로 chats/groups mutate 금지.
```

## Intent definitions

| Intent | Meaning | Allowed `kind` |
|--------|---------|------------------|
| **ADD** | New `roomId` row in list | `bootstrap_full_seed` (initial), `bootstrap_apply_full`, `home_sync` **replace** only |
| **REMOVE** | Drop row | `remove_room`, `home_sync` **replace** (server set diff) |
| **PATCH** | Merge existing id | `critical_patch`, `merge_room_summary`*, RT kinds, `trade_context_meta`, … |
| **REPLACE** | Full chats/groups from server | `bootstrap_full_seed`, `home_sync` `replace` |

\* To-Be: `merge_room_summary` must not ADD (M1b).

## Cross rules (mandatory)

```text
PATCH  → ADD forbidden
PATCH  → REMOVE forbidden (separate REMOVE intent)
REPLACE → server payload only
REMOVE  → membership confirmed
```

## Pre-conditions

| Intent | Pre-condition | On failure |
|--------|---------------|------------|
| **PATCH** | `roomId` ∈ base.chats ∪ base.groups | no-op + trace (`droppedStale`) |
| **PATCH** | membership valid OR row already ACTIVE | LEFT → DROP |
| **PATCH** | version / truth coalesce rules | stale field drop |
| **REMOVE** | `roomId` exists (no-op OK) | |
| **REMOVE** | server leave 2xx OR bus remove (To-Be) | |
| **REPLACE** | payload Authority ≥ Local | skip if lower |
| **ADD** | server authoritative path only | forbid client/PATCH/cache |

## Post-conditions

| Intent | Post-condition |
|--------|----------------|
| All success | no duplicate `roomId` across chats ∩ groups |
| **PATCH** | row count unchanged for that patch |
| **PATCH** | `lastMessageAt` desc sort maintained |
| **PATCH** | `unreadGuardApplied` traced when guard merges |
| **REMOVE** | id ∉ chats ∧ ∉ groups |
| **REPLACE** | list set = server payload ∩ membership filter |
| **REPLACE** | `tabs.chats` / `tabs.groups` = lengths |
| **Commit** | `setData(next)` and `primeBootstrapCache(next)` same snapshot (target) |
| **LEFT invariant** | membership LEFT ⇒ id ∉ list |

## `kind` matrix (To-Be)

| `kind` | Intent | ADD | REMOVE |
|--------|--------|-----|--------|
| `bootstrap_full_seed` | REPLACE/seed | server/cache filtered | — |
| `bootstrap_apply_full` | REPLACE-merge | server incoming | ids not in server |
| `home_sync` replace | REPLACE | server | server |
| `home_sync` critical_patch | **PATCH** | **forbidden** | **forbidden** |
| `merge_room_summary` | **PATCH** | **forbidden (M1b)** | forbidden |
| `realtime_message_insert` | PATCH | forbidden | forbidden |
| `remove_room` | REMOVE | forbidden | allowed |

## As-Is violations (milestones)

| Location | Violation | Fix |
|----------|-----------|-----|
| `mergeCriticalRoomPatchesIntoLists` `newRooms` (~L298–311) | PATCH performs ADD | **M1a** |
| `mergeBootstrapRoomSummaryIntoLists` absent id | PATCH performs ADD | **M1b** |
| `applyHomeListPatch` `primeBootstrapCache` (~L925) | Reducer writes cache | M2 |
| tombstone filters in reducer | patch layer | remove after SSOT |

## M1a contract test (required)

```text
Given: base without roomId X
When:  home_sync critical_patch includes X
Then:  X ∉ list; row count unchanged; existing rows still merge
```

Must **not** rely on tombstone for generic unknown id (use plain DM/trade/group types).
