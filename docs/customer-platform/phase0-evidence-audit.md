# DIBAY Customer Platform — Phase 0 Evidence Audit

**Date:** 2026-08-05  
**Mode:** AUDIT ONLY — no code / migration / schema changes  
**Master Plan:** PARTIAL (not PASS)  
**Phase 0–1 execution contract:** LOCK candidate (this pack + prior 4 corrections)  
**Roadmap:** `phase-roadmap.md` — FINAL governance shape · Exit Gates · RRR (no more Phases)  
**Exit Gates:** `phase-exit-gates.md`  
**Cleanup reservation:** `phase1.5-cleanup-contract.md`  
**Freeze:** `phase7.8-architecture-freeze-audit.md`  
**RRR:** `release-readiness-review.md`

Verdict labels: `PROVEN` | `PARTIAL` | `FAIL` | `ABSENT` | `NOT_PROVEN`

---

## 1. Evidence Matrix

| ID | Claim | Evidence | Verdict |
|----|-------|----------|---------|
| E01 | Admin daily work signals exist in code for charges/reports/alerts | `app/api/admin/admin-bell/route.ts` | PROVEN |
| E02 | Operator interview finalized daily priority | Not performed this Phase 0 | NOT_PROVEN |
| E03 | Legacy Baemin/Yogiyo/Karrot L1–L10 DEVICE | No capture; prior doc says not on device | NOT_PROVEN |
| E04 | `member_admin_note_*` tables in migration | `20261017120000_member_admin_note_threads.sql` | PROVEN |
| E05 | notes RLS policies in migrations | No POLICY / ENABLE RLS for these tables | FAIL (API uses service_role) |
| E06 | Member can create thread | `createMemberNoteThread` ← `POST /api/me/admin-notes` | PROVEN |
| E07 | Admin can reply only on existing thread | `POST /api/admin/member-notes/[threadId]` — no create thread API | PROVEN |
| E08 | Admin 1:1 initiate (Inbox) | No `createAdminNoteThread` | ABSENT |
| E09 | notes delete / archive | No DELETE/soft-delete columns or APIs | ABSENT |
| E10 | notes → Bell/FCM via canonical dispatcher | `notifyMemberOfAdminNote` → `createAndDispatchNotificationEvent`; test forbids direct `dispatchPushForUser` | PROVEN |
| E11 | `app_notices` CREATE migration in repo | grep migrations = 0 | FAIL (gap) |
| E12 | `app_notices` typed + read paths | `lib/types/settings-db.ts`, `GET /api/me/settings/notices`, Admin list | PARTIAL |
| E13 | Admin Notice create/edit routes | only `app/admin/app/notices/page.tsx` | FAIL |
| E14 | Settings merges board + push events | `mergeMemberNoticeListItems` in notices route | PROVEN |
| E15 | Campaigns are send engine | `campaign-send-user.ts` → `createNotificationEvent` + `dispatchPushForUser` | PROVEN |
| E16 | Customer Platform unified Dashboard | No CP Dashboard UI; admin-bell is partial Action seed | ABSENT / PARTIAL seed |
| E17 | Member/Store point balance separation | `profiles.points` vs `stores.point_balance` | PROVEN |
| E18 | Point dual-write (ledger + balance UPDATE) | `spendUserPoints`, Admin PATCH users points, store adjust RPC | PROVEN (authority gap vs ledger-only goal) |
| E19 | PHP↔Point Admin rate SSOT | `point_plans` rows; store `STORE_POINT_CHARGE_PAYMENT_RATIO=1` | PARTIAL / FAIL vs rate_version goal |
| E20 | Participatory Event product | No event participation SSOT | ABSENT |

---

## 2. Admin Daily Operations Map

### 2.1 Code-backed Action signals (PROVEN)

| Ops language | Source | Status filter |
|--------------|--------|---------------|
| 미처리 회원 입금 | `point_charge_requests` via admin-bell | `pending` \| `waiting_confirm` \| `on_hold` |
| 미처리 매장 입금 | `store_point_charge_requests` | `pending` |
| 신고 대기 | `reports` + `store_reports` | pending / open |
| 배달 운영 알림 | `delivery_operation_alert_events` | open / acknowledged |

### 2.2 Action Queue (contract) vs code readiness

