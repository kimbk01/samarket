# Event Classification Matrix (Gate 2)

**Rule:** One source event → at most one of A / B_room / C_operational / C_chat / none.  
**Missed call policy:** FIXED below (no dual A+B).

---

## Matrix

| Source event | Scope | A | B | C operational | C chat | Projection |
|--------------|-------|--:|--:|--------------:|-------:|------------|
| General peer message | member | 0 | room | 0 | 0 | General row, Bottom, App Icon B |
| Group peer message | member | 0 | room | 0 | 0 | Group row, Bottom, App Icon B |
| Trade peer message | member | 0 | room | 0 | 0 | Trade row, Trade Hub, App Icon B |
| Trade status changed | member | event | 0 | 0 | 0 | Bell, App Icon A |
| Customer order peer message | member | 0 | room | 0 | 0 | Order row, Order Hub, App Icon B |
| Customer order status changed | member | event | 0 | 0 | 0 | Bell, App Icon A |
| New store order | store | 0 | 0 | event | 0 | Owner ops surfaces |
| Accept/cancel/refund Action Required | store | 0 | 0 | event | 0 | Owner ops |
| Open store inquiry (ops) | store | 0 | 0 | event | 0 | Owner ops |
| Customer→Owner chat message | store | 0 | 0 | 0 | room | Owner chat row/hub |
| System / service / policy / security notice | member | event | 0 | 0 | 0 | Bell, App Icon A |
| Persistent admin notice | member | event | 0 | 0 | 0 | Bell, App Icon A |
| Push-only promotion | delivery_only | 0 | 0 | 0 | 0 | OS push + deep link only |
| Persistent marketing (`badge_policy.includes_in_A=true`) | member | event | 0 | 0 | 0 | Bell 혜택, App Icon A |
| Persistent marketing (`includes_in_A=false`) | member | 0* | 0 | 0 | 0 | Bell 혜택 list may show; **A digit 0** |
| Room-bound missed call (has roomId) | member | 0 | room | 0 | 0 | That room row + domain hub + App Icon B |
| Orphan missed call (no room) | member | event | 0 | 0 | 0 | Bell, App Icon A |
| owner_intake on user_id (current live writer) | **forbidden** | 0 | 0 | must ROUTE to store | 0 | Must not hit member A/B |
| FCM/APNs transport | n/a | 0 | 0 | 0 | 0 | Never authority |

\* List may still show marketing rows under 혜택 filter; digit excludes when policy says so.

---

## Missed call — FIXED PRODUCT POLICY

```text
Room-bound missed call
→ call timeline in that room
→ increments roomUnreadMessages when unread
→ B only (domain of that room)
→ NEVER creates A notification event for the same call_id

Orphan missed call
→ one persistent member notification event
→ A only
→ NEVER also counted as a synthetic B room
```

```text
∀ call_id: increments(A) ∩ increments(B) = ∅
```

---

## Status vs message (no double create)

```text
Trade status change → A event only (timeline system bubble does not raise B)
Order status change → A event only
Peer chat message → B room only (optional chat_message inbox event MUST NOT enter A digit/list)
```
