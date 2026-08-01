# Phase 3 Step 1 — Bell / Notification Event SSOT Authority Audit (Read-only)

**Date:** 2026-08-01  
**Status:** AUDIT COMPLETE — IMPLEMENTATION NOT STARTED  
**Phase 1:** RoomUnread CLOSED  
**Phase 2:** Badge SSOT CLOSED + HARD LOCK  
**Forbidden this step:** Badge reopen · RoomUnread · Legacy delete · Heal-as-digit · code implementation · “Bell 숫자만 맞추기”

This audit freezes **Phase 3 product criteria** the same way Phase 2 Step 1 froze Badge.  
Bell is **not** App Icon. Authority = **`notification_events`**.

Canonical prior docs (still valid; Phase 3 must prove Runtime, not invent a second model):

- `docs/notifications/notification-event-ssot.md`
- `docs/notifications/bell-digit-and-inbox-product.md`
- `docs/notifications/status-event-read-lifecycle.md`
- `docs/notifications/dibay-notification-surface-authority-product-lock.md` §7
- `docs/notifications/legacy-inbox-dual-read-compat.md`

---

## 0. Phase 3 product target (fixed)

Bell press / Inbox / Event / Read / Lifecycle / DeepLink / Role must finish **as one SSOT**:

| Kind (must classify) | Unit |
|----------------------|------|
| General message | event (room-bound) |
| Group message | event |
| Trade message | event |
| Customer order message | event |
| Owner order message | event |
| Trade status | attention / product |
| Order status (buyer / owner) | attention / order · role |
| Missed call | event (orphan or room-bound) |
| System | event |
| Admin | event (`admin_notice`; marketing excluded from digit) |

**Read end:** only `notification_events` (`unread=false` / `read_at` / dismiss).  
**Must NOT** clear RoomUnread / App Icon rooms unless a **separate** room mark-read runs.

**Digit / list invariant:** Bell digit unread ID set **=** full Inbox (`tier1_inbox_bell`) unread ID set.

**Phase 3 PASS shape (same as Badge):**

1. Explain Matrix (kinds + IDs)  
2. Writer Authority = 1 insert SSOT (`createNotificationEvent`) + controlled supersede  
3. Lifecycle Runtime (create → read → deep link → role)  
4. Digit == List == DeepLink destination authority  

Then **PHASE 3 — BELL SSOT CLOSED**. Only then Phase 4 Legacy.

---

## 1. Bell Authority Map (product)

```text
Business Event
      ↓
createNotificationEvent   ← THE insert Writer
  (+ dedupe / supersede / destination-end)
      ↓
notification_events rows
      ↓
Bell digit  (eligible unread)
Bell Inbox list  (same ID set on full surface)
DeepLink / Role / Presentation
```

**Neighbor (LOCKED):** RoomUnread → Badge Projection → Native. Bell must not invent App Icon.

---

## 2. Surface inventory (as-is)

| # | Surface | Path | Current source | Phase 3 note |
|---|---------|------|----------------|--------------|
| 1 | Header Bell digit | `PhilifeHeaderNotificationInbox` / Tier1 anchors | `notification-badge-count-store.total` ← Contract B `bellTotal` | Must Explain by kind |
| 2 | Full Inbox page | `MyNotificationsView` + GET `/api/me/notifications` | `fetchNotificationEventsForInbox` · `authority: notification_events` | ID set ≡ digit |
| 3 | Surface-filtered panels | `resolve-tier1-bell-surface` | Subset list; glyph still full digit | Document; do not silent-mismatch |
| 4 | Mark-all | PATCH mark_all_read | Events only | Never RoomUnread |
| 5 | Row tap / thread | `inbox-read-bridge` → thread plan | order / trade / room / single | Role-correct deep link |
| 6 | Destination open | order / trade detail / room visible | status-event lifecycle | Attention end |
| 7 | Push body | `notify-push-dispatcher` | Event + `badge_count=appIconTotal` | Badge LOCK neighbor |
| 8 | Legacy `notifications` table | quarantine | No merge into list | Phase 4 delete |

---

## 3. Writer inventory (as-is)

**Insert SSOT:** `createNotificationEvent` only (`notification-event-repository.ts`).

| Pipeline | Entry | Types |
|----------|-------|-------|
| Message | `notify-message-pipeline` | chat / group / mention / pin / trade / store_order message |
| Missed call | `notify-missed-call-pipeline` | `missed_call` |
| Buyer / owner commerce | `notify-store-commerce` (+ points) | `order_status` (+ supersede) |
| Trade status | `appendUserNotification` / offers | `trade_status` |
| Admin | campaign send | `admin_notice` / `admin_marketing_banner` (digit exclude) |
| Community / points | in-app notify helpers | typed via append |

**Engine shadow:** `lib/notifications/engine/` — not live Writer (contract bans).

---

## 4. Read / Lifecycle inventory (as-is)

| Trigger | Ends |
|---------|------|
| Single / thread / category / room-read / missed-call-read | Matching events |
| Buyer new status notify | Prior same-order buyer status |
| Owner status transition | Owner unread for that order |
| Trade detail opened | Trade status for product |
| Mark-all (full Inbox) | All viewer unread events |

**Forbidden heals as product:** mass clear status to “fix digit”; `mark_all_owner_store_commerce_read` from single-order deep link.

---

## 5. DeepLink · Role (as-is)

- Resolver: `resolve-notification-destination.ts` + registry `deepLinkResolverKey`
- Keys: chat_room · group_room · trade_room · store_order_room · display_route · missed_call · notification_inbox · call_authority
- Role: buyer vs owner attention keys in `notification-attention-key.ts`; customer↔owner path mix = FAIL

---

## 6. Gaps Phase 3 must close (Evidence)

| ID | Gap | Why it blocks PASS |
|----|-----|--------------------|
| G1 | Product digit = distinct `attention_key`; runtime = raw eligible COUNT | Explain Matrix incomplete vs product lock §7 |
| G2 | Chat can stack many events / room → Bell ≠ Bottom (rooms) | Expected unit difference — must be **Explainable**, not “fixed” by equating Badge |
| G3 | `unread_count_only` + `badge_surface` still hits `notification_targets` | Dual path vs Bell events Authority |
| G4 | Owner intake stale (heal exists but not proven as Lifecycle PASS) | Role + Lifecycle incomplete |
| G5 | No Phase-3 Explain Matrix Runtime yet (kinds × IDs) | Cannot declare CLOSED like Badge 2-1 |
| G6 | Writer / DeepLink / Role not yet one Runtime matrix | Fragment risk (exactly what team lead forbids) |

---

## 7. Phase 3 execution order (do not split)

```text
3-0  Charter / this Audit     ← DONE (this doc)
3-1  Bell Explain Matrix      (kinds + event/attention IDs ≡ digit ≡ list)
3-2  Writer + Supersede Authority (insert SSOT=1; end rules proven)
3-3  Lifecycle + DeepLink + Role Runtime (all kinds)
3-4  Digit ↔ Inbox ↔ Destination identity (no dual targets path)
     → PHASE 3 — BELL SSOT CLOSED
Phase 4 Legacy Cleanup only after
```

**DO NOT:** Bell digit-only patch → Inbox-only → DeepLink-only → Role-only in isolation.

---

## 8. Explicit non-goals (this Phase)

- Reopen Badge Projection / Native / RoomUnread  
- Equate Bell digit to App Icon  
- Legacy table DROP (Phase 4)  
- Temporary OEM / Heal digit hacks  

---

## 9. Next gate

**Await explicit approval to start Phase 3-1 (Bell Explain Matrix)** — contracts + Runtime only; no Badge changes.
