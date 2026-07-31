# Admin Notification Campaigns — Phase B

**Status:** CONNECTED (2026-07-31)

예약(`scheduled`) 캠페인은 Vercel Cron이 기존 batch SSOT로 발송한다.

## Worker

```text
GET|POST /api/cron/notification-campaigns-dispatch-scheduled
→ CRON_SECRET
→ claim_due_admin_notification_campaign (atomic SKIP LOCKED)
→ drainNotificationCampaignSendBatches → runNotificationCampaignSendBatch
```

- Schedule: `*/5 * * * *` (`vercel.json`)
- Max 3 campaigns / tick; bounded batches per campaign
- `target_type=segment` → fail (no all fallback)
- Reuses Phase A `sendCampaignToUser` / `dispatchPushForUser` — no new FCM path

## Claim / idempotency columns

Migration: `20261013120000_admin_notification_campaign_claim.sql`

- `send_claimed_at`, `send_claim_token`, `last_error`
- `send_idempotency_key`, `test_send_idempotency_key`
- RPC: `claim_due_admin_notification_campaign`, `claim_admin_notification_campaign_send`

## Phase C (후속)

- iOS NSE + APNs rich push 이미지
- Android BigPictureStyle native consume
- Realtime in-app banner
- **Segment query builder** (UI/API currently reject `segment`)
