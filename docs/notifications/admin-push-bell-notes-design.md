# Admin Push → Bell → Detail · Notices SSOT · Member Admin Notes

**Status:** Implemented Phase 1–3 (2026-08-04)  
**Scope:** notice / system / marketing campaign path + member↔admin 쪽지

## Product contract

| Axis | Rule |
|------|------|
| Bell | notice + system (`admin_notice` events) **included**; marketing **excluded** |
| Bottom / chat | unchanged (not this track) |
| Marketing | FCM + 혜택 tab display only — never Bell digit |
| Tap | notice/system → detail or note thread; marketing → deeplink / 혜택 |

## Phase 1 — wiring

- Campaign `push_kind` / `eventClass`: `notice` · `system` · `marketing` distinct
- Inbox DTO: `campaign_type`, `event_type`, `push_kind`, `bell_presentation_type` (`admin_notice` / `admin_system`)
- Open detail: `isAdminNoticeOrSystemInboxItem` (not collapsed `notification_type=system` alone)
- `?notificationId=` consumed → opens detail when row loaded
- Marketing list filter accepts `push_kind=marketing` / campaign hints

Key files:

- `lib/notifications/admin-campaign-inbox.ts`
- `lib/admin/notification-campaigns/campaign-notification-presentation.ts`
- `lib/notifications/inbox-events-merge.ts`
- `components/my/MyNotificationsView.tsx`

## Phase 2 — notices SSOT

- `GET /api/me/settings/notices` merges `app_notices` (board) + member `admin_notice` events (push)
- Push rows link to `/notifications/[id]`
- Board rows remain CMS list items

## Phase 3 — member admin notes

- Tables: `member_admin_note_threads` / `member_admin_note_messages`  
  Migration: `supabase/migrations/20261017120000_member_admin_note_threads.sql`
- Member: `/notifications/notes`, `/notifications/notes/[threadId]`, `/api/me/admin-notes*`
- Admin: `/admin/member-notes`, `/api/admin/member-notes*`
- Admin reply → `notification_events` (`admin_notice` + `campaignType: system`) + FCM best-effort → Bell + system tab

**DO NOT** merge with store `platform_admin_inquiries`.

## Deploy note

Apply migration `20261017120000_member_admin_note_threads.sql` before relying on 쪽지 APIs in production.