| Action Queue card | Code path today | Verdict |
|-------------------|-----------------|---------|
| 미답변 문의 | `member_admin_note_threads.admin_unread_count > 0` via `GET /api/admin/member-notes` — **not in admin-bell** | PARTIAL |
| 미처리 회원 입금 | admin-bell `user_charges` | PROVEN |
| 미처리 매장 입금 | admin-bell `store_charges` | PROVEN |
| 실패 Push | `admin_notification_campaigns` status `failed` / `partially_failed` or `failed_count` — list API filterable | PARTIAL (no dashboard card API) |
| 승인 대기 포인트 작업 | charge queues only; separate “pending adjust approval” workflow | ABSENT (adjust is immediate) |
| 오늘 예약 발송 검수 | campaigns `status=scheduled` + `scheduled_at` — GET list supports status | PARTIAL |

**Reports/alerts:** in admin-bell but **outside** Customer Platform Action Queue contract (delivery/moderation). Keep as optional Monitoring or separate Ops — do not mix into CS Dashboard without Phase 1 boundary LOCK.

### 2.3 Monitoring (not Action)

| Monitoring card | Code path | Verdict |
|-----------------|-----------|---------|
| 읽지 않은 관리자 쪽지 (member_unread) | thread `member_unread_count` — no admin aggregate API | PARTIAL / ABSENT aggregate |
| 공지 열람률 | no board read analytics SSOT | ABSENT |
| Push 성공·실패율 | campaign `sent_count` / `failed_count` / deliveries | PARTIAL |
| 포인트 지급·회수 현황 | ledgers + charge lists | PARTIAL |

### 2.4 Daily start order (contract draft — operator interview NOT_PROVEN)

```
Dashboard Action Queue
  → 실패 Push / 오류성 발송
  → 미처리 입금 (회원 → 매장)
  → 미답변 문의
  → 오늘 예약 발송 검수
Monitoring (after / parallel)
  → Push 성공률, 쪽지 미읽음, 지급·회수 추이
```

Operator interview required before calling this order FINAL.

---

## 3. Dashboard Card → API / Table Mapping

| Card | Layer | API (existing) | Table / field | Gap for Phase 2+ |
|------|-------|----------------|---------------|------------------|
| AQ: 미답변 문의 | Action | `GET /api/admin/member-notes` client-filter `admin_unread_count>0` | `member_admin_note_threads` | Add count to admin-bell or CP summary |
| AQ: 회원 입금 | Action | `GET /api/admin/admin-bell` → `user_charges`; `GET /api/admin/point-charges` | `point_charge_requests` | Reuse |
| AQ: 매장 입금 | Action | admin-bell `store_charges`; `GET /api/admin/store-point-charges` | `store_point_charge_requests` | Reuse |
| AQ: 실패 Push | Action | `GET /api/admin/notification-campaigns?status=failed` (+ partially_failed) | `admin_notification_campaigns` | Dedicated summary optional |
| AQ: 승인 대기 포인트 | Action | — | — | ABSENT workflow |
| AQ: 예약 발송 검수 | Action | `GET /api/admin/notification-campaigns?status=scheduled` | campaigns `scheduled_at` | Date filter may need client |
| MON: 쪽지 미읽음 | Monitoring | none aggregate | `member_unread_count` | New count query later |
| MON: 공지 열람률 | Monitoring | — | — | ABSENT until notice read SSOT |
| MON: Push rates | Monitoring | campaign row tallies + `[id]` deliveries | campaigns / `notification_campaign_deliveries` | Reuse |
| MON: 포인트 현황 | Monitoring | `/api/admin/points/ledger`, store ledger, charges | ledgers | Reuse |

**Seed reuse:** extend `admin-bell` categories for notes unread + failed/scheduled campaign counts — **design only in Phase 1; implement Phase 2+.**

---

## 4. Legacy UX Flow L1–L10

| ID | Scenario | 배민 | 요기요 | 당근 |
|----|----------|------|--------|------|
| L1 | 내정보 → 고객센터 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| L2 | 공지 목록 → 상세 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| L3 | FAQ → 문의 유도 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| L4 | 문의 작성 → 히스토리 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| L5 | 답변 Bell/푸시 → 원본 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| L6 | 운영 메시지함 → 삭제/보관 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| L7 | 이벤트/혜택 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| L8 | 포인트/쿠폰/머니 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| L9 | 사업자 비용/포인트 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| L10 | Bell 유형별 도착지 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |

Repo ref: `docs/notifications/badge-authority-rebuild-phase0/legacy-notification-benchmark.md` — PUBLIC only, “Not verified on device”.

**Classification (채택/충족/미채택):** blocked until DEVICE or approved official screens.

---

## 5. Inquiry / Inbox Physical Decision Report

### 5.1 Product boundary (already LOCK in Phase 0–1 contract)

