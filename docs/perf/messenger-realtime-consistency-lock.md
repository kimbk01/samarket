# Messenger Realtime Consistency Lock (MRC1)

Versioned merge + cross-tab sync on top of snapshot-first tracks (HS2, RB1, HUB BADGE, ODN1).

**Purpose:** prevent unread flicker, stale snapshot overwrite, cross-tab desync, reconnect resurrection.

## Merge rule (client)

All unread/badge/room summary merges use `resolveMessengerUnreadMerge` in
`lib/community-messenger/consistency/messenger-consistency-merge.ts`.

1. **Local read guard** (20s TTL) — optimistic read beats stale snapshot without newer `lastMessageAt`.
2. **Monotonic truth version** — per-room ms from `lastMessageAt` / snapshot `updated_at`; older payload cannot raise unread.
3. **Duplicate event discard** — same RTT key within 30s ignored.
4. **Reconnect preserve** — before silent home-sync refresh, `noteReconnectTruthPreserve()`; stale reconnect payload discarded.
5. **Read ack final** — server PATCH success extends guard via `refreshLocalReadGuardServerAck`.

## Snapshot version ownership

| Surface | Version source | Module |
|---------|----------------|--------|
| home-sync | counter `updated_at` + row `lastMessageAt` | `home-sync-snapshot.ts` |
| room bootstrap | counter `updated_at` | `room-bootstrap-snapshot.ts` |
| hub badge | counter `updated_at` | `owner-hub-badge-snapshot.ts` |
| room list row | `lastMessageAt` ISO ms | `messenger-consistency-version.ts` |

No DB `snapshot_version` column — ISO ms monotonic compare only.

## Optimistic read guard

- `lib/community-messenger/read/local-read-guard.ts`
- Set on room enter, bus read, mark-read success
- Applied in: critical_patch, silent_delta, replace home-sync, merge_room_summary, participant unread delta

## Cross-tab propagation

Channel: `samarket:cm-consistency` (`messenger-consistency-cross-tab.ts`)

Events:
- `cm.consistency.mark_all_read`
- `cm.consistency.active_room`
- `cm.consistency.snapshot_version`
- `cm.consistency.reconnect_preserve`

Messenger bus (`samarket:community-messenger`) still handles `cm.room.read`, message_sent, etc.

## Reconnect rule

- `scheduleHomeRealtimeRefresh` → `broadcastMessengerReconnectPreserveCrossTab` + truth preserve
- Silent home-sync only (no legacy bootstrap, no full reload)
- Stale payload: `shouldDiscardReconnectPayload(incomingVersionMs)`

## Forbidden patterns

- Object.assign unordered unread merge on list rows
- Stale snapshot row raising unread after read ack
- Reconnect full bootstrap / legacy fallback
- Per-tab independent stale home-sync replace without version guard
- Polling-only unread refresh
- setTimeout masking for badge flicker

## Regression guards

Runtime: `lib/community-messenger/consistency/messenger-consistency-regression-guard.ts`

Log tags: `[messenger-consistency-analysis]`, `[messenger-consistency-regression-alert]`

Verify: `npm run verify:messenger-consistency-structural`

## Wiring map

| Path | Guard |
|------|-------|
| home-sync critical_patch | `merge-critical-home-sync-room-summary.ts` |
| home-sync replace | `home-list-patch.ts` `mergeRoomListsWithVersionGuard` |
| silent_delta | `merge-community-messenger-silent-delta.ts` |
| merge_room_summary | `merge-bootstrap-room-summary-into-lists.ts` |
| participant unread RT | `use-community-messenger-home-realtime-bootstrap-list.ts` |
| cross-tab read/mark-all | `messenger-consistency-cross-tab.ts` |
| active room | `messenger-realtime-store.ts` `setActiveRoomId` |

## Verification (MRC1 PASS checklist)

1. A tab list / B tab room open — read on B → A badge drops (bus + consistency channel)
2. New message inactive room — unread +1; active room at bottom — no unread bump (existing RT store)
3. mark-all-read cross-tab — all rows unread 0, no resurrection within guard TTL
4. reconnect silent refresh — no legacy fallback; stale row discarded when version regresses
5. home-sync TTL stale serve — guard prevents unread resurrection after read
6. hub badge resync after list merge — `requestMessengerHubBadgeResync` unchanged contract

Structural PASS: instrumentation + merge wiring + verify script green (manual UI scenarios ▲).
