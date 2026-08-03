# Unread Cursor Truth Plan (Phase 2A)

**Status:** DESIGN + pure fixtures only · **not** wired to runtime  
**Module:** `lib/notifications/badge-authority-rebuild/unread-cursor-truth-plan.ts`  
**Tests:** `__tests__/unread-cursor-truth-plan.test.ts`

---

## 1. Source of truth

```text
RoomUnreadMessages =
  messages after recipient read cursor
  excluding sender-self
  excluding deleted / non-readable

UnreadRoom = RoomUnreadMessages > 0
```

Cached `participant.unread_count` is a **projection candidate**, not authority until it matches derived truth.

---

## 2. Domains to audit

| Domain | Recipient identity |
|--------|-------------------|
| General | `user:{id}` |
| Group | `user:{id}` |
| Trade | `user:{id}` |
| Customer Store Order | `user:{id}` (buyer) |
| Owner Store Order | `store:{storeId}` (B_store) |

Compare per room:

- latest readable message id  
- recipient read cursor id  
- derived unread message count  
- cached row unread  
- hub unread room membership  
- bottom membership (GD/Group only)  
- member App Icon membership (B_member domains only; never owner rooms)

---

## 3. Integrity rules

1. derived = 0 → room **absent** from unread room sets  
2. derived > 0 → room present **exactly once**  
3. Fail on: alias+canonical dup, bootstrap+RT dup, member+store double count, customer+owner double projection, domain key + raw id double store  

---

## 4. API design (fixtures implemented)

```text
deriveUnreadTruthForRoom(...)
compareUnreadTruthToProjection(...)
auditUnreadProjectionForIdentity(...)
```

Output: truth counts, projection counts, `match|mismatch`, `mismatchReason`.

**Phase 2A:** fixtures + unit tests only.  
**Later slices:** optional offline audit script; no production heal from audit alone.

---

## 5. Samsung AppIcon 20 implication

`trade=3 + buyer=17 → 20` is **consistent with room-count formula**, not proof of 20 messages. Before shrinking digits:

1. Run truth compare on those room ids  
2. Confirm unique membership  
3. Confirm customer vs owner split  
4. Confirm read rooms removed  

Until then: projection **untrusted**; no numeric patch.