| | Inquiry | Inbox |
|--|---------|-------|
| Starter | Member | Admin |
| Audience | one thread | **one member only** (no segment) |
| Segment/broadcast | Notice / Marketing + Engine | **forbidden as Inbox SSOT** |

### 5.2 notes capability audit

| Capability | Evidence | Verdict |
|------------|----------|---------|
| Schema threads/messages | migration 20261017120000 | PROVEN |
| Status open/answered/closed | CHECK constraint | PROVEN |
| Unread counters | member/admin_unread_count | PROVEN |
| RLS | none in migrations; service_role APIs | FAIL / rely on API gate |
| Member create | `createMemberNoteThread` | PROVEN |
| Admin create thread | no API | ABSENT |
| Admin reply | `postNoteMessage` admin | PROVEN |
| Delete / archive | — | ABSENT |
| Attachments / assignee / category | — | ABSENT |
| Search/filter Admin | list 200 ordered by last_message | PARTIAL |

### 5.3 Physical decision (Phase 0)

**Decision: DEFER physical choice — do not LOCK `conversation_type` merge.**

| Option | Fit | Risk |
|--------|-----|------|
| A. Extend notes (`conversation_type`, admin create, delete/archive) | High reuse for Inquiry; Inbox needs new writers | RLS + service_role exposure; migration of semantics |
| B. New Inbox table + keep notes as Inquiry-only | Clean Admin-start / delete policies | More schema; dual Admin Support UIs |

**Phase 0 recommendation (not schema LOCK):**

1. Treat **all existing notes rows as Inquiry-shaped** (member-started) for product mapping — **without** running a migration that stamps `inquiry`.
2. **Inbox** requires Admin-start + delete/archive → either Option A columns **or** Option B; choose in Phase 1 design review after RLS plan.
3. **Do not** use notes or Inbox for segment send (use Notice/Marketing + Engine).

**Inquiry physical short-term:** reuse `member_admin_note_*` as Inquiry implementation candidate.  
**Inbox physical:** **UNDECIDED** (A vs B) — blocked on delete/archive/Admin-start + RLS design.

---

## 6. Notice SSOT Gap Report

| Layer | Status | Verdict |
|-------|--------|---------|
| Intended SSOT | `app_notices` | LOCK (product) |
| CREATE migration | missing in repo | FAIL |
| Runtime table in prod | not queried this audit | NOT_PROVEN |
| Admin list | `AdminAppNoticesPage` client select | PARTIAL |
| Admin create/edit | routes ABSENT | FAIL |
| Board fields | id, title, body, is_active, created_at — no schedule/ends_at in type | PARTIAL |
| Send engine | Campaigns `type=notice\|system\|marketing` | PROVEN |
| Dual read | Settings merges board + `notification_events` admin_notice | FAIL vs P1 |
| Push body store | event title/body copy of campaign | PROVEN (arrival row OK; must not be long-term notice SSOT) |

### Phase 2 work scope (LOCKED as work items, not implemented)

1. Complete `app_notices` migration/SSOT fields needed for publish window (if missing in live DB — verify first).
2. Admin Notice CRUD (create/edit/publish/end) writing **only** `app_notices`.
3. “Send push” action creates Campaign job **referencing notice id** (no second body authoring) — design; may need campaign payload field.
4. **Remove** Settings push-row merge (`mergeMemberNoticeListItems` push half + event select in `GET /api/me/settings/notices`).
5. App CS notice list/detail reads **board only**.
6. Bell tap → CS notice detail (not `/notifications/[id]` as permanent home for notice content).
7. Bell dismiss ≠ board delete.

**Out of Phase 2:** FAQ full product optional same phase if scoped; Event; Inbox physical; Point ledger authority rewrite.

---

## 7. Notification Writer Duplication Map

### 7.1 Paths to FCM (`dispatchPushForUser` call sites, non-test)

| Caller | Domain | Via event? | Customer Platform? |
|--------|--------|------------|--------------------|
| `notify-push-dispatcher.ts` | after `createAndDispatchNotificationEvent` | Yes | Shared engine path |
| `campaign-send-user.ts` | Campaigns | createNotificationEvent then **direct** dispatchPushForUser | Engine (PROVEN) |
| Call push helpers (incoming/cancel/answered) | Calls | Often push-first | Outside CP |
| `app/api/admin/push/test` | Test | Direct | Ops test |
| web-push side effects | Web | Side | Outside / parallel |

### 7.2 Customer Platform–relevant writers → events

