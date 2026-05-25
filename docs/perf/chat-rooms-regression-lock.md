# Chat Rooms Regression Lock

Trade chat rooms list on `GET /api/chat/rooms`.

**Purpose:** prevent re-introduction of request-time rooms monolith aggregate bottlenecks.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Multi-wave product_chats + participants + chat_rooms | 7 RTT cold | **1 RTT:** `get_chat_rooms_snapshot` or counter PK read |
| Repeated participant/profile/trade joins | Per-wave PostgREST | Precomputed in unified RPC bundle |
| Request-time unread recompute | Per-room cursor fetch chain | Bundle + CPU assemble (same semantics) |
| Room ordering at request time | Full list re-sort each hit | Snapshot bundle + deterministic assemble |

## Forbidden patterns

- Multiple aggregate queries on cold snapshot path (max **1** DB round trip for list body)
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on rooms hot path
- Sequential `await` for independent rooms/profile/unread on snapshot path
- Request-time aggregate recompute when unified RPC exists
- Legacy rooms monolith as normal when RPC deployed
- Reconnect full list recompute (use snapshot refresh + MRC1 merge rules)

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `trade_chat_rooms_snapshots` |
| Snapshot counter miss / stale serve | **1** RPC | `get_chat_rooms_snapshot` |
| Legacy fallback | **7+** | Only when unified RPC unavailable (temporary) |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Route memory | `userId:segment` | 5s | `chat/rooms/route.ts` |
| DB snapshot | `(user_id, list_scope, list_limit, cursor_key)` | 8s fresh + event refresh | `chat-rooms-snapshot.ts` |
| Unread parts memory | `userId` | 5s | `user-chat-unread-parts.ts` |

## Snapshot ownership

- **Write:** message/read/participant/trade events → `invalidateChatRoomsSnapshotCache` → `scheduleChatRoomsSnapshotRefresh`
- **Read:** `tryLoadChatRoomsFromSnapshot` → counter row → unified RPC → legacy fallback
- **Semantics:** unchanged `{ rooms: ChatRoom[] }` — UI unchanged

## Invalidation flow (required events)

1. Message insert / update / delete
2. Read ack / mark-all-read
3. Participant change / room hide / leave / block
4. Trade item / product_chat touch
5. Reconnect silent refresh (background schedule, not full monolith)
6. Stale counter serve — background `scheduleChatRoomsSnapshotRefresh`

## Ordering semantics lock

- Sort by `lastMessageAt` DESC (same as legacy route)
- Dedupe: legacy `product_chats` merges into single `chat_room` per trade triple when exactly one CR exists
- Hub expiry filter: `shouldOmitTradeRoomFromChatHubList` on trade segment (not order)

## Reconnect rules (MRC1 — do not break)

- `snapshot_version` monotonic merge on client realtime paths
- Stale reconnect discard — do not overwrite fresher snapshot with older reconnect payload
- Active room unread guard
- Cross-tab consistency — no full list recompute on reconnect

## Regression guards

Runtime: `lib/chats/chat-rooms-snapshot-regression-guard.ts`

Log tags: `[chat-rooms-regression-alert]`, `[chat-rooms-monolith-analysis]`, `[chat-rooms-snapshot-rpc-design]`, `[chat-rooms-snapshot-fallback]`

Verify: `npm run verify:chat-rooms-snapshot-rpc`, `npm run verify:chat-rooms-snapshot-e2e`
