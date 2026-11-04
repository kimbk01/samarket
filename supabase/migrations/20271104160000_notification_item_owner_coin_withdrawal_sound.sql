-- 재감사 E-1 (Owner 「3단계 진행」 2026-11-04) — Coin 출금 결과 알림(반려·지급 완료) 항목 소리 키 추가.
-- 이전: 알림 항목·소리 표에 없어 일반 공지 소리(admin_notice_received)로 울렸고 관리자 「알림 항목」 화면에서 바꿀 수 없었다.
-- 지금 나는 소리를 바꾸지 않는다 — 20271102030000 과 같은 방식:
--   채널 = 공지 채널(admin_notice_received 의 android_channel_id · 설치된 앱에 이미 있음),
--   음원·볼륨·반복·간격·진동 = admin_notice_received 운영 매핑을 그대로 복사.
-- 이미 있으면 건드리지 않는다(재실행 안전). 기존 키·매핑은 바꾸지 않는다.
-- TS 짝: lib/notifications/notification-item-sound-seeds.ts · notification-item-registry.ts (owner_coin_withdrawal)
-- 롤백: DELETE FROM public.notification_sound_mappings WHERE event_key = 'item_owner_coin_withdrawal';
--       DELETE FROM public.notification_sound_events WHERE event_key = 'item_owner_coin_withdrawal';

BEGIN;

WITH seeds(event_key, label_ko, label_en, domain, audience, channel_from, mapping_from) AS (
  VALUES
  ('item_owner_coin_withdrawal', 'Coin 출금 결과', 'Coin withdrawal', 'settlement', 'owner', 'admin_notice_received', 'admin_notice_received')
)
INSERT INTO public.notification_sound_events (
  event_key, label_ko, label_en, domain, audience, direction, default_asset_id, fallback_event_key,
  android_channel_id, ios_sound_name, vibration_enabled, priority, can_room_mute, enabled, legacy_source
)
SELECT
  s.event_key, s.label_ko, s.label_en, s.domain, s.audience, 'inbound', m.default_asset_id, s.mapping_from,
  c.android_channel_id, m.ios_sound_name, m.vibration_enabled, m.priority, m.can_room_mute, true, NULL
FROM seeds s
JOIN public.notification_sound_events c ON c.event_key = s.channel_from
JOIN public.notification_sound_events m ON m.event_key = s.mapping_from
WHERE NOT EXISTS (SELECT 1 FROM public.notification_sound_events e WHERE e.event_key = s.event_key);

WITH seeds(event_key, mapping_from) AS (
  VALUES
  ('item_owner_coin_withdrawal', 'admin_notice_received')
)
INSERT INTO public.notification_sound_mappings (
  event_key, asset_id, use_device_default, volume, repeat_count, cooldown_seconds, vibration_enabled, priority, enabled
)
SELECT s.event_key, src.asset_id, src.use_device_default, src.volume, src.repeat_count, src.cooldown_seconds,
  src.vibration_enabled, src.priority, src.enabled
FROM seeds s
JOIN public.notification_sound_mappings src ON src.event_key = s.mapping_from
WHERE NOT EXISTS (SELECT 1 FROM public.notification_sound_mappings x WHERE x.event_key = s.event_key);

COMMIT;
