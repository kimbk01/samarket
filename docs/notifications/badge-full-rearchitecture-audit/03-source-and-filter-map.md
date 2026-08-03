# 03 — Source and Filter Map (Bell A as one product)

**Mode:** AUDIT ONLY · digit / popup / list / mark-all / delete as **one product**, not separate UI bugs

---

## Required product equality

```text
Bell digit A set  ≡  Popup A item set  ≡  Full list unread A set
                  ≡  Mark-all A target set  ≡  Delete A target set
```

Compare **IDs**, not only totals.

---

## Source comparison (code-proven)

| Product set | API / store | ID kind | Unread gate | Filters |
|-------------|-------------|---------|-------------|---------|
| Server A truth (digit) | `badge-count` ← `loadBellExplainUnreadEventRows` | **attention keys** (+ `eventIds` in projection object, unused by digit UI) | unread only | `isMemberNotificationAUnread` |
| Bell digit consumer | `notification-badge-count-store.total` | count of keys | same | ignores list sync |
| Popup “A” items | **NONE** | — | — | Popup does not fetch A inbox |
| Popup “중요 대화” | messenger home rooms | `important:{roomId}` | room unread≥1 | pin \| trade \| delivery |
| Popup invites / missed | local stores / call log | invite/call ids | local | not A |
| Full list | `GET /api/me/notifications` | **event row ids** | **read + unread** | exclude chat + owner commerce + `filterMemberNotificationAInboxRows` + `pushKind` tab |
| Mark-all | `markMemberANotificationsAllRead` | A unread **event ids** + matching **legacy `notifications`** ids | unread | A predicate + exclude chat/owner |
| Delete | `delete_ids` PATCH | explicit ids | n/a | dismiss events ± delete legacy |

---

## Verdict on set equality

| Pair | Same source table? | Same ID set? | Classification |
|------|--------------------|--------------|----------------|
| Digit ↔ Full list | Same `notification_events` (intended) | **NO by unit** — keys vs events; unread vs all A rows | **Structural dual-unit** (Slice 2-2), not mere cache |
| Digit ↔ Popup important | **NO** | **NO** | **Dual authority surfaces** under one Bell chrome |
| Digit ↔ Mark-all events | Same events + A unread | **Related** — mark-all uses event ids; digit uses keys | Can clear digit while list still shows read rows |
| Mark-all ↔ legacy | **Dual store** | Parallel | **Legacy residual** |
| List empty + digit > 0 | Same intended A | **Live ID dump UNPROVEN this turn** | Wiring **allows** FAIL; exact cause = filter/classifier/cache/pagination |

---

## Empty list + digit > 0 — possible mechanisms (ranked by structure)

1. **Unit mismatch:** digit counts keys; UI expects rows — multiple events → 1 digit; reverse empty if list filter drops payload shapes digit still counts (**possible**)
2. **pushKind / client filter** drops all visible tabs while badge-count path does not use pushKind
3. **Pagination / offset** returns empty page while unread keys exist (UNPROVEN live)
4. **Cache:** badge-count store fresh, list dedupe stale empty (possible)
5. **Dismissed / read_at asymmetry** between loaders (possible)
6. **Slice 2-6 FCM** — **ruled out** for this pair (no Bell/list files)

---

## Product judgment

This is **not** “Bell filter one-liner” territory alone:

- Popup mixes **B-room** into Bell chrome by construction.
- Digit and list were **intentionally** given different units (keys vs rows) in Slice 2-2.
- Mark-all still touches **legacy notifications**.

→ Evidence of **implementation structure fracture** around A surfaces, even if A classification intent is correct.
