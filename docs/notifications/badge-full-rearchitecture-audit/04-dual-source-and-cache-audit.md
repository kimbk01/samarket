# 04 — Dual-Source and Cache Audit

**Mode:** AUDIT ONLY

---

## Inventory

| Number / surface | Source A | Source B | Pattern | Classification |
|------------------|----------|----------|---------|----------------|
| Bell digit | `notification_events` unread → A keys | (void) list/rowUnread | Digit ignores list | **Intended single** after 2-2; list not used |
| A mark-all | `notification_events` | legacy `notifications` table | Dual write clear | **Legacy residual** |
| Inbox list route | `notification_events` SSOT comment | legacy merge historically | List SSOT events | **Migration debt** if legacy still merged anywhere |
| Member App Icon | A projection + B room sets | Phase-B `notificationAttentionTotal` fallback if A omitted | Fallback dual | **Temporary override risk** |
| Owner Ops C | `store_orders` state RPC | `owner_intake` user_id events | Events ≠ C truth | **Duplicate expression** (events residual) |
| Owner Hub chat | participant room count | snapshot / counter_row cache | Cache HIT + refresh overlay | **Intended cache + projection** (stale risk) |
| Hub CM unread | fresh | `Math.max(current, fresh)` guard | Blocks stale downgrade | **Temporary guard** |
| Bottom / hubs | Domain projection | optimistic room_unread_delta | Merge delta onto previous | **Optimistic dual-apply** |
| Native badge | Web `appIconTotal` | Cap prefs / FCM badgeCount | Absolute set; resume Cap re-echo | **Transport + cache echo** (stale Cap) |
| FCM badge | server MemberAppIconTotal | — | Absolute always-send 0 | **Transport** (Slice 2-6) |
| Messenger popup | room/invite/call local | vs Bell A digit | Two products one chrome | **Duplicate authority UI** |
| C max(state, fab) | — | — | **Forbidden / removed** | Was duplicate authority — DELETED |

---

## High-risk patterns found

| Pattern | Found? | Where |
|---------|--------|-------|
| `max(sourceA, sourceB)` as C authority | **Removed** | store-operation-c / hub builder forbid |
| `max` for CM stale guard | **Yes** | `owner-hub-badge-store` |
| Early return / skip same Cap | **Yes** | NativeBadgeSync |
| Cache HIT old total | **Yes** | hub snapshot SWR, store_order memory, attention memory |
| SQL message sum as room count | **Was** owner FAB; **fixed** to room count in 2-4 | residual legacy targets may linger |
| Server + optimistic sum as product formula | **No** as formula; delta merge exists | projection-authority |
| FCM +1 local | **Not found** primary path | absolute |
| UI exclude filters differ | **Yes** | digit vs list vs popup |
| read/delete updates one store only | **Yes risk** | mark-all dual; Cap may lag Web |
| legacy row + event same logical event | **Yes risk** | mark-all still updates both |

---

## Classification summary

| Kind | Count (approx) | Implication |
|------|----------------|-------------|
| Justified origin + projection | Hub state → FAB digit; participants → B | KEEP shape |
| Dual-read migration | events + legacy mark-all | Must collapse for A rebuild |
| Duplicate authority | Popup B under Bell chrome; owner_intake vs C RPC | Structural FAIL vs product |
| Legacy residual | `notifications` table clear path | Collapse |
| Temporary override | CM max guard; A-omitted App Icon fallback | Rebuild risk |

**Conclusion:** Dual-source / cache / legacy bridges are **accumulative**. Local filter patches can close one gap while leaving mark-all/popup/Cap/legacy open — matches **implementation collapse** risk class.
