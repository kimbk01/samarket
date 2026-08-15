# DIBAY Customer Communication SSOT

**Status:** HARD LOCKED (Production runtime proven 2026-08-15 on `ecee72f0e`).

**Authority helper:** `lib/admin/notification-campaigns/campaign-source-authority.ts`

## 1. Authority Map

```text
ORIGINAL AUTHORITY          DELIVERY AUTHORITY           EVENT
app_notices (notice|system|marketing)
member_admin_note_* (inquiry|inbox)
runtime transactional events
        ↓
admin_notification_campaigns (official boards only)
notifyMemberOfAdminNote (inquiry/message)
direct event writers (transactional)
        ↓
notification_events
        ↓
Push / Bell / In-App /notifications
        ↓
ORIGINAL DESTINATION
```

## 2. Notice

- Original: `app_notices` where `content_type = notice`
- Authoring: `/admin/app/notices`
- Delivery: `/admin/notifications` with **`app_notice_id` REQUIRED**
- Event: `notice_published` + `campaignType=notice`
- Member destination: `/mypage/customer-center/notice/{contentId}`
- **NEW title/body-only notice campaign: FORBIDDEN**

## 3. System Bulletin

- Original: `app_notices` where `content_type = system`
- Delivery: campaign `type=system` with **`app_notice_id` REQUIRED**
- Event: `notice_published` + `campaignType=system` (enum unchanged; no migration)
- Member destination: `/mypage/customer-center/system/{contentId}`
- **NEW unbound system bulletin: FORBIDDEN**

## 4. Transactional System

- No `app_notices` board required
- Examples: `missed_call`, account/runtime status events
- Destination: domain route **or** `/notifications/{eventId}`
- `/notifications/{id}` exists primarily for this class

## 5. Marketing

- **M1** Content: `app_notices` `content_type=marketing` → CC marketing detail
- **M2** Approved internal landing (safe route, not bare `/notifications`)
- Event: `admin_marketing_banner`
- **NEW marketing without content AND without landing: FORBIDDEN**

## 6. Inquiry

- Tables: `member_admin_note_threads` / `member_admin_note_messages` (`started_by=member`)
- Event: `inquiry_answered`
- Destination: `/mypage/inquiries/{threadId}`
- **Not a Campaign.** Never `campaignType=system`.
- Tab: included in **전체** only (no dedicated filter tab)

## 7. Direct Message (쪽지)

- Same tables (`started_by=admin`)
- Event: `inbox_message_received`
- Destination: `/mypage/inbox/{threadId}`
- **Not a Campaign.**

## 8. Campaign contract

`admin_notification_campaigns` = **DELIVERY AUTHORITY only**.

Owns: audience, channel, schedule, presentation snapshot (`title`/`body` as delivery copy), `target_payload` content bind, status, results.

Does **not** own official board originals.

Validation SSOT: `validateOfficialCampaignSource`.

## 9. Notification detail allowed / forbidden

| Allowed | Forbidden (new writes) |
|---------|------------------------|
| Transactional system events | Official notice campaign |
| Legacy unbound read-compat | System bulletin campaign |
| | Content marketing without landing |
| | Inquiry reply as detail original |
| | Direct message as detail original |

## 10. Legacy compatibility

```text
OLD UNBOUND = READ COMPATIBLE (/notifications/{eventId})
NEW UNBOUND = WRITE FORBIDDEN (create + send + test-send)
```

No forced backfill in this cutover.

## 11. Writer validation

- `POST /api/admin/notification-campaigns` — source authority gate
- `POST .../send` and `.../test-send` — reject unbound official rows
- Admin create UI — requires link (or marketing landing); Pure transport removed

## 12. Destination matrix

| Kind | Destination |
|------|-------------|
| Notice bound | `/mypage/customer-center/notice/{id}` |
| System bulletin bound | `/mypage/customer-center/system/{id}` |
| Marketing bound | `/mypage/customer-center/marketing/{id}` |
| Marketing landing | approved internal route |
| Inquiry | `/mypage/inquiries/{threadId}` |
| Message | `/mypage/inbox/{threadId}` |
| Transactional | domain or `/notifications/{eventId}` |
| Legacy unbound | `/notifications/{eventId}` |

## 13. Runtime proof

Proven on Production with **NEW** campaigns/events (not legacy rows):

| Proof | Result |
|-------|--------|
| Unbound notice/system/marketing create | `400` `*_content_required` / `marketing_source_required` |
| Bound notice send | event `69ba8bba-…` → `/mypage/customer-center/notice/a8c5996e-…` |
| Bound system send | event `c4e7e616-…` → `/mypage/customer-center/system/9f1ca605-…` |
| Bound marketing send | event `e0b4e6e1-…` → `/mypage/customer-center/marketing/aba6335a-…` |
| Marketing landing create | campaign `14da9157-…` allowed |
| Inquiry reply | event `2e4b2bca-…` → `/mypage/inquiries/f4811816-…`, no `campaignType` |
| Direct message | event `16bbfee9-…` → `/mypage/inbox/cf60e8be-…`, no `campaignType` |
| Transactional sample | `order_status` / `trade_message` / `community_activity` → domain routes |

Bell / Full Inbox `link_url` and event `display_payload.routeUrl` / `canonical_route` match the same Customer Center (or thread) original.

## 14. Regression prohibitions

- Do not restore Pure transport official send
- Do not stamp inquiry/message `campaignType: "system"`
- Do not merge notice and system bulletin domains
- Do not add CS/inquiry/message as 7th filter tab
- No schema migration without evidence + approval
