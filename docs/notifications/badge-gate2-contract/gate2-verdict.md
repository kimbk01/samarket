# Gate 2 Verdict

**Date:** 2026-08-03  
**Gate 1:** `AUTHORITY REBUILD REQUIRED` (approved)  
**Implementation:** not started  
**Rollback hold:** remains — no mechanical P0/e2cb execution from this gate

---

## Gate 2 exit expression

# BADGE AUTHORITY CONTRACT READY

Not used: CODE PASS · PRODUCT PASS · HARD LOCK · CONTRACT BLOCKED

---

## Fixed A / B / C formulas

```text
A = unread persistent member notification event count
    (canonical notification_events; NOT attention keys)

B = B_general + B_group + B_trade + B_order
    (unread room counts; row = messages)

C_operational(storeId) = Action Required items
C_chat(storeId) = unread owner chat rooms for store

Member App Icon = A + B
  with mandatory component payload + authorityVersion
```

---

## Missed call policy (fixed)

```text
room-bound → B only (room unread)
orphan → A only (one notification event)
never both for same call_id
```

---

## Announcement / ads policy (fixed)

```text
persistent announcement → A
push-only promotion → delivery_only · no A
persistent marketing → Bell 혜택; A iff badge_policy.includes_in_A
```

Reuse: `notification_events` + admin campaigns. New `announcements` table deferred.

---

## Canonical authority candidate

```text
Member A: notification_events
Member B: participant unread / room cursor (atomic RPCs)
Store C_operational: store_orders + store_inquiries (existing RPC)
Store C_chat: store-scoped owner room unread
App Icon / FCM badge_count: derived echo only
```

---

## Legacy cutover

```text
one-time backfill + temporary read-only adapter
dual-write forbidden after Bell A cutover
rollback boundary = Gate 3 Bell A commits (not 1e2a560c1)
```

---

## Migration candidates (design only — not written)

| Candidate | Why |
|-----------|-----|
| Explicit `badge_policy` / soft-delete columns if missing | marketing + delete-all |
| Stop relying on `owner_intake` user_id | identity |
| Optional rename docs: user_id ↔ recipient_member_id | clarity |

**Gate 2: no migration files created.**

---

## KEEP (inputs to rebuild)

```text
participant atomic unread / mark_read RPCs
buyer order/trade status → member notifies
C store attention RPC + cancel_pending migration already applied
absolute Native setNumber/setBadgeCount mode
pure identity/classifier types (rewrite to match this contract)
Bottom/Trade/Order room-count hub shape
```

---

## DISCARD / REPLACE (authority layer)

```text
attention-key Bell digit SSOT
Bell list filters that diverge from A unread set
Bell popup important_room / chat mix as Bell authority
dual legacy+events mark-all/delete
owner_intake → member A/Bell/App Icon path
App Icon total-only without components
Cap/prefs resume as authority (stale version publish)
FCM badge_count as independent ledger
Slice/axis PRODUCT PASS auto-inheritance
```

---

## Implementation order (Gate 3 — not started)

```text
1. identity + event classification
2. Bell A (canonical events + list/digit/mark/delete)
3. Conversation B reconnect
4. App Icon A+B components + version
5. Owner C (stop user_id ops authority)
6. Notification Center UI
7. Push routing/read
```

Separate commits per step. Independent revert of a step = that step’s commits only.

---

## Rollback-capable boundary

```text
Allowed later: revert a Gate 3 step commit series
Forbidden: git reset to 1e2a560c1 as “stable”
Forbidden: re-enable dual-write without new contract amendment
```

---

## Open items (do not block CONTRACT READY)

| Item | Status |
|------|--------|
| Live FAIL-account ID dump | Deferred to Gate 3/4 validation — structure already contracted |
| Exact DB column renames | Semantic mapping allowed until migration design |
| Owner FAB UI merge of C_ops+C_chat | Data axes fixed; UI composition product polish in Gate 3 UI step |

No contradictory undecided policies remain in A/B/C, missed call, ads, canonical store, or App Icon formula.

---

## Forbidden during/after this doc until Gate 3 approval

```text
code change · migration · revert · deploy · device QA · number force · PASS/HARD LOCK
```
