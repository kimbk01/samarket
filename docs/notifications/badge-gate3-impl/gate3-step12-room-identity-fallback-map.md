# Gate 3 Step 12 — Room Identity Fallback Map

**Status:** CODE path closed for `*:room:{uuid}` invent → Conversation B.  
**Not declared:** Badge Authority CODE PASS · Runtime · Product · Hard Lock · Production cutover READY.

## Canonical identities

| Domain | Identity |
|--------|----------|
| General | `general_direct:{sortedViewerId}:{sortedPeerId}` |
| Group | `group:{groupId}` (product: groupId may equal roomId) |
| Trade | `trade:{listingId}:{sellerId}:{counterpartyId}` |
| Customer Order | `store_order:{orderId}` |
| Owner | `store:{storeId}:order:{orderId}` — **never Member B** |

## Path classification

| 경로 | 현재 fallback | 복원 가능 필드 | 분류 | 새 동작 |
|------|---------------|----------------|------|---------|
| `build-domain-badge-authority-http.ts` invent `general_direct:room:{uuid}` / `trade:room:` / `store_order:room:` | HTTP invent | loader `domain_identity_key` + GD peer | **DELETE** (writer) | Pass through proven key / peer ADAPTER; else quarantine |
| `conversation-b-from-participant-facts.ts` invent keys | Fact→B invent | same | **DELETE** | No invent; omit key → resolver quarantine |
| `member-conversation-b-authority.buildConversationDomainIdentityKey` | returned invent | fields / key | **CANONICAL** | Delegates to `resolveCanonicalConversationRoomIdentity` |
| Messenger partition `domain_identity_key` | missing key | peer participants | **ADAPTER** | Load peer → `generalDirectRoomIdentity`; else quarantine |
| Messenger group without key | — | roomId as groupId | **ADAPTER** | `group:{roomId}` |
| Trade partition without `domain_identity_key` | — | listing/seller/counterparty (not on Fact row today) | **QUARANTINE** | Exclude from B; keep row data |
| Store order `store_order:room:{uuid}` | UUID as order | — | **QUARANTINE** | `parseOrderId` rejects; not in customer/owner sets |
| Store order `store_order:{orderId}` + buyer scope | — | orderId + buyer | **CANONICAL** | Customer B only |
| Owner store_order room | — | storeId + orderId | **CANONICAL** (C only) | Excluded from Member B (`OWNER_IN_MEMBER_B`) |
| Legacy DB key `*:room:{uuid}` | persisted invent | domain fields / peer | **ADAPTER** or **QUARANTINE** | Adapt if fields; else quarantine; never promote key |
| Room-bound missed call | room unread | room must have canonical identity | **CANONICAL** only via B | Incomplete identity → neither A nor B auto |

## DELETE (writers only)

- HTTP builder invent of `general_direct:room:`, `trade:room:`, `store_order:room:`
- Fact bag invent of the same prefixes

**DO NOT** delete room rows or notification_events for quarantine.

## Diagnostics

- `identityIncompleteCount` / `quarantined[]` from `normalizeConversationRoomsForAuthority`
- HTTP `logNotifyBadge` fields: `identity_incomplete_count`, `identity_quarantined`
