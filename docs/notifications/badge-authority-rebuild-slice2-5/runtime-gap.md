# Slice 2-5 — C_store Runtime Gaps

**Status:** AUDIT ONLY — gaps for Authority Contract / later CODE  
**HEAD:** `c673ac444`  
**No runtime measurement performed in this step (by design).**

---

## 1. Clear-condition gaps (critical)

| Topic | Expected (C_store) | Live behavior | Gap |
|-------|--------------------|---------------|-----|
| Hub `orderAttention` | Clear on Action Complete only | Recomputes from status — **correct shape** | Cache invalidate after status transition **UNPROVEN** on every path (may rely on TTL/poll) |
| `owner_intake` events | Must not define C clear | Clear on **read** / `markOrderNotificationsRead` / deep-link ack | **Read-clear ≠ Action Complete** — ROUTE/REWRITE |
| Open order screen | Must not clear Hub C | No evidence Hub state clears on open alone | OK for state; inbox ack can still clear events |
| Pull-to-refresh | Must not clear C | Recompute only | OK |

---

## 2. Coverage gaps (Action Required catalog)

| Candidate event | In Hub C today? | Notes |
|-----------------|-----------------|-------|
| `pending` accept/reject | YES | KEEP |
| `refund_requested` | YES | KEEP |
| Open inquiry | YES | KEEP |
| `cancel_requested` | **NO** | DB + invalidate hub cache exists; RPC **does not count** |
| Post-accept cooking / pickup / delivery steps | **NO** | Process model CTA only — product decide later |
| Review need reply | Dashboard YES / FAB **UNPROVEN** | Writer weak |
| Sold-out / payment / reminders | Events only | Parallel to state; dual UX |

---

## 3. Mixing gaps (must not ship as C PASS)

| Mix | Status after 2-2/2-4 |
|-----|----------------------|
| owner_intake → Member Bell digit | Mitigated by A filter |
| owner_intake → Member App Icon | Mitigated by A + C exclusion LOCK |
| Ops → B_store chat digit write | Not observed |
| Ops + chat UI sum (header / ops toggle) | **Still mixed** — ROUTE in Contract |
| State + fab_owner_orders max() | **Dual source** — ROUTE |

---

## 4. Identity gaps

See `identity-audit.md`. Summary: Hub SQL = store ✅; notify/target/Tier1 = user ❌.

---

## 5. Explicit non-goals for next CODE (until Contract says otherwise)

- Do not change A_member / B_member / B_store formulas.
- Do not start Native / FCM (Slice 2-6).
- Do not treat cooking/delivery Hub badges as in-scope without product YES.
- Do not declare RUNTIME / PRODUCT / HARD LOCK from docs alone.

---

## 6. Suggested next step (outside this audit)

**Slice 2-5 Authority Contract** (still docs-first):

1. Lock Action Required YES/NO for `cancel_requested`, review reply, post-accept steps, fee lane.
2. Lock single C formula + clear = Action Complete.
3. Lock ROUTE rules for Owner Tier1 read vs Hub C.
4. Only then CODE (writers/readers) without reopening A/B/B_store.
