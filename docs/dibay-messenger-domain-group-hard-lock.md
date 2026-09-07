# DIBAY Messenger Domain Separation + GROUP Chat HARD LOCK

**HARD LOCK DECLARED:** 2026-09-07  
**Preserves:** GROUP ACTIVE MEMBERSHIP AUTHORITY (source close — list/bootstrap/send/bump/push)  
**Runtime / Production:** NOT_PROVEN this declaration  
**Related:** `lib/chat-domain/four-domain-freeze.ts` · `docs/community-messenger/2026-07-23-four-domain-phase-b-freeze.md` · `lib/community-messenger/group/group-active-membership-gate.ts`

---

## Absolute domain boundary

```text
DIRECT (general_direct)
≠
GROUP (group)
≠
TRADE (trade)
≠
ORDER (store_order)
```

Shared allowed: message storage · attachment · realtime transport · read primitives · push primitives · composer primitives.

**Shared transport ≠ shared authority.**

Authority that MUST stay domain-local:

| Concern | Authority |
|---------|-----------|
| Room identity | domain identity builders |
| Access | domain membership / parties |
| Header identity | Domain Header Factory |
| Recipients | domain party / active membership |
| Leave / end | domain semantics |
| Notification kind | domain kind |
| Deeplink | domain route |
| Admin / roles | GROUP only (owner/admin/member) |

---

## Domain SSOT table (code)

| Contract | DIRECT | GROUP | TRADE | ORDER |
|----------|--------|-------|-------|-------|
| `chat_domain` | `general_direct` | `group` | `trade` | `store_order` |
| Room identity | `gd:{sorted a:b}` / pair key | `group:{roomId}` + `room_type` private_group\|open_group | `trade:{item}:{sorted seller:buyer}` | `so:order:{orderId}` |
| Access | CM participant (direct) | **ACTIVE** = row + `left_at IS NULL` + not banned | trade parties / product chat | order parties |
| Header | counterpart | group profile + member count | listing + counterparty | store / customer + order |
| Recipients | peer | active memberships − sender | transaction parties | order parties |
| Leave | archive / hide (viewer) | member leave (`left_at`) · owner transfer or archive | domain-dependent | domain-dependent |
| Admin role | none | owner / admin / member | none | business roles |
| Push kind | direct / chat_message | `group_message` | trade | order |
| Deeplink | `/community-messenger/rooms/{id}` | group room path (`?type=group`) | trade room | order room |

Owners:

- Domains: `lib/chat-domain/four-domain-freeze.ts`
- Header chrome: `lib/messenger/contracts/domain-room-header-chrome.ts`
- Phase2 resolve: `components/community-messenger/room/phase2/resolve-messenger-room-phase2-domain-chrome.ts`
- GROUP membership gate: `lib/community-messenger/group/group-active-membership-gate.ts`
- GROUP permissions: `lib/community-messenger/group/group-room-permissions.ts` · `group-room-role-policy.ts`

---

## GROUP canonical chain (LOCKED)

```text
ROOM (community_messenger_rooms)
  → PROFILE (title, avatar_url, notice/summary)
  → ACTIVE MEMBERSHIP (participants left_at IS NULL + not banned)
  → ROLE (owner | admin | member)
  → MESSAGE (community_messenger_messages)
  → ROOM REALTIME (room-id bump)
  → PER-MEMBER READ (last_read_* / unread_count)
  → MEMBERSHIP-BASED NOTIFICATION
  → GROUP MANAGEMENT (group-rooms admin APIs)
```

### Identity

GROUP is never identified by `peerUserId` / `otherUserId` / `recipientId` / `counterpart`.

Canonical:

```text
community_messenger_rooms.id
+ room_type ∈ {private_group, open_group}
+ chat_domain = group
+ domain_identity = group:{roomId}
```

### Active membership

```text
ACTIVE =
  participant exists
  AND left_at IS NULL
  AND not active ban (community_messenger_group_bans.unbanned_at IS NULL)
```

Roles: `owner` | `admin` | `member` only. UI local boolean is not authority.

### Leave / kick / ban (distinct)

| Action | Actor | Effect |
|--------|-------|--------|
| LEAVE | self | `left_at` set |
| KICK | owner/admin* | `left_at` set |
| BAN | owner/admin* | `left_at` + ban row · rejoin blocked until unban |

\* admin kick/ban gated by room flags (`allow_admin_kick`, etc.).

### Owner leave (LOCKED — OPTION C)

RPC `community_messenger_leave_private_group`:

1. If other active members exist → **auto successor** (oldest `joined_at`, then `user_id`) becomes owner; leaver demoted + left.
2. Else → room `room_status = archived`; owner leaves.

Ownerless active group is forbidden.

### Delete group

