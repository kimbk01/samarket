# 07 — Cache Contract

> **Version:** 2026-07-05 · Module: `lib/community-messenger/bootstrap-cache.ts`.

## To-Be role: Storage Only

| Operation | Owner | Allowed callers | Forbidden |
|-----------|-------|-----------------|-----------|
| **peek** (read) | `bootstrap-cache.ts` | Bootstrap hook, Reducer (`prev===null` fallback) | list semantic mutate |
| **prime** (write) | `bootstrap-cache.ts` | **Reducer commit single path** (target) | RT hook, leave client, remove-private-group |
| **clear** | `bootstrap-cache.ts` | logout, pull-refresh, 401 | — |
| **restore** | sessionStorage → peek → `bootstrap_full_seed` | Bootstrap mount | ADD left / non-member ids |

## Legal flow (To-Be)

```
peek → Bootstrap Load → applyHomeListPatch(REPLACE/seed) → setData → prime(same snapshot)
```

## Forbidden flows (As-Is)

| Path | Violation |
|------|-----------|
| `removePrivateGroupRoomFromMessengerHome` → `primeBootstrapCache` | Cache performs REMOVE semantics |
| RT hook multiple `primeBootstrapCache` | Cache mirrors RT without Authority gate |
| leave client tombstone + prime | Cache substitutes membership SSOT |

## Tier keys

| Key | Purpose |
|-----|---------|
| `samarket.messenger.bootstrap.v1` | full |
| `samarket.messenger.bootstrap.critical.v1` | critical |
| `samarket.messenger.bootstrap.minimal.v1` | minimal / lite |

TTL: 5 minutes (`TTL_MS`). Stale allowed for first paint (SWR).

## Contract clauses

1. Cache performs **no** merge, INSERT, REMOVE on list semantics.
2. `prime` payload must equal Reducer output snapshot (same as `setData`).
3. Restore must apply membership / server bootstrap filters — mismatch rows **DROP**, never ADD left rooms.
4. critical / minimal / full tiers: no direct cross-tier list patch.

## P4 root cause

`peekBootstrapCache` → `bootstrap_full_seed` can re-inject left rooms when session stale. Resolved by server REPLACE authority + restore DROP rules (M2), not tombstone.

## M1a scope

**No changes** to `bootstrap-cache.ts` or any `primeBootstrapCache` call sites in M1a.
