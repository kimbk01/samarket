# B_member — Member Communication Runtime Map (Phase 2A)

**HEAD:** `1e2a560c1` · Runtime edits: none

Target identity: `user:{user_id}`  
Domains: General, Group, Trade, **customer** Store Order, member missed calls.  
Member App Icon B = unread **rooms** (those domains) + unresolved missed.  
**Not** Owner Store Order rooms.

---

## Unread fact loaders

| File | Symbol | Domains | Identity | Unit | Verdict |
|------|--------|---------|----------|------|---------|
| `lib/notifications/load-messenger-unread-room-facts-from-participants.ts` | `loadMessengerUnreadRoomFactsFromParticipants` | GD / Group | participant `user_id` | room ids where unread_count>0 | **KEEP** facts; consumers ROUTE |
| `lib/notifications/load-trade-store-order-unread-room-facts-from-participants.ts` | `loadTradeStoreOrder…` + `partition…` | Trade / Customer / Owner | participant `user_id` + buyer/owner split via store_orders | room ids + row message counts | Trade+Customer **KEEP** for B_member; Owner branch **ROUTE** to B_store (must leave member App Icon) |
| Room unread writers (CM participants) | message insert / mark-read paths | all CM | participant | `unread_count` messages | **KEEP** RoomUnread SSOT (Phase 1 closed) — do not reopen |

Partition evidence (`partitionTradeStoreOrderUnreadRoomFactsFromParticipants`):

- buyer_user_id === uid → `customerOrderUnreadRoomIds` (**B_member**)
- owner_user_id === uid → `ownerOrderUnreadRoomIds` (**B_store** today folded into App Icon)

---

## Projections / surfaces

| File | Symbol | Surface | Current | Verdict |
|------|--------|---------|---------|---------|
| `lib/notifications/build-notification-badge-projection.ts` | `buildNotificationBadgeProjection` | Bottom / Trade / Customer / App Icon | `storeOrderForAppIcon = owner + buyer` | **REWRITE** — App Icon chat axis = GD+Group+Trade+Customer only |
| `lib/notifications/chat-notification-attention-projection.ts` | `buildChatAttentionProjection` | ChatAttentionTotal | includes `ownerOrderRoomIds` | **REWRITE** exclude owner from member ChatAttention |
| `lib/notifications/domain-app-icon-badge.ts` | `resolveDomainAppIconBadgeCount` | App Icon sum | messenger+trade+storeOrder+notification | **ROUTE** formula to A+B_member |
| `lib/notifications/messenger-bottom-chat-unread-projection.ts` | bottom apply | Bottom Chat | GD+Group | **KEEP** |
| Hub optimistic apply | `applyDomainAuthorityHubBadgeOptimistic` | Trade / Customer hubs | Domain Apply | **KEEP** axes; verify no owner leak into member hubs |
| `lib/notifications/load-orphan-missed-call-facts.ts` | orphan missed | App Icon / Bell today | orphan in NotificationAttention | **ROUTE** → B_member missed; out of Bell |
| Missed call notify pipeline | `notify-missed-call-pipeline` (via createNotificationEvent) | events | | **ROUTE** B |
| Boot / resume | `ensureInitialBadgeSnapshotForBoot` → badge-count | all | | **KEEP** trigger; payload ROUTE |

---

## Read path

| Concern | Notes | Verdict |
|---------|-------|---------|
| Room read cursor / mark-read | CM / trade / SO mark-read + domain-badge-read-ack | **KEEP** writers; projection must drop room from set |
| Optimistic room read | Projection Authority room facts | **KEEP** with truth audit |
| `app/api/me/chats/mark-all-read` | chat mark-all | must not clear A/C | **KEEP**/guard |

---

## Count units

| Name | Source today | Target |
|------|--------------|--------|
| row unread | `participant.unread_count` / `rowUnreadByRoomId` | `unreadMessageCount` |
| hub / bottom / app icon B | room id set sizes | `unreadRoomCount` |
| missed | orphan attention keys / facts | `unresolvedMissedCallCount` by `call_id` |

---

## Contamination into Member App Icon

```text
buildChatAttentionProjection(+ownerOrderRoomIds)
  → ChatAttentionTotal
  → buildNotificationBadgeProjection storeOrderForAppIcon = owner+buyer
  → appIconTotal
  → Native / FCM
```

**Verdict:** Owner rooms **DELETE** from member App Icon path; **ROUTE** to B_store surfaces only.

---

## Slice

**2-3 B_member** after A digit cleaned (2-2), so App Icon A+B_member measurable.
