# 01 — Ownership Matrix

> **Version:** 2026-07-05 · grep / file-path evidence.

## Terms

| Term | Meaning |
|------|---------|
| **Owner** | Sole write authority for a domain |
| **Reader** | Read-only consumer |
| **Writer** | Module that mutates the same field in production |
| **Reducer** | `applyHomeListPatch` (`lib/community-messenger/home-list-patch.ts`) |

## To-Be (target SSOT)

| Domain | Owner | Reader | Writer (allowed) | Mutability |
|--------|-------|--------|------------------|------------|
| **Membership** (`left_at`, active participant) | **Server DB** + leave API | Home, Room | **Server only** | Server Only |
| **Room list** (`chats` / `groups` row set) | **Reducer** (`applyHomeListPatch`) | Home UI derive, cache peek | Reducer **one path** | Patch kinds only |
| **Room summary** (preview, meta, unread fields) | **Server** (bootstrap, home-sync, home-summary) | Reducer, RT | Reducer merge only | Server authoritative; patch = merge |
| **Unread (per room)** | Server row + `local-read-guard` | Reducer | Reducer internal merge | Guard TTL; logout clear |
| **Unread (hub total)** | Reducer output `tabs` | Badge bridge | Reducer only | Derive from list |
| **Bootstrap network load** | `use-community-messenger-home-bootstrap` | Reducer | Load hook → patch kind emit | Load only |
| **Realtime events** | `use-community-messenger-home-realtime-bootstrap-list` | Reducer | RT → patch kind emit | Event only |
| **Bootstrap cache** | `bootstrap-cache.ts` | Bootstrap, Reducer | **Read-through**; write = reducer result | Storage only |
| **Open room messages** | `messenger-realtime-store` + snapshot cache | Phase1 UI | Room scope only | Separated from list |

## As-Is (audit evidence — conflicts)

| Domain | Documented owner | Actual writer count | Conflict |
|--------|------------------|---------------------|----------|
| Room list | `applyHomeListPatch` | **8+** | ⚠️ |
| Membership | Server (intent) | Server + **client cache/critical direct drop** | ⚠️ |
| Cache | `bootstrap-cache.ts` | **6+ primers** (RT hook, reducer, leave client…) | ⚠️ stale re-inject (P4) |
| RT | Event | Event + **`refresh(true)`** + summary HTTP | ⚠️ P0·P2 chain |

### List writers (production)

| # | Module | API | Conflict |
|---|--------|-----|----------|
| 1 | `home/use-community-messenger-home-bootstrap.ts` | `setData`, `mergeHomeSyncIntoBootstrap` | Primary load + sync |
| 2 | `home/use-community-messenger-home-realtime-bootstrap-list.ts` | `setData`, `applyHomeListPatch`, `primeBootstrapCache` | RT + silent refresh |
| 3 | `components/community-messenger/CommunityMessengerHome.tsx` | `setData` | Manual merge |
| 4 | `merge-discoverable-open-groups-client.ts` | `setData` | Open groups |
| 5 | `use-trade-chat-list-meta-hydration.ts` | `setData` | Trade meta |
| 6 | `home/refresh-messenger-home-social-client.ts` | `setData` | Social sync |
| 7 | `home/remove-private-group-from-messenger-home.ts` | cache + `applyHomeListPatch` | Cache Owner violation |
| 8 | `group/leave-private-group-room-client.ts` | tombstone + optimistic remove | Patch layer — not SSOT |

**Stale doc note:** `docs/dibay-state-ownership-map.md` §A.2 references `applyRoomSummaryPatched` — **rg 0**, removed.

## Root cause priority (re-insert paths)

| Priority | Path | Mechanism |
|----------|------|-----------|
| **P0** | `refresh(silent)` → home-sync `critical_patch` | `mergeCriticalRoomPatchesIntoLists` **newRooms** — inserts unknown id (`home-list-patch.ts` ~L298–311) |
| **P1** | +400ms silent full replace | `mergeRoomListsWithVersionGuard` + server full list |
| **P2** | RT miss → `scheduleHomeMissingRoomSummaryMerge` → home-summary → `merge_room_summary` | `mergeBootstrapRoomSummaryIntoLists` insert |
| **P3** | Group leave → `publishGroupRoomListBump` | Triggers P2 |
| **P4** | `bootstrap-cache` stale → `bootstrap_full_seed` | Cache re-inject |
