# Phase 2A Final Report

**Declaration:** `PHASE 2A RUNTIME MAPPING PASS`  
**Not declared:** CODE / RUNTIME / PRODUCT / HARD LOCK · Slice 2-1 not started

---

## A. Start baseline

| Item | Value |
|------|--------|
| HEAD / origin/main | `1e2a560c1` |
| Phase 0 | AUDIT PASS |
| Phase 1 | AUTHORITY CONTRACT PASS (36 tests) + product locks for App Icon exclusions |
| Product runtime changes this phase | **None** (maps/docs/fixtures only) |

## B. Mapping scope

A, B_member, B_store, C_store, Native/FCM, Bell UI/notices design, unread truth plan.

## C–G. Axis verdicts (summary)

| Axis | Headline verdict |
|------|------------------|
| A | Insert SSOT KEEP; attention membership **REWRITE**; owner_intake **DELETE** from Bell |
| B_member | Room facts KEEP; App Icon formula **REWRITE** (drop owner rooms); missed **ROUTE** from Bell |
| B_store | Hub FAB chat KEEP; Member App Icon inflow **DELETE**; identity **REWRITE** toward `store:` |
| C_store | Hub orderAttention KEEP; user_id event writer **REWRITE**; Native **BLOCK** |
| FCM/Native | Absolute set KEEP; payload echo **ROUTE** after MemberAppIcon clean |

## H. owner_intake pollution

```text
notifyStoreOwnerNewOrder
  → appendUserNotification(owner_user_id)
  → attention order_status:owner_intake:{orderId}
  → loadBellExplainUnreadEventRows(user_id)
  → buildNotificationAttentionProjection
  → Bell + App Icon notification axis
  → FCM badge_count / Native echo
```

## I. Owner room → Member App Icon

```text
partition(... owner when owner_user_id===uid)
  → ownerOrderUnreadRoomIds
  → buildChatAttentionProjection
  → storeOrderForAppIcon = owner+buyer
  → appIconTotal → Native/FCM
```

## J. NotificationAttentionTotal keys

Classified in `notification-a-runtime-map.md` (A_member / B_member / C_store / ephemeral / unknown-block). Unknown must not auto-join A.

## K. Unread cursor truth

Design + pure fixtures: `unread-cursor-truth-plan.ts` (+ tests). Not runtime-wired.

## L. Verdict counts (JSON entries)

KEEP 10 · ROUTE 7 · REWRITE 6 · DELETE 1 · BLOCK 2 · UNPROVEN 1 · NOT_FOUND 1 (total 28)  
Critical A/Bell/App Icon pollution removals are mostly **REWRITE** rows (see critical table in `runtime-keep-route-delete-map.md`).

## M. Slice order

`2-1 → 2-2 → 2-3 → 2-4 → 2-5 → 2-6` (see `phase2-implementation-slices.md`)

## N. Revert strategy

Per-slice independent revert; dual-read preferred over hard migration in early A/C split; no full-axis reapply.

## O. Product runtime changed?

**No.**

## P. Judgment

| Gate | Status |
|------|--------|
| PHASE 2A RUNTIME MAPPING PASS | **YES** |
| CODE / RUNTIME / PRODUCT / HARD LOCK | **NO** |
| Auto-start Slice 2-1 | **NO — stop for approval** |

---

## Phase 1 lock correction applied

Previously listed as undecided; now **PRODUCT LOCK**:

- `B_store` ∉ Member App Icon  
- `C_store` ∉ Member App Icon / Native App Icon  
- Member App Icon = `A_member + B_member` only  

Updated: Phase 1 contract doc + pure contract constants + Phase 1 test report note.
