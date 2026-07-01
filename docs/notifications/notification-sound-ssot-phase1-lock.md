# DIBAY Notification Sound SSOT — Phase 1 LOCK

**Status:** LOCK (2026-06-30)  
**QA:** `.qa-logs/notification-sound-ssot-qa.md` — 실기기 Admin GET · preview · **commit** · resolver preview **PASS**  
**Commits:** `6aa68cc9` (Phase 1) · `df060f28` (DB fallback) · `bd231dce` (QA)

## Fixed goal (Phase 1 — do not regress)

1. **Legacy 보존:** `admin_notification_settings`, `admin_messenger_call_sound_settings`, `admin_settings` KV — 삭제·DROP 금지. URL/path는 `legacy_source`로 추적.
2. **번호 SSOT:** `DIBAY-SND-###` (000=무음, 001=앱 기본, 900/901=OS marker).
3. **단일 Admin write:** `/admin/settings/notifications` → **`/api/admin/notification-sound-ssot` only**. 저장 시 legacy mirror 동기.
4. **Resolver 우선순위:** `room_mute` → user pref → admin mapping → event default → fallback → `dibay_default` → `device_default`.
5. **Native Call LOCK diff 0:** `scripts/notification-sound-ssot-lock-manifest.json` `forbiddenModifyPaths` — RingOwner·ForegroundRingtone·Incoming builder 등 **수정 금지** (adapter/stub만).

## Phase 1 delivered (LOCK baseline)

| Layer | Paths |
|-------|--------|
| DB | `supabase/migrations/20260930120000_notification_sound_ssot.sql` |
| Registry / types | `lib/notifications/notification-sound-{types,registry,event-map,resolver,legacy-mirror}.ts` |
| Admin API | `app/api/admin/notification-sound-ssot/**` |
| App resolve | `app/api/app/notification-sound-resolve/route.ts` |
| Admin UI | `components/admin/settings/AdminNotificationSoundSsotTable.tsx` |
| Adapters | `notification-sound-engine`, `notify-push-dispatcher`, `notification-sound-profiles`, call config read-through, store/order-match |
| Native stub | `lib/push/native/notification-sound-native-bridge.ts`, `ensure-notification-channel.ts` |
| Verify | `npm run verify:notification-sound-ssot-contract` |
| Seed | `scripts/seed-notification-sound-ssot-from-legacy.mjs` |

## DO NOT (without explicit user approval)

1. Drop/rename legacy notification sound tables or admin APIs (deprecate 표시만 유지).
2. Add a second Admin write path to `notification_sound_mappings` / assets.
3. Modify Native Call LOCK Java files (manifest list).
4. Revert Admin PATCH to in-memory confirm_token two-step preview/commit (current contract: single-request commit + legacy mirror).
5. Change resolver priority chain or delete `eventKey` from registry without migration + verify.
6. Phase 2 scope를 Phase 1 PR에 끼워 넣기 (아래 백로그).

## Phase 2 backlog (separate PR — NOT Phase 1)

- Android 실제 커스텀 URI 재생 (`NotificationSoundBridgePlugin` 완성)
- FCM Java `android_channel_id` ensure 실연결
- Room custom sound upload / per-room asset
- 사용자 per-event sound picker

## Changelog (append-only)

- **2026-07-01:** Admin PATCH → single-request commit (removed in-memory confirm_token Map); GET returns registry-merged mappings; repeat policy + legacy length validation in admin layer only.

## After any Phase 1 touch (regression gate)

```bash
npm run verify:notification-sound-ssot-contract
npm run verify:call-v4-incoming-fsi-fallback-boundary
vitest run lib/notifications/__tests__/notification-sound-*.test.ts
node .qa-logs/notification-sound-ssot-qa.mjs   # optional device
```

## DB ops (post-LOCK maintenance)

```bash
node scripts/apply-notification-sound-ssot-migration.mjs   # once per env
node scripts/seed-notification-sound-ssot-from-legacy.mjs   # legacy URL backfill
```
