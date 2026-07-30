# Group Social Graph SSOT LOCK

**Status:** LOCK (2026-07-31)  
**Authority:** Product — Telegram-style groups; friendship is independent

## Core

```text
GROUP MEMBER ≠ FRIEND
```

Joining or messaging in a group must never create `user_social_relations.friend`.

## Membership / roles

Canonical paths live under `lib/community-messenger/group/*` and CM room tables:

| Concern | Authority |
|---------|-----------|
| Group room | `community_messenger_rooms` (`room_type=group` / private group) |
| Membership | `community_messenger_participants` |
| Invite validation | `validateGroupInviteTargets` |
| Permissions | server-side role checks in group-room-service (not client-only) |

## Invite policy (current DIBAY)

Direct invite from create/add-member still requires **viewer-local contact** (`isAcceptedFriendPair` = `isFriendSavedByOwner`).

This is a **contact-list invite** restriction, not mutual acceptance. Expanding to username invite / invite-link join without contact is a separate product gate — do not silently reintroduce friend-request flows.

## Forbidden

- group member INSERT → friend INSERT
- friend remove → automatic group leave
- block → automatic group kick
- mixing friend-request notifications with group invites
- merging group room id with general 1:1 / trade / store_order identities

## Domain isolation

General direct, group, trade, store_order rooms may coexist for the same user pair / parties — never merge identity keys.

## Contract tests

- `lib/community-messenger/friendship/__tests__/friend-contact-ssot-lock.test.ts` (group→friend write ban)
- `lib/community-messenger/group/__tests__/group-room-p0-contract.test.ts`
