# Runtime KEEP / ROUTE / DELETE / REWRITE / BLOCK Map (Phase 2A)

**HEAD:** `1e2a560c1`  
**Product locks:** MemberAppIcon = A_member + B_member; B_store/C_store ∉ Member Bell/App Icon/Native.

Counts below are **mapping entries** (not line counts). Detail in per-axis maps + `runtime-authority-map.json`.

---

## Summary counts

From `runtime-authority-map.json` (**28** entries):

| Verdict | Count |
|---------|-------|
| KEEP | 10 |
| ROUTE | 7 |
| REWRITE | 6 |
| DELETE | 1 |
| BLOCK | 2 |
| UNPROVEN | 1 |
| NOT_FOUND | 1 |

Critical pollution removals are primarily tagged **REWRITE** (stop counting / change writer) plus path **DELETE** semantics in the critical table below — not only the single JSON `DELETE` row.

---

## Critical DELETE / REWRITE (must ship before claiming App Icon/Bell CODE PASS)

| ID | Path | Verdict | Slice |
|----|------|---------|-------|
| D1 | owner_intake → NotificationAttentionTotal → Bell | **DELETE** from A | 2-2 |
| D2 | owner_intake → App Icon notification axis | **DELETE** from Member App Icon | 2-2 |
| D3 | `ownerOrderRoomIds` → ChatAttention → Member App Icon | **DELETE** from Member App Icon | 2-3/2-4 |
| D4 | `storeOrderForAppIcon = owner + buyer` | **REWRITE** buyer-only for member | 2-3 |
| R1 | `notifyStoreOwnerNewOrder` user_id events | **REWRITE** → C_store | 2-5 |
| R2 | `buildNotificationAttentionProjection` membership | **REWRITE** A-only | 2-1/2-2 |
| R3 | orphan missed in Bell attention | **ROUTE** → B_member | 2-3 |
| B1 | B_store / C_store on Native App Icon | **BLOCK** | — |
| B2 | marketing → Bell inbox digit | **BLOCK** | — |
| B3 | Owner ops → Member Bell | **BLOCK** | — |

---

## KEEP highlights (safe to reuse)

- RoomUnread participant SSOT (do not reopen writers in badge rebuild)
- `createNotificationEvent` as single insert API (with classification)
- Bottom Chat GD+Group projection shape
- Owner Hub `storeOrderChatUnread` vs `orderAttention` field split
- `syncNativeBadgeCount` absolute set-only
- Android/iOS Delivery Adapter absolute apply
- Header Bell / MyNotifications **UI shells** (source ROUTE)

---

## Bell UI / notices (design only — not implementing)

| Surface | Current | Plan |
|---------|---------|------|
| Bell popover | PhilifeHeaderNotificationInbox | KEEP UI primitive; A-only data |
| `/notifications` | MyNotificationsView / my routes | ROUTE filters; expand actions |
| `/notifications/[id]` | partial deep links | REWRITE targets per contract |
| `/notices`, `/notices/[id]` | **NOT FOUND** as dedicated notice domain | REWRITE new domain — **do not** reuse admin inquiry chat |
| Admin inquiry | support conversation | **BLOCK** reuse as notices |

---

## Machine map

See `runtime-authority-map.json` for path/symbol/classification/slice fields.
