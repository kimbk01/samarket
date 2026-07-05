# 08 — Realtime Contract

> **Version:** 2026-07-05 · Module: `home/use-community-messenger-home-realtime-bootstrap-list.ts`.

## To-Be role: Event Only

RT emits **patch kinds** to Reducer. RT must not:

- HTTP fetch home-summary for list INSERT
- call `refresh(true)` that triggers critical_patch ADD (P0)
- `primeBootstrapCache` outside Reducer commit path

## Allowed RT → Reducer

| Signal | Reducer `kind` | Intent |
|--------|----------------|--------|
| message INSERT | `realtime_message_insert` | PATCH |
| participant unread | `local_unread` | PATCH |
| sender echo | `sender_local_echo` | PATCH |
| read ack | `local_unread`(0) | PATCH |

`patchBootstrapRoomListForRealtimeMessageInsert` — existing row only:

```text
idx < 0 → return rooms unchanged (Contract compliant)
```

## Forbidden chains (As-Is)

| Chain | Violation | Milestone |
|-------|-----------|-----------|
| RT miss → `scheduleHomeMissingRoomSummaryMerge` → `GET home-summary` → `merge_room_summary` | RT → INSERT | M1b+ |
| `scheduleHomeRealtimeRefresh` → `refresh(true)` → `critical_patch` `newRooms` | RT → ADD | P0; blocked by M1a reducer |
| `setData` + `primeBootstrapCache` in RT hook | RT → Cache | M2 |

## Reconnect contract

```
RT reconnect
  → apply PATCH kinds immediately
  → authoritative sync = HOME_SYNC full REPLACE (membership Owner)
  → critical_patch = PATCH ONLY (no ADD) — M1a enforces in reducer
```

Visibility: `noteHomeVisibilityRestored` / `shouldBlockSilentHomeSyncForVisibilityRestore` (`lite-merge-gate.ts`) — rate limit only; **ADD ban is independent**.

## Bus events (home list)

Handled in RT hook / cross-tab: `cm.home.merge_room_summary`, `cm.home.remove_room`, `cm.room.incoming_message`, `cm.room.message_sent`, `cm.room.read`, `cm.room.local_unread`, `cm.room.summary_patch`.

## M1a scope

**No changes** to realtime hook in M1a.
