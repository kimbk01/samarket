# 05 — Event Contract

> **Version:** 2026-07-05 · Events map to Reducer intents; conflicts resolved by Authority / Priority / Replay.

## Pipeline

```
Event (source) → [Authority gate] → Reducer kind → Intent → Cache mirror → UI
```

## Domain events → Reducer

| Event | Source (Owner) | Reducer `kind` | Intent | Allowed | As-Is violation |
|-------|----------------|----------------|--------|---------|-----------------|
| MEMBERSHIP_LEAVE | Server API | *(no direct list write)* | — | Server Only | client `remove_room` + cache drop |
| BOOTSTRAP_LOAD | Server | `bootstrap_full_seed` / `bootstrap_apply_full` | REPLACE | Server set only | stale cache seed P4 |
| HOME_SYNC_FULL | Server | `home_sync` `roomMode=replace` | REPLACE | Server authoritative | — |
| HOME_SYNC_CRITICAL | Server | `home_sync` `roomMode=critical_patch` | **PATCH ONLY** | existing id only | **newRooms INSERT P0** |
| ROOM_SUMMARY | Server | `merge_room_summary` | **PATCH ONLY** | id exists | **INSERT if absent P2** |
| RT_MESSAGE | RT | `realtime_message_insert` | PATCH | preview/unread | OK (`idx<0` no-op) |
| RT_LOCAL_ECHO | Client | `sender_local_echo` | PATCH | | OK |
| RT_UNREAD | RT / bus | `local_unread` | PATCH | | OK |
| CLIENT_REMOVE | Client | `remove_room` | REMOVE | after server leave 2xx | optimistic before leave |
| CACHE_RESTORE | Local | `bootstrap_full_seed` from peek | REPLACE(seed) | membership filter | left re-inject |
| TRADE_META | Client hydration | `trade_context_meta` | PATCH | meta only | OK |

## Multi-tab bus mapping

| Bus `type` | Contract event | Reducer | Intent |
|------------|----------------|---------|--------|
| `cm.home.merge_room_summary` | ROOM_SUMMARY | `merge_room_summary` | PATCH ONLY |
| `cm.home.remove_room` | CLIENT_REMOVE | `remove_room` | REMOVE |
| `cm.room.incoming_message` | RT_MESSAGE | `realtime_message_insert` | PATCH |
| `cm.room.message_sent` | RT_LOCAL_ECHO | `sender_local_echo` | PATCH |
| `cm.room.summary_patch` | ROOM_SUMMARY partial | `room_update` | PATCH |
| `cm.room.read` / `local_unread` | RT_READ / RT_UNREAD | `local_unread` | PATCH |
| `cm.home.social_sync` | HOME_SYNC | via `refresh` | REPLACE |

## Authority / Priority / Replay

Higher priority wins on conflict for the same `roomId`.

| Priority | Authority | Event / kind | Replay |
|----------|-----------|--------------|--------|
| P0 | **Server** | MEMBERSHIP_LEAVE | YES |
| P1 | **Server** | BOOTSTRAP full / `bootstrap_apply_full` | YES |
| P2 | **Server** | HOME_SYNC `replace` | YES |
| P3 | **Server** | HOME_SYNC `critical_patch` (PATCH-only) | YES† |
| P4 | **Server** | ROOM_SUMMARY / `merge_room_summary` | YES† |
| P5 | **RT** | `realtime_message_insert` | NO (message id dedupe) |
| P6 | **Client** | local_echo, `local_unread`, trade_meta | NO |
| P7 | **Client** | `remove_room` | NO |
| P8 | **Local** | CACHE_RESTORE / peek seed | NO |

† Safe only when PATCH-only contract holds (no ADD).

## Conflict rules

1. Same `roomId`, same tick: highest Authority wins; Server REPLACE > RT PATCH.
2. **LEFT membership vs any Local/RT ADD:** membership LEFT always wins — DROP all list INSERT.
3. Stale cache vs fresh Server: Server P1+ always wins.
4. Replay: only `YES` events may be reapplied idempotently.

## Design prohibitions (contract level)

1. ROOM_SUMMARY · HOME_SYNC_CRITICAL · RT_MESSAGE → **ADD forbidden** for unknown `roomId`.
2. MEMBERSHIP_LEAVE → Reducer REMOVE only after server 2xx or authoritative REPLACE excludes id.
3. CACHE_RESTORE → **NEVER ADD** non-member / left ids.
4. CREATE_ROOM list ADD only via Server REPLACE / bootstrap authoritative payload.
