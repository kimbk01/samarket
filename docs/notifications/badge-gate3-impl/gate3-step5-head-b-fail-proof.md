# Gate 3 Step 5 — HEAD B contract failure proof

**Proven against tree before Step 5 canonical resolver.**  
**HEAD baseline:** `f438f37e2` (+ Step 4 A CODE PASS local)

---

## Failures fixed for evidence (not “대략 맞음”)

### F1 — Row message count vs parent room count conflation risk

| Evidence | Detail |
|----------|--------|
| Path | `buildMemberCommunicationBProjection` accepts **pre-aggregated** domain room counts only |
| Gap | No canonical `rooms[]` with `unreadMessageCount` → parent can be passed independently of rows |
| Contract breach | Parent badge must be `count(unreadMessageCount > 0)`, never Σ messages — caller can invent inconsistent parent |

### F2 — Bottom / Trade / Order not forced from one B set

| Evidence | Detail |
|----------|--------|
| Path | `projectMemberBottomChatBadge` / `projectMemberTradeHubBadge` / `projectMemberCustomerOrderHubBadge` |
| Gap | Each takes independent numbers; no shared `resolveMemberConversationAuthority` |
| Contract breach | Surfaces can diverge from the same room fact set |

### F3 — Orphan missed included in Slice 2-3 “B_member”

| Evidence | Detail |
|----------|--------|
| Path | `buildMemberCommunicationBProjection` → `bMemberTotal = rooms + missed` |
| Gate 3 B | `B = B_general+B_group+B_trade+B_order` only; orphan → **A** |
| Contract breach | Orphan in B violates missed XOR + B formula |

### F4 — No authorityVersion / domainIdentityKey room list

| Evidence | Detail |
|----------|--------|
| Gap | No `resolveMemberConversationAuthority` return with `rooms[]`, `domainIdentityKey`, `authorityVersion`, `computedAt` |
| Contract breach | Cannot idempotent-compare / dedupe by Gate 2 identity keys at B layer |

### F5 — Read ACK / duplicate writer (inventory)

| Writer | Risk |
|--------|------|
| List optimistic RT | Can decrement Bottom without server ACK |
| Hub optimistic | Partial surface clear |
| Domain HTTP facts | Canonical when used; not sole enforced path for all surfaces |

Documented in Writer Inventory Freeze — Step 5 routes surfaces through canonical B projection from room facts.

---

## Not claimed as HEAD FAIL

- Participant loaders for messenger/trade/order already separate customer vs owner bags (`load-*-unread-room-facts-from-participants`) — **KEEP** as inputs to B.
- Identity builders in `lib/chat-domain/room-identity.ts` exist — **KEEP**; Step 5 wires them into B authority rows.
