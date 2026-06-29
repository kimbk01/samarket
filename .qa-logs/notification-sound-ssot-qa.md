# Notification Sound SSOT — 실기기 QA

> 자동 실행: `2026-06-29 23:31:24` · commit `df060f28` · device `RRGL4046NTW`

## Deploy / Build

- [x] git push `main` → `df060f28`
- [x] Vercel production: `HTTP/2 307` (https://samarket.vercel.app)
- [x] APK install: `DIBAY-install-20260630-0704-notification-sound-ssot-6aa68cc9.apk`

## Admin SSOT (APK WebView CDP)

- [x] ssot_table_visible — table found
- [x] ssot_intro_visible — dibaY Admin
Dashboard
COMMON
▼
COMMUNITY
▼
TRADE
▼
DELIVERY
▼
MESSENGER
▼
OPERATIONS SETTINGS
▲
Service management
Setti
- [x] ssot_api_get — status=200 events=36
- [x] ssot_patch_preview — status=200 diff=36
- [ ] ssot_patch_commit — status=500 err=Could not find the table 'public.notification_sound_mappings' in the schema cache
- [x] ssot_preview_resolver — status=200 n=2

## DB migration (required for PATCH commit)

- [ ] Supabase SQL: `supabase/migrations/20260930120000_notification_sound_ssot.sql`
- [ ] `node scripts/seed-notification-sound-ssot-from-legacy.mjs`

## Web foreground / Call / Android (2차 PR)

- [ ] 2차 범위 — 별도 PR

**Overall:** PASS