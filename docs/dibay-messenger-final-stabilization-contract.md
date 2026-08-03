# DIBAY Messenger Final Stabilization Contract

**Status:** PHASE 1–6 PRODUCT CONTRACT (CODE path)  
**Date:** 2026-08-04  
**Implementation status:** CODE PASS (static gates). NOT DEPLOY / RUNTIME / HARD LOCK  
**Supersedes:** conflicting Badge Gate 2, product-audit, scroll, and call-unread formulas listed below.

This document fixes the product boundary for stabilization. It does not introduce a new
Authority. Existing stores remain canonical:

```text
Member notification fact = notification_events
Conversation fact         = community_messenger_participants unread cursor/count
Owner fact                = active-store owner room/operation facts
Call timeline fact        = community_messenger_messages.call_stub
Projection                = buildNotificationBadgeProjection
Publisher                 = applyNotificationBadgeProjection
Native                    = absolute App Icon echo
```

## 1. Mandatory authority chain

```text
Event
→ one recipient/domain fact
→ canonical projection
→ publisher (no arithmetic)
→ UI/native surfaces
→ canonical read/complete action
→ fact change
→ projection recompute
→ all related surfaces clear
```

Transport, Realtime, HTTP, React stores, bootstrap caches, Capacitor preferences, and
launcher state are not Authority.

## 2. Product formulas

```text
Row(room) = unread message count for that participant in that room

B_general  = count(general rooms where Row > 0)
B_group    = count(group rooms where Row > 0)
B_trade    = count(trade rooms where Row > 0)
B_customer = count(customer-order rooms where Row > 0)

Bottom Chat       = B_general + B_group + B_trade + B_customer
Trade Hub         = B_trade
Customer Order Hub= B_customer

Bell              = Member Notification A
Member App Icon   = A + B_general + B_group + B_trade + B_customer

Owner FAB/Hub     = active-store Owner room count + active-store operation attention
```

Owner room/operation facts must not enter Member Bell, Bottom Chat, or Member App Icon.
Parent digits are room counts; only a room row displays message count.

## 3. Event trace matrix

`B` below means the canonical participant unread fact. `A` means the canonical member
notification event. Call outcomes use the existing `call_stub`; they do not create a
parallel call-notification counter.

| Event | Domain Fact | Timeline | Row unread | Bottom | Hub | Bell | App Icon | Push | Read/Clear |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| General message | General B | yes | message +1 | room 0→1 | General | no | B room 0→1 | chat route | room cursor |
| Group message | Group B | yes | message +1 | room 0→1 | Group | no | B room 0→1 | chat route | room cursor |
| Trade message | Trade B | yes | message +1 | room 0→1 | Trade | no | B room 0→1 | trade room | room cursor |
| Customer order message | Customer B | yes | message +1 | room 0→1 | Customer | no | B room 0→1 | order room | room cursor |
| Owner order message | active-store Owner B | yes | message +1 | no | Owner | no | no | owner room | owner room cursor |
| Notice | A | no | no | no | no | +1 | A +1 | notice route | A read/delete |
| Persistent marketing | A | no | no | no | no | +1 | A +1 | campaign route | A read/delete |
| System/member note | A | no | no | no | no | +1 | A +1 | notification detail | A read/delete |
| Trade status | A | no | no | no | Trade status UI only | +1 | A +1 | trade route | A read/delete |
| Customer order status | A | no | no | no | Customer status UI only | +1 | A +1 | order route | A read/delete |
| Admin member notice | A | no | no | no | no | +1 | A +1 | notification detail | A read/delete |
| Call canceled | room call_stub → B | yes | non-actor participant +1 | room 0→1 | room domain | no | B room 0→1 | terminal dismiss/route | room cursor |
| Call rejected | room call_stub → B | yes | non-actor participant +1 | room 0→1 | room domain | no | B room 0→1 | terminal dismiss/route | room cursor |
| Call missed/timeout (room-bound) | room call_stub → B | yes | callee +1 | room 0→1 | room domain | no | B room 0→1 | missed route | room cursor |
| Call busy | room call_stub → B | yes | caller +1 | room 0→1 | room domain | no | B room 0→1 | terminal route if sent | room cursor |
| Connected call ended | room call_stub → B | yes | participant that has not observed the terminal row | room 0→1 only while unread | room domain | no | B room 0→1 only while unread | terminal dismiss | room cursor |
| Answered elsewhere | room call_stub → B | yes | participant/device session not past terminal row | room 0→1 only while unread | room domain | no | B room 0→1 only while unread | answered-elsewhere dismiss | room cursor |
| Orphan missed call | A only | no room | no | no | no | +1 | A +1 | notification route | A read/delete |
| Owner operation | active-store Owner operation | no | no | no | Owner | no | no | owner route | operation completion |

An event must not enter A and B simultaneously. A room-bound missed call is B only;
only a genuinely roomless missed call may enter A.

## 4. Call timeline and unread rule

For a terminal call event, these properties are one decision:

```text
timeline visibility
= unread eligibility
= first-unread/divider eligibility
= row/hub/bottom/icon contribution
= room-read clear
```

The terminal row is idempotent per call session. A participant who has already observed
the row may immediately clear it through the normal room cursor; the writer/actor must
not receive self-unread. Connected-call end and answered-elsewhere therefore do not
invent permanent attention: they remain unread only until the canonical cursor passes
the terminal row.

Direct terminal writes use the existing atomic unread append with actor self-unread
excluded. Same-session stub UPDATE does not increment again. `call_stub` is included
in first-unread/divider candidates when it counted as unread.

## 5. Room unread UX

- Entry anchor is the first unread row after the server read cursor.
- Divider represents the current canonical read boundary, not a frozen entry snapshot.
- A call stub that counts as unread is a first-unread/divider candidate.
- The bottom-right button moves to first/next unread while unread remains.
- It becomes jump-to-latest only when no unread remains.
- Remaining count derives from canonical ordering/cursor plus visible range.
- Visibility may advance the cursor; a scroll event alone may not.
- Cursor movement is monotonic. Stale Realtime/HTTP data cannot move it backward.
- Re-entry recomputes from the server cursor.

## 6. Publisher and cache rule

- Publisher forwards the complete Projection result.
- A UI cache may preserve presentation state but may not merge an old digit into a new
  Projection.
- Optimistic state cannot overwrite canonical digits.
- Member App Icon has one total. `unifiedAttention.appIconTotal` is removed from the
  product HTTP payload; diagnostic readers must use `memberAppIconAuthority`.
- Native/FCM/APNS echo the canonical absolute total, including zero.
- Logout/account/store switch clears identity-scoped caches before another identity is
  applied.

## 7. Superseded formulas

The following older statements are superseded:

- Bottom Chat = General + Group only.
- Owner operations or Owner rooms contribute to Member Bell/App Icon.
- `entryUnreadCount` is unread Authority.
- The unread FAB always jumps to latest.
- Room-bound missed call contributes to Member Notification A.

Historical audit evidence remains historical; it cannot override this contract or prove
the current HEAD.

## 8. Gate

This contract is `CODE PASS` after implementation, contract tests, and full static
gates (lint · tsc · i18n · build · related verify). It becomes `HARD LOCK` only after
the three-device Runtime/red-team matrix passes against the Production SHA.