| Writer | Type today | Deep link | Issue |
|--------|------------|-----------|-------|
| Campaign send | `admin_notice` / marketing banner | routeUrl | OK as Engine |
| notes admin reply | `admin_notice` + previewKind member_admin_note | `/notifications/notes/{id}` | **Same type as campaign notice** — taxonomy collision PARTIAL/FAIL |
| `notify-user-points` | via appendUserNotification | `/mypage/points` | OK; not ledger-row |
| `notify-store-points` | appendUserNotification | store points routes | OK |
| Community reward/reclaim | ledger only | — | no Bell ABSENT |

### 7.3 Bypass assessment (CP)

- Notes: **no** direct `dispatchPushForUser` in service — PROVEN canonical.
- Campaigns: intentional Engine path with in-app event + push — PROVEN.
- Duplicate **content** risk: Settings merge + Bell both show campaign/notice bodies — FAIL vs P1.
- Duplicate **type** risk: notes reply and notice campaigns share `admin_notice` — PARTIAL (fixable via previewKind/dedupe; product taxonomy not separated).

**Phase 6 (later):** split taxonomy (`notice_published`, `inquiry_answered`, `inbox_message_received`, …). Not Phase 2 blocker if deep links correct and merge removed.

---

## 8. Member vs Store Point Boundary Re-check

| Axis | Member | Store | Verdict |
|------|--------|-------|---------|
| Balance | `profiles.points` | `stores.point_balance` | PROVEN separate |
| Ledger | `point_ledger` | `store_point_ledger` | PROVEN |
| Admin gate | `requireAdminPermission("point")` | `requireAdminApiUser()` (broader) | PARTIAL (permission model differs) |
| Charge approve | `/api/admin/point-charges` | `/api/admin/store-point-charges` | PROVEN separate |
| Manual adjust | `PATCH .../users/[id]/points` + ledger | `POST .../store-points/[id]/adjust` → RPC | PROVEN separate |
| Rate SSOT | `point_plans` | `STORE_POINT_CHARGE_PAYMENT_RATIO` const | PARTIAL — no shared Admin Rates UI |
| Transfer Member↔Store | — | — | ABSENT (good) |
| Admin IA target | Points > Member first | Points > Store first | Contract LOCK; menu not yet |

---

## 9. Phase 1 LOCK Document Amendment

Amend Phase 0–1 execution contract with Phase 0 findings:

### LOCK (unchanged + confirmed)

- P1–P10  
- Bell ≠ SSOT; original in domain/CS  
- Admin starts at Customer Platform Dashboard (Action vs Monitoring)  
- Push = Notification Engine (transversal)  
- Notice SSOT = `app_notices`; Campaign = send job  
- Settings push merge = **remove in Phase 2**  
- Inbox audience = **single member only**; segment = Notice/Marketing + Engine  
- Points Admin = Member | Store first, then ops verbs  
- Event participatory = not built until proven need  
- No code before Phase 0–1 complete  

### LOCK from Phase 0 evidence

- Action Queue / Monitoring card list (§2–3)  
- Phase 2 Notice work scope (§6)  
- notes = **Inquiry reuse candidate only**; Inbox physical **UNDECIDED**  
- admin-bell = Dashboard Action seed for charges (extend later for notes/campaigns)  
- Legacy L1–L10 remain NOT_PROVEN — Master PASS blocked  

### Explicitly NOT LOCKED

- `conversation_type` single-table merge  
- Migrating all notes rows to `inquiry`  
- Inbox new table vs notes extension  
- Live `app_notices` existence in production DB  
- Operator daily priority order (needs interview)  
- Notification taxonomy rename (Phase 6)  
- Point ledger-only / rate_version (Phase 4)  

---

## 10. Phase 0 Gate Summary

| Gate | Result |
|------|--------|
| Evidence matrix | Done (mixed verdicts) |
| Daily ops map | Code-backed PARTIAL; interview NOT_PROVEN |
| Dashboard mapping | Done |
| Legacy L1–L10 | All NOT_PROVEN |
| Inquiry/Inbox physical | Inquiry→notes candidate; Inbox UNDECIDED |
| Notice gap + Phase 2 scope | Done |
| Writer duplication map | Done |
| Point boundaries | Done |
| Phase 1 amendment | Done (§9) |

**Phase 0 PASS?** **NO — Phase 0 PARTIAL**

Blockers for Phase 0 PASS:

1. Legacy DEVICE NOT_PROVEN  
2. Operator interview NOT_PROVEN  
3. Inbox physical undecided (acceptable as explicit defer if Phase 1 allows)  
4. `app_notices` live DB NOT_PROVEN + migration FAIL  

Phase 1 Authority doc can still LOCK product/IA items that do not depend on legacy DEVICE, with Master Plan remaining PARTIAL.
