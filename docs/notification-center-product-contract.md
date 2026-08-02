# Notification Center Product Contract (DOCUMENT CONTRACT DRAFT)

**Status:** DOCUMENT CONTRACT DRAFT — 2026-08-02  
**Identity product decision:** APPROVED — member Bell/App Icon exclude Store ops (`notification-badge-authority.md` §0–§1)  
**NOT declared:** CODE PASS · RUNTIME PASS · Slice 2 implementation Yes  
**Code / UI changes:** forbidden until separate implementation Yes.

**Related:** [`notification-badge-authority.md`](./notification-badge-authority.md)

---

## 0. Member Identity vs Store Operational Identity (APPROVED)

Authority layers: Identity (Member|Store|Admin) → Domain → Surface — see badge authority §0.

Tier1 Notification Center is **Member Identity only**.

| In personal center | Out of personal center |
|--------------------|------------------------|
| Member A: trade status, **customer** order/delivery status, notices, account/security, approved persist campaigns | Store owner intake / cooking / delivery / settlement waiting / owner fee ops |
| Optional B summary: unread **member** rooms + missed — navigate only | Owner FAB / delivery-bottom / Store Admin / Dashboard / owner order hub |
| | Missed-call ledger replica; chat message replicas; owner-side order chat |

**Owner operational inbox** = Store Identity surfaces only (`OwnerNotificationList`, `owner_commerce_inbox`, dashboard), keyed by `store_id`.

**mark-all-read:** personal clears **member** notifications only; Store Admin clears **store** attention only — never shared.

LIVE conflict: owner commerce → `notification_events.user_id = owner` still can inflate personal digit until Slice 2b.
---

## 1. Product role

Tier1 header bell opens the **member A-axis Notification Center** — personal inbox of system / trade / **customer** order·delivery / notice / approved campaign events.

**Not** a second chat list. **Not** a missed-call ledger. **Not** the store owner ops queue.

---

## 2. LIVE surfaces (audit — discard / keep)

| Surface | Path | LIVE role | Draft disposition |
|---------|------|-----------|-------------------|
| Tier1 / Philife header inbox | `components/philife/PhilifeHeaderNotificationInbox.tsx` via `Tier1NotificationAnchor` | Header digit + popup list from `notification_events` | **KEEP → evolve** into single A-axis center |
| My notifications page | `components/my/MyNotificationsView.tsx` · `/my/notifications` (and related) | Full inbox + mark-all | **KEEP** as full-page A center |
| Messenger pinned “알림 센터” | `CommunityMessengerBellPinnedAlerts.tsx` | Local sum: groupInvite + missed + important | **DISCARD CANDIDATE** — not A digit authority |
| Messenger notification sheet | `MessengerNotificationCenterSheet.tsx` · model `messenger-notification-center-model.ts` | Mixed missed_call + important rooms + invites | **DISCARD CANDIDATE** — B must not be A list replicas |
| Owner store notif list | `OwnerNotificationList.tsx` | Store-scoped commerce | **KEEP** domain-scoped; not global A digit |

Screenshot match (Slice 1): header copy `cm_ui_notification_center` (“알림 센터”), line `부재 통화 · 중요 대화`, badge = local sum — **not** `bellTotal`.

---

## 3. Target IA

### 3-1 Mobile

- Full-screen center or stable full-height sheet  
- Fixed header + category filter  
- List scrolls independently  
- Bottom actions must not cover cards  

### 3-2 Tablet / Desktop

- Wide side sheet or anchored panel (not stretched mobile popup)  
- Layout helper exists: `lib/ui/tier1-notification-inbox-motion.ts` — evolve, do not invent parallel popup math  

### 3-3 Header chrome (required)

- Title: 알림  
- Unread A total  
- Settings entry  
- Close / back  
- **모두 읽음** (A only)  
- Overflow: 읽은 알림 삭제 · 전체 삭제 · 알림 설정  

**모두 읽음 ≠ 전체 삭제.**

---

## 4. Categories (A list filters)

Minimum:

