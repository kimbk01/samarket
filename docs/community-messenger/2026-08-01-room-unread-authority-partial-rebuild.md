# DIBAY Room Unread Authority — PARTIAL REBUILD (2026-08-01)

**Verdict:** `ROOM UNREAD PARTIAL REBUILD REQUIRED`  
**Status:** `IMPLEMENTATION IN PROGRESS` · `PRODUCT PASS 미선언` · `LOCK 미선언`

## Decision

| Layer | Action |
|-------|--------|
| Bell / `notification_events` | KEEP |
| Badge Projection Builder | KEEP (cutover **blocked** until Room Unread Runtime PASS) |
| Deep-link / Push / NativeBadgeSync | KEEP |
| Room Unread | **PARTIAL REBUILD** (this doc) |
| Phase 8B mark-read SQL | **QUARANTINE** — do not production-wire |
| Native launcher 0 | **Separate track** after Room Unread PASS |

## Authority

```
Authority  = last_read_message_id + ordering (created_at, id)
Projection = community_messenger_participants.unread_count
```

- `last_read_at` = auxiliary only
- No new room-local sequence in v1 (existing mark_read already uses `created_at, id`)
- `notification_targets` = derived only

## Canonical formula

See `dibay_cm_canonical_unread_count` / `describeCanonicalUnreadFormula()`:

peer messages after cursor, `deleted_at IS NULL`, join/leave aware.

## RPCs

| RPC | Migration |
|-----|-----------|
| `dibay_mark_room_read_atomic` | `20261014120000_dibay_room_unread_authority_v1.sql` |
| `dibay_append_room_message_atomic` | same |
| `community_messenger_apply_unread_for_text_message` (cursor preserve) | same |
| `community_messenger_send_text_message` (cursor preserve) | `20261014121000_…_send_text_cursor_preserve.sql` |

## Cutover progress

| Step | Status |
|------|--------|
| Canonical cursor contract | DONE |
| Mark-read atomic RPC | DONE (SQL) |
| Append atomic RPC | DONE (SQL; product callers pending cutover) |
| store_order `readOrderChat` → mark-read RPC | DONE (TS) |
| Recipient `last_read_at` wipe removed | DONE (SQL + call_stub patch) |
| All message types on append RPC | DONE for image/sticker/voice/file/call_stub/store_order system (fail-closed). text=`send_text` TX. community_post_share still insert+apply_unread |
| GD/Group/Trade mark-read adapter | DONE (service prefers atomic; fallback if RPC missing) |
| Migration dry-run | Script ready — run against DB (`scripts/room-unread-authority-migration-dry-run.mjs`) |
| Migration apply | **FORBIDDEN until dry-run reviewed** |
| Badge Projection cutover | **BLOCKED** (`ROOM_UNREAD_BADGE_PROJECTION_CUTOVER=false`) |
| Native launcher | Separate |

## Frozen

- heal-* operational runs
- counter-only mark-all
- Phase 8B production wiring
- Badge / App Icon / FCM number patches
- FULL notification rebuild

## Contract module

`lib/messenger/contracts/room-unread-authority.ts`
