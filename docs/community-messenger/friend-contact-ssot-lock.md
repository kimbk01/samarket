# Friend Contact SSOT LOCK — mutual request (Bundle 6 revised)

**Status:** LOCK revised (2026-10-24 · §2 묶음 6 Owner G1·G2)  
**Authority:** Product contract — mutual friend request → accept → both Contact rows

## Product model

```text
FRIEND ADD = MUTUAL REQUEST → ACCEPT
FRIEND REQUEST PENDING = community_friend_requests.status=pending
FRIEND ACCEPT = atomic RPC cm_accept_friend_request
  → status=accepted + BOTH user_social_relations.friend rows (A→B and B→A)
FRIEND REJECT = status=rejected (no friend rows)
OUTGOING PENDING = CTA「수락 대기 중」
INCOMING PENDING = center popup +「받은 친구 요청」list (DB refetch recoverable)
POPUP DISMISS ≠ REJECT (X / back / outside / navigate closes UI only)
EXISTING CONTACT ROWS = no backfill / no forced mutualization
```

## SSOT

| Concern | Table | Rule |
|---------|-------|------|
| Friend (after accept or legacy unilateral save) | `user_social_relations` `relation_type=friend` | `owner_user_id` → `target_user_id` (viewer-local) |
| Pending request | `community_friend_requests` | requester/addressee only; status pending\|accepted\|rejected\|cancelled |
| Block | `user_social_relations` `relation_type=blocked` `is_active=true` | Unilateral; soft unblock |

## Canonical writers

| Action | Writer |
|--------|--------|
| Send friend request | `sendCommunityMessengerFriendRequest` → `cm_send_friend_request` (pending only) |
| Accept | `respondCommunityMessengerFriendRequest(accept)` → `cm_accept_friend_request` (atomic both friend rows) |
| Reject | `respondCommunityMessengerFriendRequest(reject)` → `cm_reject_friend_request` |
| Cancel outgoing | `cancelOutgoingCommunityMessengerFriendRequestByAddressee` → `cm_cancel_friend_request` |
| Remove friend | `removeCommunityMessengerFriend` / `removeFriendSaved` (owner direction only) |
| Block | `blockUserSocial` (+ cleanup removes **blocker→blocked** friend only) |
| Unblock | `unblockUserSocial` (no friend auto-restore) |

Legacy `addCommunityMessengerFriendContact` / `addFriendSaved` remain for non–friend-add paths that must not invent pending; **friend-add UX and `/friend-requests` POST must not use them**.

## Canonical readers

| Consumer | Reader |
|----------|--------|
| Friend list / home-sync / share friends | `listCommunityMessengerFriendsFromSsot` → `listContactFriendPeersForViewer` |
| Pending requests | `listCommunityMessengerFriendRequests` → `community_friend_requests` pending |
| Pair judgment | `resolveFriendshipPair` / `isFriendSavedByOwner` / `isAcceptedFriendPair` (= saved by viewer) |

## Forbidden

- friend-add UX creating friend rows without accept
- popup dismiss / navigate auto-reject or pending delete
- trade / store_order / delivery → friend INSERT
- group membership → friend INSERT
- message / call → friend INSERT
- removing peer’s friend row when I block them
- friend auto-restore after unblock
- existing Contact row backfill / forced mutualization
- native call / notification structure changes for this feature

## Domain isolation

```text
FRIEND DOMAIN = GENERAL 1:1 + GROUP SOCIAL GRAPH (invite UX may use contacts)
TRADE / STORE_ORDER / DELIVERY PEER ≠ FRIEND
```

## Messaging / calls

- Non-friend may message if not blocked (and account gates pass).
- Non-friend may call subject to callee privacy.
- `friends_only` / contacts: **callee must have saved caller** (`B→A` friend row).

## Contract tests

- `lib/community-messenger/friendship/__tests__/friend-contact-ssot-lock.test.ts`
- `lib/community-messenger/friendship/__tests__/cm-mutual-friend-request.test.ts`
