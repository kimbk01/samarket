# Phase 1.5 — Cleanup Contract (RESERVATION ONLY)

**Status:** COMPLETE (tagging done)  
**Date:** 2026-08-05  
**Mode:** NO deletion · NO migration · NO refactor · tags only  
**Master Plan:** PARTIAL  

Reserve paths for Phase **7**. Phase **7.5** audits duplicates. Phase **2** may apply authority merge-remove marked below.

## Tags

| Tag | Meaning |
|-----|---------|
| **KEEP** | Final SSOT |
| **DELETE예정** | Remove in Phase 7 |
| **REMOVE예정** | Dead path; Phase 7 |
| **REPLACE예정** | Successor then Phase 7 remove old |
| **MERGE예정** | Absorb into SSOT; Phase 7 drop duplicate |

---

## Inventory (LOCKED tags)

### A. Notice / Settings dual-read

| Asset | Path | Tag | When |
|-------|------|-----|------|
| Merge helper | `lib/notifications/member-notices-ssot.ts` | REPLACE예정 | Phase 2 board-only; Phase 7 drop if unused |
| Settings notices push half | `app/api/me/settings/notices/route.ts` | REPLACE예정 | **Phase 2 authority** |
| NoticesContent push UX | `components/my/settings/NoticesContent.tsx` | REPLACE예정 | **Phase 2** |
| member-notices-ssot tests | `lib/notifications/__tests__/member-notices-ssot.test.ts` | REPLACE예정 | Align Phase 2 |
| Broken Admin create/edit hrefs | `AdminAppNoticesPage` links | REPLACE예정 | Phase 2 CRUD |
| Admin notices shell | `app/admin/app/notices/*`, `AdminAppNoticesPage` | KEEP | Extend Phase 2 |
| Campaign Engine | `lib/admin/notification-campaigns/*`, `/admin/notifications` | KEEP | |
| Campaign APIs | `app/api/admin/notification-campaigns/*` | KEEP | |
| `AppNoticeRow` | `lib/types/settings-db.ts` | KEEP | Extend as needed |
| Design doc dual-read as SSOT | `docs/notifications/admin-push-bell-notes-design.md` Phase 2 section | REPLACE예정 | Point to board-only (Phase 7 doc cleanup) |

### B. Notes / Inquiry / Inbox

| Asset | Path | Tag | Note |
|-------|------|-----|------|
| `member_admin_note_*` | migration + `member-admin-notes-service.ts` | KEEP | Inquiry candidate |
| me/admin-notes APIs | `app/api/me/admin-notes*` | KEEP | Relocate UX later |
| admin/member-notes APIs | `app/api/admin/member-notes*` | KEEP | |
| App `/notifications/notes*` | `app/(main)/notifications/notes/**` | REPLACE예정 | CS routes Phase 3 |
| Bell notes entry | `MyNotificationsView` notes link | REPLACE예정 | Phase 3 deep link |
| Admin `/admin/member-notes` | page + component | KEEP + MERGE예정 menu | Support under CP |

### C. Notification writers

| Asset | Tag | Note |
|-------|-----|------|
| notes → type `admin_notice` | REPLACE진행 | Phase 5 Slice 1 — writer → `inquiry_answered` / `inbox_message_received`; legacy dual-read; delete = Phase 7 |
| Campaign notice/system → type `admin_notice` | REPLACE진행 | Phase 5 Slice 2 — writer → `notice_published`; marketing `admin_marketing_banner`; legacy dual-read |
| Campaign createNotificationEvent + push | KEEP | Engine |
| `createAndDispatchNotificationEvent` | KEEP | |
| `notify-push-dispatcher` | KEEP | |
| Call push helpers | KEEP | Outside CP |
| `app/api/admin/push/test` | KEEP | Ops |

### D. Points

| Asset | Tag | Note |
|-------|-----|------|
| Member point Admin/APIs | KEEP | |
| Store point Admin/APIs | KEEP | |
| Dual-write `profiles.points` UPDATE paths | REPLACE완료 | Phase 4 Slice 1–2 — ledger-only + project cache |
| `STORE_POINT_CHARGE_PAYMENT_RATIO` | REPLACE완료 | Phase 4 Slice 4 — local Store charge SSOT (const=1); not Member `point_plans` |
| `point_plans` | KEEP | Phase 4 Slice 3 Member Rates SSOT |

### E. Admin menu (`admin-menu.ts`)

| Asset | Tag | Note |
|-------|-----|------|
| `community-notices` → `/admin/app/notices` | MERGE예정 | CP Content |
| `dibay-notification-campaigns` | MERGE예정 | Notification Engine |
| `points-*` under common | MERGE예정 | Points > Member |
| `store-point-*` under delivery | MERGE예정 | Points > Store |
| `member-notes-admin` under delivery | MERGE예정 | Support |
| `admin-bell` API | KEEP | Dashboard Action seed |

### F. Event / FAQ stubs

| Asset | Tag | Note |
|-------|-----|------|
| Settings `events` → benefits stub | REMOVE완료 | Phase 7 — menu/nav stub removed; deep-link → `/mypage/benefits` |
| FAQ product | ABSENT → KEEP when built | Phase 2 create |

### G. Docs / tests (cleanup)

| Asset | Tag | Note |
|-------|-----|------|
| CP governance pack (`phase-roadmap`, gates, RRR, 7.8, …) | KEEP | |
| Obsolete “merge is member notices SSOT” claims | REPLACE예정 | Phase 7 docs |
| Tests asserting Settings↔push merge as required product | REPLACE예정 | Phase 2 |

---

## Phase 1.5 Exit Gates

```
Phase: 1.5
Date: 2026-08-05
Product Gate: PASS — tags align with Phase 1 LOCK
Authority Gate: PASS — no schema/code change; dual notice tagged Phase 2
Runtime Gate: N/A — tagging only
Admin Gate: PASS — menu MERGE예정 only; live menu unchanged
Regression Gate: N/A — no code change
Cleanup Tag Gate: PASS — inventory complete above
Next Phase allowed: YES → Phase 2
```

---

## Phase 7 / 7.5 / 7.8

See prior sections in git history of this file / `phase-roadmap.md`. Do **not** execute deletes until Phase 7.

## Amendment log

| Date | Change |
|------|--------|
| 2026-08-05 | Initial provisional tags |
| 2026-08-05 | Phase 7 verify + 7.5 + 7.8 refs |
| 2026-08-05 | **COMPLETE** after Phase 1 APPROVED — tags locked for execution |
| 2026-08-05 | Phase 4 Slice 4 — Store ratio + Member dual-write tags → REPLACE완료 |
| 2026-08-05 | Phase 5 Slice 1 — notes→admin_notice → REPLACE진행 (typed Inquiry/Inbox writer; dual-read) |
| 2026-08-06 | Phase 5 Slice 2 — Campaign notice/system→admin_notice → REPLACE진행 (`notice_published`) |
| 2026-08-06 | Phase 7 — Settings events stub → REMOVE완료 (user lock: REMOVE/DELETE only) |
