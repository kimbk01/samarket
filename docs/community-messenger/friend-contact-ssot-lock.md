# Friend Contact SSOT LOCK — Telegram-style unilateral contact

**Status:** LOCK (2026-07-31)  
**Authority:** Product contract — Telegram-style Contact (not mutual friend-request)

## Product model

```text
FRIEND MODEL = TELEGRAM-STYLE UNILATERAL CONTACT
FRIEND REQUEST = NONE
FRIEND ACCEPT = NONE
FRIEND REJECT = NONE
OUTGOING PENDING = NONE
INCOMING PENDING = NONE
MUTUAL ACCEPTANCE = NONE (derived only if both sides save)
```

## SSOT

| Concern | Table | Rule |
|---------|-------|------|
| Friend | `user_social_relations` `relation_type=friend` | `owner_user_id` → `target_user_id` (viewer-local) |
| Block | `user_social_relations` `relation_type=blocked` `is_active=true` | Unilateral; soft unblock |

## Canonical writers

| Action | Writer |
|--------|--------|
| Add friend | `addCommunityMessengerFriendContact` / `addFriendSaved` |
| Remove friend | `removeCommunityMessengerFriend` / `removeFriendSaved` (owner direction only) |
| Block | `blockUserSocial` (+ cleanup removes **blocker→blocked** friend only) |
| Unblock | `unblockUserSocial` (no friend auto-restore) |

## Canonical readers

| Consumer | Reader |
|----------|--------|
| Friend list / home-sync / share friends | `listCommunityMessengerFriendsFromSsot` → `listContactFriendPeersForViewer` |
| Pair judgment | `resolveFriendshipPair` / `isFriendSavedByOwner` / `isAcceptedFriendPair` (= saved by viewer) |

## Forbidden

- pending friend request INSERT
- accept / reject / cancel friend-request writers
- `community_messenger_friendships` accepted fallback in friend list
- mutual-required judgment for friend list
- trade / store_order / delivery → friend INSERT
- group membership → friend INSERT
- message / call → friend INSERT
- removing peer’s friend row when I block them
- friend auto-restore after unblock

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
