# Migration Compatibility

**Mode:** PLAN ONLY · **no DROP / no data wipe**

---

## Policy

| Rule | |
|------|--|
| Immediate DROP of applied migrations | **FORBIDDEN** |
| Data-destructive rollback | **BLOCKED** until separate plan |
| Additive columns/RPCs used by KEEP code | **KEEP** |
| Consumers broken by P0 revert of 2-6 | Verify TS still compiles (2-6 has **no** SQL) |

---

## Classification

### MIGRATION_KEEP

| Migration | What | Why KEEP |
|-----------|------|----------|
| `20261016120000_c_store_attention_cancel_pending.sql` | `cancel_pending_count` column + RPC/`get_owner_hub_badge_snapshot` field | Additive; C_store Action Required needs cancel; KEEP with Slice 2-5 code |

### MIGRATION_REVIEW (pre-existing hub — do not drop)

| Migration | What | Review after P0/R* |
|-----------|------|--------------------|
| `20260520120000_get_owner_hub_store_attention_counts_rpc.sql` | attention RPC base | C consumers still call |
| `20260525180000_owner_hub_badge_snapshot_rpc.sql` | hub snapshot | Cache path R5 |
| `20260519120000_hub_badge_user_chat_unread_parts_rpc.sql` | chat unread parts | Compat |
| `20260522120000_hub_badge_user_unread_counters.sql` | counters | Compat |
| `20260525120000_hub_badge_cm_unread_room_count_column.sql` | CM room count col | Compat |
| `20260608120000_hub_badge_notification_target_bundle_columns.sql` | target bundles | Compat; not A SSOT |
| `20260830120000_notification_unread_segmented_badge_indexes.sql` | indexes | Harmless additive |
| `20261009130000_count_notification_events_badge_taxonomy.sql` | taxonomy count helper | REVIEW — must not become dual A authority |

### BLOCKED (no plan to run)

| Action | Status |
|--------|--------|
| DROP `cancel_pending_count` | BLOCKED |
| Truncate `notification_events` / force unread=0 | BLOCKED |
| Revert migration files from git history on Production DB | BLOCKED |

---

## Post–P0 (2-6 revert) runtime vs schema

| Check | Expected |
|-------|----------|
| C Hub RPC columns present | Yes — KEEP code still uses |
| FCM badge omit-when-zero returns | Pre-2-6 behavior — **no SQL impact** |
| A dual digit/list still present | Yes until R1–R2 — expected interim |

**Compat statement:** P0 git revert of 2-6 does **not** require migration changes. Keeping 2-5 migration while rebuilding A is **compatible**.

---

## After R1–R2 (A event ID SSOT)

| Need | Migration? |
|------|------------|
| Query unread A event IDs by user | Prefer existing `notification_events` + indexes |
| New RPC for `AUnreadEventIds` | Optional additive later — **not** required to DROP old |
| Legacy `notifications` mark-all | Code DELETE_AFTER_REBUILD — table may remain unused |

No destructive migration in rebuild R1–R6 plan.
