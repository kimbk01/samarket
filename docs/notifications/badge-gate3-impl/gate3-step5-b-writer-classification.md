# Gate 3 Step 5 — Conversation B writer classification

| Writer | 현재 역할 | 새 역할 | 분류 | 중복 방지 키 |
|--------|-----------|---------|------|--------------|
| `community_messenger_participants.unread_count` (+ RPC apply) | Room unread message SSOT | Sole room unread authority | **KEEP** | `(user_id, room_id)` + message id / generation |
| `markRoomReadAtomic` / domain atomic mark_read | Server read ACK | Sole clear path for room unread | **KEEP** | idempotencyKey + roomId + lastReadMessageId |
| `loadMessengerUnreadRoomFactsFromParticipants` | GD/Group Facts | Fact producer → B inputs | **KEEP** | roomId in domain bag |
| `loadTradeStoreOrderUnreadRoomFactsFromParticipants` | Trade/SO Facts | Fact producer; customer only into B | **KEEP** | roomId; buyer vs owner partition |
| `resolveMemberConversationAuthority` | (new) | Canonical B + surfaces | **KEEP** (new SSOT) | `domainIdentityKey` |
| `projectMemberBottomChatBadge` / Trade / Order helpers | Independent number sum | Derive from canonical B when rooms known | **ROUTE** | via `projectSurfacesFromConversationAuthority` |
| List / hub optimistic RT decrement | Local −1 on surfaces | Must not invent authority; resync from Facts | **ADAPTER** | generation / server snapshot |
| Cap / resume badge invent | App Icon path | Out of Step 5; still forbidden as B authority | **DELETE** (as B writer) | n/a |
| Orphan missed → `bMemberTotal` (Slice 2-3) | Included in App Icon B_member | **Not** Conversation B; orphan → A | **ADAPTER** until Step 6 App Icon cut | call_session_id |
| Owner store_order room counts | Owner hub / C_chat | Excluded from member B | **ROUTE** → Step 7 C | `store:{storeId}` |
| UI Bottom/Trade/Order `badge++/--` | Local invent | Forbidden | **DELETE** | — |

```text
Step: 5
Bell digit writers: was 5 → now 1 canonical A (Step 4)
mark-all writers: was 2 → now 1 canonical A
Conversation B authority writers: → 1 (resolveMemberConversationAuthority)
App Icon authority writers: unchanged this step (Step 6)
```
