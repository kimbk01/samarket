# B_member Current Audit (Slice 2-3)

**Audit HEAD:** `1a814053b` · **Runtime edits:** Slice 2-3A+ wiring below (this doc = pre/post map)

## Target

```text
B_member = memberUnreadRoomCount + memberUnresolvedMissedCallCount
MemberAppIconWeb = A_member + B_member
```

- Row = unread **message** count  
- Hub / Bottom / App Icon B = unread **room** count  
- Domains: General · Group · Trade · Customer Store Order · unresolved missed  
- Owner Store Order ∉ Member B / Member App Icon  

---

## 1. Writers (unread increase)

| Domain | File · symbol | Unit | Notes |
|--------|---------------|------|-------|
| All CM | SQL `dibay_append_room_message_atomic` / `community_messenger_apply_unread_for_text_message` | `participants.unread_count` +1 | RoomUnread SSOT |
| General / Group / Trade / SO | `lib/community-messenger/service.ts` append paths | message | domain via `rooms.chat_domain` + `domain_identity_key` |
| call_stub | same + `ROOM_UNREAD_INCREMENT_MESSAGE_TYPES` | optional +1 | must not double with missed event on App Icon |
| Missed | `notifyMissedCallPipeline` → `createMissedEventForUser` | `notification_events` missed_call | dedupe `missed:{sessionId}:{userId}`; always has `roomId` today |

Canonical identity (`lib/chat-domain/room-identity.ts`):

| Domain | Key |
|--------|-----|
| General | `general_direct:{sortedA}:{sortedB}` |
| Group | `group:{roomId}` |
| Trade | `trade:{itemId}:{sellerId}:{buyerId}` |
| Store Order | `store_order:{orderId}` |

Partition (`partitionTradeStoreOrderUnreadRoomFactsFromParticipants`):

- buyer → `customerOrderUnreadRoomIds` (**B_member**)
- owner → `ownerOrderUnreadRoomIds` (**B_store** — Member App Icon 금지)

---

## 2. Read writers (decrease)

| Path | File | Effect |
|------|------|--------|
| Optimistic room enter | `applyOptimisticRoomRead` → `applyMessengerRoomUnreadFactAndSyncBottom` | GD/Group Authority; Trade/SO via resync |
| Server mark_read | `dibay_mark_room_read_atomic` | cursor + recount unread_count |
| Domain ACK | `issueDomainBadgeAuthorityForAck` | full Domain snapshot |
| Hub Apply | `applyNotificationBadgeProjection` | Bottom / hubs / App Icon |
| Missed seen | notification-event read / call_logs mark-read | orphan leaves B_missed |
| Boot / resume | `ensureInitialBadgeSnapshotForBoot` → badge-count | absolute rebuild |

---

## 3. Projection readers (pre → post Slice 2-3)

| Surface | Pre | Post (Slice 2-3) |
|---------|-----|------------------|
| List row | `rowUnreadByRoomId` message count | **KEEP** message count |
| Bottom | GD+Group rooms | **KEEP** |
| Trade Hub | trade rooms | **KEEP** |
| Customer Hub | buyer rooms | **KEEP** |
| Owner FAB / hub | owner rooms | **KEEP** (not Member B) |
| Bell | A_member | **KEEP** (Slice 2-2 LOCK) |
| Member App Icon | messenger+trade+(owner+buyer)+NotificationAttention | **REWRITE** A + GD+Group+Trade+Customer + unresolved missed |
| ChatAttention.total | includes owner | **KEEP** for explain/diag; Builder App Icon no longer uses owner |

Contamination chain (blocked in Builder):

```text
ownerOrderRoomIds
  → ChatAttention (+owner)
  → WAS storeOrderForAppIcon = owner+buyer
  → NOW storeOrderForAppIcon = buyer only
```

---

## 4. Count unit contract

| Surface | Unit |
|---------|------|
| RoomRowBadge | `unreadMessageCount` |
| Bottom / Trade Hub / Customer Hub / Member B rooms | `unreadRoomCount` |
| Missed B | `unresolvedMissedCallCount` (call_id dedupe) |

---

## 5. Gaps closed in Slice 2-3 (code)

| Gap | Fix |
|-----|-----|
| Owner in Member App Icon | `storeOrderForAppIcon = buyer` |
| App Icon ≠ A+B | Builder uses `buildMemberCommunicationBProjection` when A present |
| Missed call_id | `orphanCallIds` + `unresolvedMissedCallIds` |
| Contract unwired | `member-communication-b-projection.ts` |

## 6. Still deferred

| Item | Slice |
|------|-------|
| Native / FCM badge_count adapters | 2-6 |
| B_store owner surfaces product PASS | 2-4 |
| C_store / owner_intake App Icon cleanup residue in NotificationAttention diag | 2-5 |
| Room-bound missed-only (unread_count=0) App Icon room membership | review with 2-3E/runtime |

---

## Verdict

Audit complete. Fact loaders KEEP. Member App Icon Builder REWRITE. Bell A LOCK preserved.
