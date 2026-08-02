# Customer Order Chat Projection (Slice 2-3)

```text
CustomerOrderRoomRowBadge = unreadMessageCount(customerStoreOrderRoom)
CustomerOrderHubBadge     = unread Customer Store Order room count
```

Order / delivery **status** = A_member — not Customer chat Hub digit.

Owner partition rooms:

- **Excluded** from Customer Hub and Member App Icon  
- Retained on `storeOrderOwnerUnreadRooms` / Owner FAB  

Facts: partition buyer vs owner in `load-trade-store-order-unread-room-facts-from-participants.ts`
