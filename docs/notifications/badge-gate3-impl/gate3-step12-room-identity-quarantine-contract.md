# Gate 3 Step 12 — Room Identity Quarantine Contract

Quarantined rooms are **excluded** from Conversation B `rooms[]`, parent room counts, Bottom Chat, Trade Hub, Order Hub, and Member App Icon B.  
Source rows are **not deleted**.

## Fixed reasons (`ConversationIdentityQuarantineReason`)

| Reason | When |
|--------|------|
| `MISSING_CHAT_DOMAIN` | No / unknown `chatDomain` |
| `MISSING_DOMAIN_IDENTITY_FIELDS` | Required domain fields absent and no safe adapt |
| `ROOM_UUID_FALLBACK` | Key is `*:room:{uuid}` (or bare `room:{uuid}`) and adapt failed |
| `OWNER_MEMBER_SCOPE_AMBIGUOUS` | Reserved (owner vs member scope unclear) |
| `TRADE_PARTICIPANT_AMBIGUOUS` | Trade without listingId+sellerId+counterparty (or valid key) |
| `ORDER_SCOPE_AMBIGUOUS` | Customer order without proven `orderId` / `store_order:{orderId}` |
| `OWNER_IN_MEMBER_B` | `store_order_owner` fact offered to Member B |
| `IDENTITY_DOMAIN_MISMATCH` | Key prefix ≠ chatDomain and adapt failed |

Status codes on resolver: `canonical` | `adapted` | `quarantined`.

## Surface contract

| Surface | Includes |
|---------|----------|
| Bottom Chat | Canonical General + Group unread rooms only |
| Trade Hub | Canonical Trade only |
| Order Hub | Canonical Customer Order only |
| Owner C | Canonical store-scoped rooms only (not Member B) |
| App Icon | A + B(canonical rooms only) |

## Missed call XOR

- Canonical room-bound missed → B only (via room unread).
- Identity-incomplete room → quarantine → **not** B; **not** auto-promoted to orphan A.
- Do not regenerate the same call into A (duplicate risk).
