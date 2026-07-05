# 14 — M2 Leave API Contract

> **Status:** 2026-07-05 — M2 **PASS-1** (Red Team). Committed after `refactor(cm): unify room leave flow across home and room`.
>
> **Scope:** Community Messenger self-leave — Home swipe, Room settings leave, legacy HTTP callers.

## Self-leave server contract (SSOT)

All **private_group self-leave** MUST converge on **`leaveGroupRoom`** (`markParticipantLeft` + `publishGroupRoomListBump`).

| Client entry | HTTP | Server handler |
|--------------|------|----------------|
| Home swipe (`private_group`) | `DELETE /api/community-messenger/group-rooms/{id}/participants` | `leaveGroupRoom` |
| Room leave (`private_group`) | `DELETE /api/community-messenger/group-rooms/{id}/participants` | `leaveGroupRoom` |
| Legacy / external (`private_group`) | `POST /api/community-messenger/rooms/{id}/leave` | `leaveGroupRoom` |

Non–`private_group` self-leave continues to use `POST /api/community-messenger/rooms/{id}/leave` → `leaveMessengerRoomUnified` (direct, trade, store_order, open_group).

### Why `POST /leave` branches for `private_group` only

Before M2, `POST /leave` for `private_group` used `leaveMessengerRoomUnified` (hard **DELETE** on `community_messenger_participants`), while the group API used `leaveGroupRoom` (**`left_at`** soft leave). Same product action, two implementations.

M2 keeps the branch so **every self-leave path** — including legacy `POST /leave` — uses one server implementation:

```text
Home swipe (private_group)  ──┐
Room leave (private_group)  ──┼──► leaveGroupRoom
POST /leave (legacy)        ──┘
```

**Do not revert** the `POST /leave` `private_group` branch without replacing it with another single SSOT; reverting would split self-leave across `leaveGroupRoom` and `leaveMessengerRoomUnified` again.

Implementation: `app/api/community-messenger/rooms/[roomId]/leave/route.ts` — `room_type === "private_group"` → `leaveGroupRoom`.

Client SSOT: `lib/community-messenger/home/messenger-home-room-leave-client.ts`.

## Post-leave client list contract (no tombstone)

After API success only:

1. `commitHomeListPatch({ kind: "remove_room" })` on React bootstrap state (when `setData` available).
2. `syncMessengerHomeAfterRoomLeave` — bootstrap cache prime + `invalidateRoomSnapshot`.

M1a/M1b unknown INSERT bans remain in force (`critical_patch`, `merge_room_summary`).

## Known existing verify failure (not M2)

`npm run verify:messenger-consistency-structural` may FAIL on baseline with:

- `home-list-patch.ts missing: mergeCallHistoryLists`
- `home-list-patch.ts missing: coalesceRoomSummarySnapshotRow`

**Cause:** verify script expects symbols inside `home-list-patch.ts`; implementation moved to other modules (`messenger-consistency-merge`, `merge-critical-home-sync-room-summary`, etc.) and `mergeCallHistoryLists` is not present anywhere in the repo. **Pre-existing gate / implementation drift — unrelated to M2 leave work.**

Track as **Known Existing Verify Failure** until the structural verify script is updated or symbols are re-wired.
