# DIBAY Notification / Badge — Runtime Red-team Gate

**Date:** 2026-08-01  
**Static baseline (kept):** Bottom 5 / Trade 2 / Customer 23 / Owner 3 / App Icon 33 / Bell 2 — ID sets aligned **on participant counters**.  
**This document does NOT grant Product PASS.**

---

## Current cold verdict

```text
STATIC AUTHORITY PASS          — projection ID sets match each other (participant-sourced)
ROOM UNREAD SSOT               — FAIL (official message_reads formula vs participant.unread_count)
NOTIFICATION EVENT LIFECYCLE   — CODE PASS (prior) + Bell stale heal applied
APP ICON SERVER                — PASS only as union of participant room IDs
APP ICON LAUNCHER              — UNVERIFIED
FCM / NATIVE                   — UNVERIFIED
RUNTIME TRANSITION             — UNVERIFIED
IOS                            — BLOCKED
PRODUCT PASS                   — NO
LOCK                           — NO
```

---

## §1 Canonical unread invariant — MEASURED FAIL

**Official recount formula** (same as `community_messenger_apply_room_read_mark_open_tail`):

```text
unread =
  count(messages m
    where m.room_id = room
      and m.deleted_at is null
      and m.sender_id is distinct from viewer
      and not exists message_reads(m.id, viewer))
```

**Evidence:** `.qa-logs/badge-bell-phase2/participant-unread-official-formula-audit.json`  
Viewer: `asas55` / `35dd245c-…` · rooms with `participant.unread_count > 0` and non-empty `last_message`:

| Bucket | N |
|--------|--:|
| match | **6** |
| stale_counter (official=0, participant>0) | **20** |
| undercount (official > participant) | **3** |
| overcount (official < participant, official>0) | **4** |

By domain:

| Domain | match | stale | under | over |
|--------|------:|------:|------:|-----:|
| general_direct | 3 | 0 | 2 | 0 |
| trade | 0 | **2** | 0 | 0 |
| store_order | 3 | **18** | 1 | 4 |

**Implication:** Static App Icon / Hub / Bottom ID sets are **internally consistent** but rest on a **counter that is not yet proven equal to readable unread messages**. Especially `store_order` (18 stale). Example trade room `97aaf3dc-…`: `last_read_at` after `last_message_at`, `message_reads` cover others’ messages, yet `unread_count=1`.

**DO NOT** fix by changing Bottom/App Icon math alone. Fix **cursor / counter / message_reads writer** (or transactional recompute) first.

**§11 redesign gate:** **TRIGGERED for review** — repeated stale counters on store_order without open-room mark_read. Next step is root-cause of increment/backfill paths, not another projection patch.

---

## Red-team remaining (must execute before PASS)

| # | Gate | Status |
|---|------|--------|
| 1 | participant ↔ official unread invariant | **FAIL measured** |
| 2 | General/Group create→read transitions ×3 | UNVERIFIED |
| 3 | Trade list IDs ↔ Hub + transitions | UNVERIFIED (IDs may include stale) |
| 4 | Customer 23 accessible UI rows + transitions | UNVERIFIED |
| 5 | Owner 3 by-store + no mass mark_all | UNVERIFIED |
| 6 | Bell subtype create/read / no stale re-stack | UNVERIFIED |
| 7 | App Icon server→FCM→Badge.get→**launcher** | UNVERIFIED |
| 8 | FCM tap matrix cold/warm/killed | UNVERIFIED |
| 9 | Multi-device read | UNVERIFIED |
| 10 | Legacy importer 0 after lifecycle PASS | NOT STARTED |
| 11 | Redesign vs keep structure | **Review triggered by §1** |

---

## Three Authority model (unchanged; must be true at runtime)

```text
A. Room Unread SSOT     = cursor + message_reads + unread_count (transactional)
B. Notification Event SSOT = notification_events lifecycle
C. Badge Projection SSOT   = distinct room/attention ID unions per surface
```

Projection PASS without A is **not** Product PASS.

---

## Related evidence files

- `authority-id-set-matrix.json` — static projection sets
- `stale-owner-intake-heal-*.json` — Bell owner intake heal
- `participant-unread-official-formula-audit.json` — this §1 FAIL
- `docs/notifications/dibay-notification-surface-authority-product-lock.md`
- `docs/notifications/notification-event-ssot.md`