Soft tombstone only: `deleted_at` / `deleted_by`. Hard DELETE of room row forbidden. Participants/messages/bans/history preserved. Owner only.

### Mute

Per-member: `community_messenger_participants.is_muted`. Must not mute other members.

### private_group vs open_group

| | private_group | open_group |
|--|---------------|------------|
| Visibility | private | discoverable optional |
| Join | invite_only · friend-contact invite | free / password · join / join-request |
| List chip | private_group | open chat / joined open |
| Engine | same GROUP membership + roles | same |

Do not merge invite-only private create with open join-request flows.

---

## GROUP role capability matrix (product LOCK)

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| View / send | YES | YES | YES |
| Invite | YES | YES if `allow_admin_invite` | YES if `allow_member_invite` |
| Kick | YES | YES if `allow_admin_kick` (members only) | NO |
| Ban | YES | YES* (same kick gate / ban API) | NO |
| Promote / demote admin | YES | NO | NO |
| Edit title / avatar / notice | YES | YES if edit flags | NO |
| View member list | YES | YES | YES |
| Leave | YES (transfer or archive) | YES | YES |
| Delete / end group | YES | NO | NO |

Self kick/ban forbidden. Admin cannot remove owner.

---

## GROUP header LOCK

Canonical header slots:

```text
[Back] [Group Avatar] [Group Title]
                      [Active member count]
                                    [Search] [Settings/Manage]
```

- Title / avatar ← room profile (`title`, `avatar_url`)
- Member count ← active membership count
- Manage CTA ← Group Info / settings sheet (not peer profile)

**Forbidden in GROUP header/list identity:** `peerUserId`, `members[0|1]`, `otherUser`, counterpart name as room identity.

Avatar/title tap SHOULD open Group Info (not peer profile). Settings/⋮ opens management.

---

## Telegram / Kakao structural principles (LOCKED)

1. GROUP is a first-class room  
2. Membership is authority  
3. Role is part of membership  
4. Header represents the group, not a peer  
5. Members are derived from active membership  
6. Messages belong to the room  
7. Message author is the sender  
8. Notification recipients are membership-derived  
9. Leave / kick / ban are different actions  
10. Admin management is role-based  
11. Read state is per member  
12. Group profile is shared room state  

---

## DO NOT

- Apply GROUP role/admin/kick to DIRECT / TRADE / ORDER  
- Use experimental `group_rooms` / `/api/group-chat` as product SSOT  
- Globally force `left_at` filter on non-group CM contracts  
- Invent topics / channels / slow-mode / bots outside product scope  
- Treat UI-only buttons as implemented management without API+DB  

---

## Known OPEN GAPS (under HARD LOCK — fix in follow-ups, do not weaken LOCK)

1. **List avatar fallback** — summary may use `peerProfilesBase[0].avatarUrl` when group `avatar_url` empty (peer identity leak for list).  
2. **Header title/avatar tap** — group primary chrome often non-button; Group Info primarily via Settings sheet.  
3. **Notify display fallback** — `load-message-notification-display-context` still has experimental `group_rooms` title fallback after CM miss.  
4. **Member count** — must remain active-only; callers must not pass left participants into `memberCount`.  
5. **Membership authority migration** — apply `20261207120000_cm_group_active_membership_authority.sql` + G1–G8 runtime proof.  
6. **Read-receipt “N people read”** — optional product; per-member unread SSOT is LOCKED; do not invent without product gate.

---

## Route / API map (canonical vs legacy)

| Surface | Domain | Status |
|---------|--------|--------|
| `/community-messenger` shell | DIRECT + GROUP (+ trade/order filters) | canonical |
| `/api/community-messenger/rooms/...` | shared transport + access | canonical |
| `/api/community-messenger/groups/create` | GROUP create | canonical UI owner |
| `/api/community-messenger/group-rooms/...` | GROUP admin | canonical |
| `/api/group-chat`, `group_rooms` / `group_messages` | experimental | **legacy — do not revive** |
| Trade / order CM rooms | TRADE / ORDER | canonical domain contracts |

---

## Gate

```bash
npx vitest run lib/community-messenger/group/__tests__/group-active-membership-gate.contract.test.ts \
  lib/messenger/__tests__/domain-room-header-chrome.test.ts \
  lib/messenger/__tests__/domain-canonical-identity-contract.test.ts
```

Domain file lock (historical Phase B): `npm run verify:chat-domain-file-lock` when that path is in scope.

---

## Status line

```text
DOMAIN SEPARATION: HARD LOCK (principles + owners)
GROUP MEMBERSHIP AUTHORITY: SOURCE CLOSED · RUNTIME/PROD NOT_PROVEN
GROUP PRODUCT SHELL (header/list/notify polish gaps): OPEN GAPS listed above
PRODUCTION: NOT_PROVEN
```
