# Notification Sound SSOT — 실기기 QA

> 자동 실행: `2026-06-29 23:45:45` · commit `bd231dce` · device `RRGL4046NTW` · post-migration

## Deploy / Build

- [x] git push `main` → `bd231dce`
- [x] Vercel production: `HTTP/2 307` (https://samarket.vercel.app)
- [x] APK install: `DIBAY-install-20260630-0704-notification-sound-ssot-6aa68cc9.apk`

## DB migration + seed

- [x] `supabase/migrations/20260930120000_notification_sound_ssot.sql`
- [x] `node scripts/seed-notification-sound-ssot-from-legacy.mjs` (재실행 2026-06-30)
- assets 20 · events 36 · mappings 36 · room_overrides 0

## Admin SSOT (APK WebView CDP — aaaa admin)

- [x] ssot_table_visible — table found
- [x] ssot_api_get — status=200 events=36
- [x] ssot_patch_preview — status=200 diff=1
- [x] ssot_patch_commit — status=200 (DB upsert + legacy mirror)
- [x] ssot_preview_resolver — status=200 n=2
  - `messenger_direct_message_received` → legacy mp3 URL (SND-011)
  - `delivery_order_created_owner` → fallback wav (SND-030, legacy null)

## Web foreground / Call / Android (2차 PR)

- [ ] 2차 범위 — 별도 PR

**Overall:** PASS (1차 SSOT 완료)
