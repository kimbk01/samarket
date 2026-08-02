# Member Web App Icon Projection (Slice 2-3)

## Formula

```text
MemberAppIconWebTotal =
  A_memberUnreadNotificationCount
  + memberUnreadRoomCount
  + memberUnresolvedMissedCallCount
```

`memberUnreadRoomCount` includes: General · Group · Trade · Customer Store Order  
Excludes: Owner Store Order · B_store · C_store · owner_intake · 광고 FCM

## Implementation

| Piece | Location |
|-------|----------|
| Pure B + web total | `member-communication-b-projection.ts` |
| Builder wire | `buildNotificationBadgeProjection` |
| HTTP Facts | `buildDomainBadgeAuthorityHttpPayload` (`memberUnreadNotificationCount` + room facts + `orphanCallIds`) |

Wire compatibility: `appIcon.missedCall` field carries **A + B_missed** when A is provided so `resolveDomainAppIconBadgeCount(messenger+trade+storeOrder+missedCall)` equals A+B.

## Native / FCM

**Not modified** in Slice 2-3. Existing bridge may echo new `appIconTotal` from Domain surface — Native PASS는 Slice 2-6까지 선언하지 않음.

```text
NATIVE APP ICON OUT OF SCOPE / PENDING SLICE 2-6
```

## Bell

Bell digit remains A_member only. Chat / missed / owner room changes must not move Bell.
