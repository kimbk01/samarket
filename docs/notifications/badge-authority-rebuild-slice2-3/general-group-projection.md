# General + Group Projection (Slice 2-3)

```text
GeneralRoomRowBadge = unreadMessageCount(room)
GroupRoomRowBadge   = unreadMessageCount(room)
BottomChatBadge     = unread General room count + unread Group room count
```

Excluded from Bottom: Trade · Customer/Owner SO · missed · A_member · C_store

Facts: `loadMessengerUnreadRoomFactsFromParticipants`  
Apply: `messenger-bottom-chat-unread-projection` / Builder `bottomChat`

Member App Icon includes GD+Group room counts in B_member.
