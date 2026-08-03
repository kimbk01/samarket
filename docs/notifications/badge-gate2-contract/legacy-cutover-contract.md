# Legacy Cutover Contract (Gate 2)

Gate 1: mark-all and inbox still dual-write `notifications` + `notification_events`.

---

## Fixed choices

| Slot | Decision |
|------|----------|
| **Canonical authority** | `notification_events` for Member A |
| **Compatibility read** | Optional read-only adapter for historical legacy rows **not yet backfilled** — UI must not sum legacy+events into A |
| **Compatibility write** | **Forbidden** after cutover start — no dual mark-all/delete |
| **Cutover point** | Gate 3 Step “Bell A” lands: single canonical writer+reader; dual paths deleted or feature-flagged off |
| **Deletion point** | After backfill + drain window: remove legacy write paths; legacy table may remain archived |
| **Rollback boundary** | Revert Gate 3 Bell A commits only; do **not** reset to `1e2a560c1`; do not re-enable dual-write without new approval |

---

## Legacy unread data choice

**Selected:** `one-time backfill` + short `read-only compatibility adapter`

| Option | Why not alone |
|--------|----------------|
| backfill only | incomplete if writes continue |
| adapter forever | dual authority returns |
| hard drop | data loss risk |
| **backfill + temporary adapter** | measurable drain |

Backfill rule (spec only):

```text
For each legacy notifications row:
  if maps to A_INCLUDE and unread and no matching event
  → insert notification_events with stable dedupe_key
  else skip
Never backfill chat/owner_intake into A
```

---

## Principles

```text
one canonical writer
no legacy dual-write
UI never sums legacy + canonical
attention-key digit removed at Bell A cutover
```
