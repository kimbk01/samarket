# B_store — Store Communication Runtime Map (Phase 2A)

**HEAD:** `1e2a560c1` · Runtime edits: none

```text
B_store = OwnerChatUnreadRoomCount(store_id)
recipient_scope = store
recipient_identity_key = store:{store_id}
```

Surfaces: Owner chat FAB / owner order-chat hub / list rows.  
**BLOCK:** Member App Icon, Member Bell, Native App Icon.

Customer→store message = **B_store** (not C).

---

## Writers / facts

| File | Symbol | Notes | Verdict |
|------|--------|-------|---------|
| Participants unread | CM `unread_count` for owner participant | message unit | **KEEP** |
| `load-trade-store-order-unread-room-facts-from-participants.ts` | owner partition + `ownerOrderUnreadByStoreId` | keyed by store_id counts | **KEEP** fact shape; **ROUTE** consumers |
| Message notify store_order | message pipelines | events may exist; digit must not use as A | chat digit exclude **KEEP** |

---

## Surfaces today

| File | Symbol | Surface | Identity | Verdict |
|------|--------|---------|----------|---------|
| `lib/chats/owner-hub-badge-store.ts` + Hub GET | `storeOrderChatUnread` | Owner FAB chat | **active hub store** | **KEEP** store-scoped shell |
| `lib/chats/build-owner-hub-badge-payload.ts` | hub payload | FAB + delivery | hub store | **KEEP** split from orderAttention |
| Domain Apply | `storeOrderOwnerUnreadRooms` | aggregate owner rooms | user aggregate | **ROUTE** — do not feed Member App Icon; prefer per-store |
| Owner order list rows | order-chats UI | row messages | room | **KEEP** |
| Multi-store switch | hub store lookup | active store | | **KEEP**; verify no cross-store sum as authority |

---

## Member App Icon inflow (must DELETE)

| Step | Evidence |
|------|----------|
| 1 | `ownerOrderUnreadRoomIds` from partition when `owner_user_id === uid` |
| 2 | `buildChatAttentionProjection.ownerOrderRoomIds` |
| 3 | `buildNotificationBadgeProjection` `storeOrderForAppIcon = ownerForHub + buyer` |
| 4 | `appIconTotal` → `domain-badge-surface-store` → `NativeBadgeSync` / FCM |

Also: ownership keyed by **owner user_id** match, not `store:{id}` authority key — **REWRITE** identity for authority storage; participant user_id OK for row unread facts.

---

## Gaps / UNPROVEN

| Item | Status |
|------|--------|
| Staff (non-owner) membership unread | **UNPROVEN** in this map — only `owner_user_id` partition proven |
| Store-scoped missed calls | **NOT FOUND** as separate store identity path |
| Active store context on FCM open for chat | partial via deep links — verify in Slice 2-4 |

---

## Slice

**2-4 B_store** — isolate identity, FAB/hub only, Member App Icon block tests.
