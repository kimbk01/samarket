# 04 — Dead Code Audit

> **Version:** 2026-07-05 · **Deletion forbidden** until all five conditions pass.

## Core distinction

| Category | Meaning | Action |
|----------|---------|--------|
| **Dead Code** | Zero production use | Delete only after 5-condition gate |
| **Structure violation** | Live imports, wrong SSOT role | Fix in M1b/M2 — **not** dead delete |

**Example:** `private-group-left-room-tombstone` is **live** (8+ imports) — wrong structure, **not** dead.

## Deletion approval gate (all required)

| # | Condition | Must be |
|---|-----------|---------|
| 1 | static import | 0 |
| 2 | dynamic import | 0 |
| 3 | production trace | 0 |
| 4 | test dependency | 0 |
| 5 | documentation dependency | 0 |

Until all YES → status is **candidate only**, not delete.

## Candidates

| Symbol / file | static | dynamic | prod trace | test | doc | Verdict |
|---------------|--------|---------|------------|------|-----|---------|
| `syncMessengerHomeAfterPrivateGroupLeave` | 0 | 0 | 0 | **1** (`sync-messenger-home-after-private-group-leave.test.ts`) | 0 | **Candidate — no delete** |
| `cm-main-thread-dev.ts` (deprecated barrel) | 0 | 0 | 0 | TBD | 0 | **Candidate — scan tests first** |
| `applyRoomSummaryPatched` | 0 | — | — | — | stale in `dibay-state-ownership-map.md` | **Already removed** — doc cleanup only |
| `private-group-left-room-tombstone` | 8+ | — | live | yes | — | **Live — structure violation** |
| `removePrivateGroupRoomFromMessengerHome` | 3+ | — | live | yes | — | **Live — cache Owner violation** |

## Live (do not delete)

- `friendship-resolver` path — 10+ imports
- `messenger-room-ui-store` — phase2 imports
- `remove-private-group-from-messenger-home.ts` — leave / phase2 chain

## M3 dead delete

Separate Red Team approval. M1a/M1b **must not** include dead file deletion.