| Filter | Typical types |
|--------|----------------|
| 전체 | all A |
| 거래 | `trade_status` (+ related A) |
| 주문·배달 | **Customer** `order_status` / delivery-flavored member A only (owner intake → store admin, not this filter) |
| 공지 | `admin_notice` → notices landing |
| 혜택·이벤트 | persist campaigns only |
| 계정·보안 | account/security A events |

**Excluded from A list as origin rows:** chat message events, missed_call rows (use summary card), `admin_test` product display, `incoming_call_signal`.

---

## 5. Communication summary card (not unread origin)

Optional top card(s) inside center:

| Card | Shows | On select |
|------|-------|-----------|
| Unread conversations | K = unread rooms (policy: all domains or GD+Group — **OPEN**) | Messenger home / relevant hub |
| Missed calls | M = unacknowledged missed | `/community-messenger/calls/logs` (or product call tab) |

Cards **read** B Projection; they **must not** `createNotificationEvent` clones.

---

## 6. Card anatomy (A row)

- Category label  
- Title / 1–2 line body (safe translate — no raw QA event ids)  
- Relative or absolute time  
- Unread affordance  
- Domain icon / thumb  
- Whole-card select → read then navigate  
- Item menu: 읽음/안 읽음 · 삭제  
- Invalid destination → safe fallback (my notifications / home)

**Forbidden:** QA strings as title; meaningless “시스템 메시지” loops; per-row fake “1” badge noise; trash-only without meaning.

---

## 7. Read · delete · mark-all (A)

Align with `app/api/me/notifications/route.ts` PATCH capabilities and `notification-event-ssot.md` end modes.

| Action | Server | Digit | App Icon | B axis |
|--------|--------|-------|----------|--------|
| Select unread | `read_at` | A− | recompute | unchanged |
| Select already-read | no digit change | — | — | — |
| Delete unread | dismiss/delete | A− | recompute | unchanged |
| Delete read | list only | 0 | 0 | unchanged |
| Mark all read | **member** A unread→read | member A=0 | App Icon drops member A only | **unchanged**; **store attention unchanged** |
| Delete all / delete read-only / delete category | scoped `deleted_at` | A shrink | recompute | **unchanged** |

Failed mutation: no permanent optimistic lock; versioned resync; no stale cache resurrection.

---

## 8. Push tap contract (target)

| Kind | Order |
|------|-------|
| A system / notice | identify notificationId/dedupe → mark read → Projection → navigate destination |
| Chat | resolve domain+room → navigate → **readable mount** → read cursor → recompute (no clear on failed entry) |
| Missed / VoIP | delivery ≠ missed create; ack only after product missed policy |
| `persist_to_inbox=false` promo | OS only; no A digit; deep link only |

Destinations: trade detail, order detail, `/notices/[id]`, campaign/event detail, settings — see `docs/notices-campaign-domain.md`.

---

## 9. Empty / error / loading / a11y (draft)

| State | Behavior |
|-------|----------|
| Loading | skeleton / prior Projection; no invented 0 flash that sticks |
| Empty A | clear empty copy; summary cards may still show B |
| Error | retry; do not claim read |
| A11y | dialog label, focus trap on sheet, unread announced |

---

## 10. Immediate reflection

After mark-all / item read / delete:

- Card state updates  
- Bell digit updates  
- App Icon via same Projection subscription  
- Other open surfaces same store  
- Server success + version prevents stale snapshot rollback  

---

## 11. Conflicts with LIVE LOCK / UI

| LIVE | Draft | Notes |
|------|-------|-------|
| `bell-digit-and-inbox-product.md` — full inbox includes chat so list matches digit | Digit = A only; chat not in digit (already Phase B) but list still may show chat history | List identity rules must be rewritten under Phase 3 reopen |
| Phase 3-4 Bell Runtime Identity — digit ≡ inbox unread set | A-only list set must equal A digit | Requires Phase 3 identity redefinition |
| Surface product lock §7 kinds table lists chat + missed in Bell inbox | Remove from A list; summary only | Product doc update on LOCK reopen |
| Messenger mixed center | Discard candidate | Slice 4 |

---

## 12. Verdict

**DOCUMENT CONTRACT DRAFT only.**
