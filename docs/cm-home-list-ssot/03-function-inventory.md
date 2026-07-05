# 03 — Function Inventory (`service.ts`)

> **Version:** 2026-07-05 · **Do not split** until this inventory is approved and callers tagged.

## Summary

| Metric | Value |
|--------|-------|
| File | `lib/community-messenger/service.ts` |
| Lines | ~19,277 |
| Exported functions | **101** |
| Runtime | **Server Only** (no direct `components/` import; `getSupabaseServer`, `next/server`) |
| Client / Shared exports | **0** |

## Risk tiers (split order guidance)

| Risk | Count | Rule |
|------|-------|------|
| **Critical** | 14 | bootstrap · list · membership · leave · ensure room — **never split in M1a–M1b** |
| **High** | 22 | group lifecycle, read, trade list meta — M2+ only |
| **Medium** | 58 | message, friend, call session |
| **Low** | 7 | presence, search, diagnostics — earliest extract **candidates** |

## By domain

### Friend (23) — Medium

`acceptedPeerIdsFromCommunityFriendRows`, `addCommunityMessengerFriendSaved`, `buildCommunityMessengerFriendRequestsFromProfileMap`, `buildProfilesFromKnownRelations`, `cancelOutgoingCommunityMessengerFriendRequestByAddressee`, `cleanupCommunityMessengerFriendGraphOnBlock`, `ensureGeneralFriendDirectRoom` (**Critical**), `fetchBootstrapLiteSocialGraphSnapshot`, `friendshipAcceptedAtByPeerFromRows`, `hydrateProfilesLabelsOnlyWithMap`, `listCommunityMessengerBlockedProfiles`, `listCommunityMessengerFriendRequests`, `listCommunityMessengerFriends`, `profileDibaySubtitle`, `profileLabel`, `removeCommunityMessengerFriend`, `resolveCommunityMessengerUserForSocial`, `respondCommunityMessengerFriendRequest`, `respondIncomingCommunityMessengerFriendRequestByRequester`, `searchCommunityMessengerUsers`, `sendCommunityMessengerFriendRequest`, `toggleCommunityMessengerFavoriteFriend`, `toggleCommunityMessengerHiddenFriend`

### RoomCore (18) — Critical / High

`buildParticipantsByRoomMap`, `createEmptyBootstrapRoomsDiagnostics`, `dedupeParticipantUserIds`, `ensureCommunityMessengerDirectRoom` (**Critical**), `fetchMyRoomsPayload` (**Critical**), `getCommunityMessengerBootstrap` (**Critical**), `getCommunityMessengerBootstrapCritical` (**Critical**), `getCommunityMessengerRoomSnapshot`, `getCommunityMessengerSingleRoomSummaryForViewer` (**Critical**), `leaveCommunityMessengerRoom` (**Critical**), `listCommunityMessengerRoomMembersPage`, `markCommunityMessengerRoomAsRead` (High), `participantRowUserId`, `startCommunityMessengerDirectChat`, `summarizeRoomsBatchWithProfileMap` (**Critical**), `updateCommunityMessengerParticipantSettings`, `updateCommunityMessengerRoomArchiveState`, `updateCommunityMessengerRoomContextMeta`

### Group (16) — High

`createCommunityMessengerGroupRoom`, `createOpenGroupRoom`, `createPrivateGroupRoom`, `getOpenGroupJoinPreview`, `inviteCommunityMessengerGroupMembers`, `joinOpenGroupRoomWithPassword`, `kickCommunityMessengerGroupMember`, `listCommunityMessengerMyChatsAndGroups`, `listDiscoverableOpenGroupRooms`, `setCommunityMessengerGroupMemberRole`, `sliceGroupParticipantsForRoomBootstrap`, `transferCommunityMessengerGroupOwner`, `updateCommunityMessengerPrivateGroupNotice`, `updateCommunityMessengerPrivateGroupPermissions`, `updateOpenGroupRoomSettings`, `validateCommunityMessengerGroupTargets`

### Trade (4) — High

`enrichTradeContextForBootstrapSnapshot`, `ensureCommunityMessengerDirectRoomFromProductChat` (**Critical**), `hydrateTradeChatListContextMetaForRoomIds`, `runCommunityMessengerRoomTradeDiagnosticsParallelForE2e`

### Delivery (2) — Critical

`ensureCommunityMessengerDirectRoomFromStoreOrderChat`, `syncStoreOrderCommunityMessengerRoomId`

### Message (17) — Medium

`deleteCommunityMessengerVoiceMessage`, `editCommunityMessengerTextMessage`, `fetchCommunityMessengerVoicePlaybackBytes`, `findCommunityMessengerMessageByClientId`, `getCommunityMessengerRoomMessageById`, `hideCommunityMessengerMessageForMe`, `listCommunityMessengerMessageReactionParticipants`, `listCommunityMessengerRoomMessagesAfter`, `listCommunityMessengerRoomMessagesBefore`, `sendCommunityMessengerFileMessage`, `sendCommunityMessengerImageMessage`, `sendCommunityMessengerMessage`, `sendCommunityMessengerStickerMessage`, `sendCommunityMessengerVoiceMessage`, `sendCommunityPostShareMessage`, `softDeleteCommunityMessengerMessageForEveryone`, `toggleCommunityMessengerMessageReaction`

### Call (18) — Medium (LOCK — do not touch)

`appendCommunityMessengerCallStubMessage`, `buildBootstrapCallsFromPreloadedSnapshot`, `createCommunityMessengerCallLog`, `createCommunityMessengerCallSignal`, `deleteCommunityMessengerCallLog`, `downgradeCommunityMessengerCallSessionToVideo`, `getActiveDirectCallSessionForUser`, `getCommunityMessengerCallSessionById`, `getLiveDirectCallSessionForUser`, `listCommunityMessengerCallLogs`, `listCommunityMessengerCallSignals`, `listIncomingCommunityMessengerCallSessions`, `reconcileUserLiveCallSessions`, `resolveGroupCallSessionStatusAfterParticipantChange`, `sendIncomingCallPushBestEffort`, `startCommunityMessengerCallSession`, `updateCommunityMessengerCallSession`, `upgradeCommunityMessengerCallSessionToVideo`

### Presence (3) — Low

`getCommunityMessengerPresenceSnapshotsByUserIds`, `getCommunityMessengerServiceCacheFootprint`, `upsertCommunityMessengerPresenceSnapshot`

## Next inventory step (post-M2)

Per symbol: `caller count (rg)` · `server-only` · `bootstrap | home | room` tag before any file split.
