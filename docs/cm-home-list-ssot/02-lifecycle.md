# 02 — Lifecycle Matrix

> **Version:** 2026-07-05 · per room type: Create → Join → Message → Leave → Delete → Refresh → Reconnect → Realtime → Bootstrap → Restore.

## Common axes

| Stage | Primary entry | List effect | Membership SSOT |
|-------|---------------|-------------|-----------------|
| **Create** | Server ensure / POST rooms | REPLACE or summary merge | Server INSERT participant |
| **Join** | Invite / open join | bootstrap / summary | Server |
| **Message** | RT `realtime_message_insert` | PATCH preview | — |
| **Leave** | `leaveMessengerRoomUnified`, `markParticipantLeft` | REMOVE or server REPLACE | `left_at` / DELETE |
| **Delete** | Server soft/hard | home-sync exclude | Server |
| **Refresh** | `refresh()` / pull | `home_sync` replace / critical_patch | Server lists |
| **Reconnect** | RT stable → `scheduleHomeRealtimeRefresh` | **P0** silent critical_patch risk | — |
| **Realtime** | bump / message / bus | patch kinds | — |
| **Bootstrap** | `GET bootstrap` lite/full/critical | `bootstrap_full_seed` / `apply_full` | RPC `left_at is null` |
| **Restore** | `peekBootstrapCache` / sessionStorage | **P4** stale seed | cache ≠ membership |

## Reconnect / Restore (previously under-documented)

| Trigger | Code | Contract |
|---------|------|----------|
| `visibilitychange` / `pageshow` | `lite-merge-gate.ts` — `noteHomeVisibilityRestored` | Blocks silent sync briefly; **ADD ban is always on** |
| RT reconnect | `scheduleHomeRealtimeRefresh` → `refresh(true)` | Authoritative = full REPLACE; critical = PATCH-only |
| Mount restore | `peekBootstrapCache` → `bootstrap_full_seed` | LEFT ids must DROP |

---

## Direct DM (`direct` / friend)

| Stage | Entry | List |
|-------|-------|------|
| Create | `ensureGeneralFriendDirectRoom` ← `POST /api/community-messenger/rooms` | summary / bootstrap |
| Leave | `POST .../rooms/[id]/leave` → `leaveMessengerRoomUnified` | server filter; **P0 re-insert risk** |
| Refresh | `mergeHomeSyncIntoBootstrap` | replace / critical_patch |

## Private / Open Group

| Stage | Entry | Notes |
|-------|-------|-------|
| Create | `createGroupRoom` / `POST group-rooms` | |
| Leave | **Dual:** `DELETE .../group-rooms/.../participants` **or** `POST .../leave` | Owner `owner_cannot_leave` |
| Post-leave client | `removePrivateGroupRoomFromMessengerHome` | Cache direct mutate (As-Is violation) |
| Bootstrap filter | migration `20260705120000_cm_bootstrap_hide_left_blocked_participants.sql` | `left_at is null` |

## Trade (`product_chat`)

| Stage | Entry | List |
|-------|-------|------|
| Create | `createOrGetChatRoom`, `ensureCommunityMessengerDirectRoomFromProductChat` | `requestMessengerHomeListMergeFromSummary` |
| Leave | unified trade + legacy `POST /api/chat/rooms/.../leave` | P0 same |
| Meta | `use-trade-chat-list-meta-hydration` | `trade_context_meta` patch |
| Policy | `chat-room-list-lifecycle-policy.ts` | Completed trade: 7d visible then HIDDEN (derive) |

## Delivery / Store order (`store_order`)

| Stage | Entry | List |
|-------|-------|------|
| Create | `ensureStoreOrderMessengerRoom`, `POST /rooms` + `storeOrderId` | bootstrap |
| Leave | No dedicated API — unified `leaveMessengerRoomUnified` | P0 same |
| Policy | Same 7d commerce hide policy | derive only |
