# Badge Surface Projection Contract (Phase 1)

**Status:** CONTRACT LOCK  
**Pure helpers:** `project*` in `phase1-authority-contract.ts`

---

## 1. Named units (must not share variable names)

| Name | Meaning |
|------|---------|
| `unreadMessageCount` | Messages in one room (row) |
| `unreadRoomCount` | Distinct unread rooms |
| `unreadNotificationCount` | Member A eligible events/attentions |
| `unresolvedMissedCallCount` | Distinct unresolved `call_id`s |
| `ownerActionRequiredCount` | Store C |
| `appIconTotal` | Member `A + B` only |

---

## 2. Surface formulas

### Bell

```text
BellBadge = unreadNotificationCount   // A only
```

Forbidden inputs: owner_intake, any chat unread, store new order / ops, marketing, FCM receive counts.

### Member App Icon

```text
AppIconTotal = unreadNotificationCount
             + unreadRoomCount          // member B rooms only
             + unresolvedMissedCallCount
```

Reject if `ownerOperationCount > 0` or `ownerStoreChatRoomCount > 0` is fed into member App Icon projection.

### Bottom Chat

```text
BottomChatBadge = |GD unread rooms| + |Group unread rooms|
```

Excludes Trade, Customer SO, Owner SO, missed, A, C.

### Trade / Customer hubs

```text
TradeHubBadge = |Trade unread rooms|
CustomerOrderHubBadge = |Customer SO unread rooms|
Row = unreadMessageCount(room)
```

Status events are A, not hub digits.

### Owner store surfaces

```text
OwnerChatUnreadRoomCount(store_id)      = B   // store scope
OwnerOperationAttentionCount(store_id)  = C
OwnerPresentationTotal                  = B + C  // UI only
```

`OwnerPresentationTotal` ∉ Bell, ∉ member App Icon, ∉ DB authority, ∉ FCM authority.

---

## 3. Room set integrity (locked for Phase 2 implementation)

Before trusting any large App Icon (e.g. Samsung 20):

1. Count **unique** unread room ids only  
2. Forbid duplicate room ids in the set  
3. Separate member vs store recipient rooms  
4. Remove a room from the set immediately when read cursor confirms  

Phase 1 does not heal live projections.
