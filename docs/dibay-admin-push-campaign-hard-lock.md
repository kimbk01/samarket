# DIBAY ADMIN PUSH CAMPAIGN HARD LOCK

**Declared:** 2026-08-12 (Phase D implementation — pending production device runtime for iOS NSE embed)

## Authority

| Concern | Owner |
|---|---|
| Campaign definition | `admin_notification_campaigns` |
| Execution (one logical send) | `admin_notification_campaign_occurrences` |
| Device/channel delivery | `notification_campaign_deliveries` |
| In-app / Bell | `notification_events` (unchanged SSOT) |
| Push transport | `dispatchPushForUser` / FCM / APNs |
| App Icon badge | Domain badge authority (unchanged) |

## Contracts

- **Campaign ≠ Occurrence ≠ Delivery** — never merge execution state into campaign row alone
- **Metrics** — push device metrics and in-app member metrics are separate (`push_sent` vs `in_app_sent`)
- **CREATE idempotency** — `create_request_id` UNIQUE; duplicate create returns same campaign
- **Occurrence idempotency** — `(campaign_id, idempotency_key)` and `(campaign_id, scheduled_for)` UNIQUE
- **CTA** — one primary destructive send CTA per review state (confirm modal only)
- **QA** — `is_qa=true`; production list default excludes (`audience=ops`)
- **Schedule cancel** — queued occurrence only → `cancelled`; cron never claims cancelled
- **Repeat** — recurring campaigns create new occurrence rows; no campaign overwrite
- **Bell/Badge** — campaign push does not directly mutate badge counters

## Image

- **Android:** `DibayFirebaseMessagingService` BigPictureStyle async upgrade (HTTPS, fallback BigText)
- **iOS:** APNs `mutable-content` + `DibayPushServiceExtension` (IMAGE ONLY)
- **In-app:** `in_app_image_url` → `createNotificationEvent` (unchanged)

## Gates

```bash
npm run typecheck:build
npx vitest run lib/admin/notification-campaigns/__tests__/
npm run verify:i18n-key-exposure  # before commit
```

## Migration

`supabase/migrations/20261029120000_admin_notification_campaign_occurrences.sql`

**Safety:** additive + backfill one occurrence per legacy campaign. Apply on staging before prod.

## NOT CLOSED until

- [ ] iOS NSE real device image push smoke (target embedded in `App.xcodeproj`; needs Apple Developer NSE capability + device build)
- [ ] Android Samsung/Xiaomi device smoke (BigPicture code landed; device not run in this session)
- [ ] Production/staging migration apply + cron occurrence dispatch smoke
- [ ] D9 dead-code cleanup (`segment`, legacy claim paths) with caller=0 proof
