-- DIBAY Notification Sound SSOT — assets, events, mappings, room overrides
-- Legacy tables preserved; seed via scripts/seed-notification-sound-ssot-from-legacy.mjs

CREATE TABLE IF NOT EXISTS public.notification_sound_assets (
  id text PRIMARY KEY,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('silent', 'dibay_default', 'dibay_custom', 'device_default')),
  domain text CHECK (
    domain IS NULL
    OR domain IN (
      'system',
      'messenger_direct',
      'messenger_group',
      'trade',
      'delivery_user',
      'delivery_owner',
      'call_voice',
      'call_video',
      'admin',
      'settlement',
      'community'
    )
  ),
  file_path text,
  file_url text,
  ios_sound_name text,
  android_channel_base text,
  legacy_source jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_sound_events (
  event_key text PRIMARY KEY,
  label_ko text NOT NULL,
  label_en text NOT NULL,
  domain text NOT NULL CHECK (
    domain IN (
      'system',
      'messenger_direct',
      'messenger_group',
      'trade',
      'delivery_user',
      'delivery_owner',
      'call_voice',
      'call_video',
      'admin',
      'settlement',
      'community'
    )
  ),
  audience text NOT NULL CHECK (audience IN ('user', 'owner', 'admin', 'sender', 'receiver')),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  default_asset_id text NOT NULL REFERENCES public.notification_sound_assets (id),
  fallback_event_key text REFERENCES public.notification_sound_events (event_key),
  android_channel_id text NOT NULL,
  ios_sound_name text,
  vibration_enabled boolean NOT NULL DEFAULT true,
  priority text NOT NULL DEFAULT 'default',
  can_room_mute boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  legacy_source jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_sound_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE REFERENCES public.notification_sound_events (event_key),
  asset_id text NOT NULL REFERENCES public.notification_sound_assets (id),
  use_device_default boolean NOT NULL DEFAULT false,
  volume numeric NOT NULL DEFAULT 0.7 CHECK (volume >= 0 AND volume <= 1),
  repeat_count int NOT NULL DEFAULT 1 CHECK (repeat_count >= 1 AND repeat_count <= 5),
  cooldown_seconds int NOT NULL DEFAULT 0 CHECK (cooldown_seconds >= 0 AND cooldown_seconds <= 600),
  vibration_enabled boolean,
  priority text,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_room_overrides (
  room_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_key text,
  muted boolean NOT NULL DEFAULT false,
  sound_asset_id text REFERENCES public.notification_sound_assets (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS notification_sound_events_domain_idx
  ON public.notification_sound_events (domain);

CREATE INDEX IF NOT EXISTS notification_room_overrides_user_idx
  ON public.notification_room_overrides (user_id, room_id);

COMMENT ON TABLE public.notification_sound_assets IS 'DIBAY-SND-### 알림음 자산 SSOT';
COMMENT ON TABLE public.notification_sound_events IS 'eventKey 카탈로그 SSOT';
COMMENT ON TABLE public.notification_sound_mappings IS 'Admin event→asset override (단일 행/event)';
COMMENT ON TABLE public.notification_room_overrides IS '방별 mute/custom (1차 mute)';

-- Static seed: assets
INSERT INTO public.notification_sound_assets (id, label, kind, domain, file_path, legacy_source)
VALUES
  ('DIBAY-SND-000', '무음', 'silent', 'system', NULL, NULL),
  ('DIBAY-SND-001', '기본 일반 알림', 'dibay_default', 'system', '/sounds/notification.wav', '{"table":"static","key":"notification.wav"}'::jsonb),
  ('DIBAY-SND-010', '기본 메시지 수신', 'dibay_default', 'messenger_direct', '/sounds/notification.wav', NULL),
  ('DIBAY-SND-011', '1:1 메시지 (legacy direct)', 'dibay_custom', 'messenger_direct', NULL, '{"table":"admin_notification_settings","key":"community_direct_chat","column":"sound_url"}'::jsonb),
  ('DIBAY-SND-012', '그룹 메시지 (legacy group)', 'dibay_custom', 'messenger_group', NULL, '{"table":"admin_notification_settings","key":"community_group_chat","column":"sound_url"}'::jsonb),
  ('DIBAY-SND-013', '거래 채팅 (legacy trade)', 'dibay_custom', 'trade', NULL, '{"table":"admin_notification_settings","key":"trade_chat","column":"sound_url"}'::jsonb),
  ('DIBAY-SND-020', '주문 알림 (legacy order)', 'dibay_custom', 'delivery_user', NULL, '{"table":"admin_notification_settings","key":"order","column":"sound_url"}'::jsonb),
  ('DIBAY-SND-021', '매장/스토어 (legacy store)', 'dibay_custom', 'delivery_owner', NULL, '{"table":"admin_notification_settings","key":"store","column":"sound_url"}'::jsonb),
  ('DIBAY-SND-030', '오너 긴급 주문', 'dibay_custom', 'delivery_owner', NULL, '{"table":"admin_settings","key":"store_delivery_alert_sound","column":"value_json.url"}'::jsonb),
  ('DIBAY-SND-031', '주문 매칭 채팅', 'dibay_custom', 'delivery_user', NULL, '{"table":"admin_settings","key":"order_match_chat_alert_sound","column":"value_json"}'::jsonb),
  ('DIBAY-SND-040', '음성 수신 벨', 'dibay_custom', 'call_voice', NULL, '{"table":"admin_messenger_call_sound_settings","key":"default","column":"voice_incoming_sound_url"}'::jsonb),
  ('DIBAY-SND-041', '영상 수신 벨', 'dibay_custom', 'call_video', NULL, '{"table":"admin_messenger_call_sound_settings","key":"default","column":"video_incoming_sound_url"}'::jsonb),
  ('DIBAY-SND-042', '음성 발신 연결음', 'dibay_custom', 'call_voice', NULL, '{"table":"admin_messenger_call_sound_settings","key":"default","column":"voice_outgoing_ringback_url"}'::jsonb),
  ('DIBAY-SND-043', '영상 발신 연결음', 'dibay_custom', 'call_video', NULL, '{"table":"admin_messenger_call_sound_settings","key":"default","column":"video_outgoing_ringback_url"}'::jsonb),
  ('DIBAY-SND-044', '부재중 통화', 'dibay_custom', 'call_voice', NULL, '{"table":"admin_messenger_call_sound_settings","key":"default","column":"missed_notification_sound_url"}'::jsonb),
  ('DIBAY-SND-045', '통화 종료음', 'dibay_custom', 'call_voice', NULL, '{"table":"admin_messenger_call_sound_settings","key":"default","column":"call_end_sound_url"}'::jsonb),
  ('DIBAY-SND-046', '통화 fallback', 'dibay_custom', 'call_voice', NULL, '{"table":"admin_messenger_call_sound_settings","key":"default","column":"default_fallback_sound_url"}'::jsonb),
  ('DIBAY-SND-050', '관리자 긴급', 'dibay_default', 'admin', '/sounds/notification.wav', NULL),
  ('DIBAY-SND-900', 'OS 기본 알림음', 'device_default', 'system', NULL, NULL),
  ('DIBAY-SND-901', 'OS 기본 벨소리', 'device_default', 'call_voice', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Events (system_default first for FK)
INSERT INTO public.notification_sound_events (
  event_key, label_ko, label_en, domain, audience, direction,
  default_asset_id, fallback_event_key, android_channel_id, can_room_mute
)
VALUES
  ('system_default', '시스템 기본', 'System default', 'system', 'user', 'system', 'DIBAY-SND-001', NULL, 'dibay_chat_messages_v1', false)
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.notification_sound_events (
  event_key, label_ko, label_en, domain, audience, direction,
  default_asset_id, fallback_event_key, android_channel_id
)
VALUES
  ('messenger_message_sent', '메시지 발신', 'Message sent', 'messenger_direct', 'sender', 'outbound', 'DIBAY-SND-010', 'system_default', 'dibay_chat_messages_v1'),
  ('messenger_direct_message_received', '1:1 메시지 수신', 'Direct message received', 'messenger_direct', 'receiver', 'inbound', 'DIBAY-SND-011', 'system_default', 'dibay_chat_messages_v1'),
  ('messenger_group_message_received', '그룹 메시지 수신', 'Group message received', 'messenger_group', 'receiver', 'inbound', 'DIBAY-SND-012', 'system_default', 'dibay_chat_messages_v1'),
  ('friend_request_received', '친구 요청 수신', 'Friend request received', 'messenger_direct', 'receiver', 'inbound', 'DIBAY-SND-011', 'system_default', 'dibay_chat_messages_v1'),
  ('friend_request_accepted', '친구 요청 승인', 'Friend request accepted', 'messenger_direct', 'receiver', 'inbound', 'DIBAY-SND-011', 'system_default', 'dibay_chat_messages_v1'),
  ('trade_chat_message_received', '거래 채팅 수신', 'Trade chat message', 'trade', 'receiver', 'inbound', 'DIBAY-SND-013', 'system_default', 'dibay_trade_v1'),
  ('trade_offer_received', '가격 제안', 'Price offer', 'trade', 'receiver', 'inbound', 'DIBAY-SND-013', 'system_default', 'dibay_trade_v1'),
  ('trade_reserved', '거래 예약', 'Trade reserved', 'trade', 'user', 'inbound', 'DIBAY-SND-013', 'system_default', 'dibay_trade_v1'),
  ('trade_completed', '거래 완료', 'Trade completed', 'trade', 'user', 'inbound', 'DIBAY-SND-013', 'system_default', 'dibay_trade_v1'),
  ('delivery_order_status_changed_user', '주문 상태 변경', 'Order status changed', 'delivery_user', 'user', 'inbound', 'DIBAY-SND-020', 'system_default', 'dibay_orders_v1'),
  ('delivery_chat_message_received_user', '주문 채팅 수신 (구매자)', 'Order chat (buyer)', 'delivery_user', 'receiver', 'inbound', 'DIBAY-SND-021', 'system_default', 'dibay_delivery_v1'),
  ('delivery_order_created_owner', '오너 신규 주문', 'Owner new order', 'delivery_owner', 'owner', 'inbound', 'DIBAY-SND-030', 'system_default', 'dibay_delivery_v1'),
  ('delivery_chat_message_received_owner', '오너 주문 채팅', 'Owner order chat', 'delivery_owner', 'owner', 'inbound', 'DIBAY-SND-021', 'system_default', 'dibay_delivery_v1'),
  ('delivery_order_cancelled_owner', '오너 주문 취소', 'Owner order cancelled', 'delivery_owner', 'owner', 'inbound', 'DIBAY-SND-030', 'system_default', 'dibay_delivery_v1'),
  ('delivery_order_delayed_owner', '오너 주문 지연', 'Owner order delayed', 'delivery_owner', 'owner', 'inbound', 'DIBAY-SND-030', 'system_default', 'dibay_delivery_v1'),
  ('delivery_order_sold_out_owner', '오너 품절', 'Owner sold out', 'delivery_owner', 'owner', 'inbound', 'DIBAY-SND-030', 'system_default', 'dibay_delivery_v1'),
  ('delivery_review_received_owner', '리뷰 알림', 'Review notification', 'delivery_owner', 'owner', 'inbound', 'DIBAY-SND-021', 'system_default', 'dibay_delivery_v1'),
  ('delivery_inquiry_received_owner', '문의 알림', 'Inquiry notification', 'delivery_owner', 'owner', 'inbound', 'DIBAY-SND-021', 'system_default', 'dibay_delivery_v1'),
  ('delivery_order_match_chat', '주문 매칭 채팅', 'Order match chat', 'delivery_user', 'user', 'inbound', 'DIBAY-SND-031', 'system_default', 'dibay_orders_v1'),
  ('call_incoming_voice', '음성 통화 수신', 'Voice call incoming', 'call_voice', 'receiver', 'inbound', 'DIBAY-SND-040', 'system_default', 'dibay_calls_incoming_v7'),
  ('call_incoming_video', '영상 통화 수신', 'Video call incoming', 'call_video', 'receiver', 'inbound', 'DIBAY-SND-041', 'system_default', 'dibay_calls_incoming_v7'),
  ('call_outgoing_voice', '음성 발신 연결', 'Voice outgoing ringback', 'call_voice', 'sender', 'outbound', 'DIBAY-SND-042', 'system_default', 'dibay_calls_incoming_v7'),
  ('call_outgoing_video', '영상 발신 연결', 'Video outgoing ringback', 'call_video', 'sender', 'outbound', 'DIBAY-SND-043', 'system_default', 'dibay_calls_incoming_v7'),
  ('call_missed', '부재중 통화', 'Missed call', 'call_voice', 'receiver', 'inbound', 'DIBAY-SND-044', 'system_default', 'dibay_calls_missed_v1'),
  ('call_ended', '통화 종료', 'Call ended', 'call_voice', 'user', 'system', 'DIBAY-SND-045', 'system_default', 'dibay_calls_incoming_v7'),
  ('call_rejected', '통화 거절', 'Call rejected', 'call_voice', 'receiver', 'system', 'DIBAY-SND-045', 'system_default', 'dibay_calls_incoming_v7'),
  ('admin_report_received', '관리자 신고', 'Admin report', 'admin', 'admin', 'inbound', 'DIBAY-SND-050', 'system_default', 'dibay_admin_notice_v1'),
  ('admin_notice_received', '관리자 공지', 'Admin notice', 'admin', 'user', 'inbound', 'DIBAY-SND-001', 'system_default', 'dibay_admin_notice_v1'),
  ('settlement_balance_low', '잔액 부족', 'Low balance', 'settlement', 'owner', 'inbound', 'DIBAY-SND-021', 'system_default', 'dibay_delivery_v1'),
  ('settlement_charge_approved', '충전 승인', 'Charge approved', 'settlement', 'owner', 'inbound', 'DIBAY-SND-021', 'system_default', 'dibay_delivery_v1'),
  ('settlement_charge_rejected', '충전 반려', 'Charge rejected', 'settlement', 'owner', 'inbound', 'DIBAY-SND-021', 'system_default', 'dibay_delivery_v1'),
  ('settlement_charge_requested', '충전 요청 (관리자)', 'Charge request (admin)', 'settlement', 'admin', 'inbound', 'DIBAY-SND-050', 'system_default', 'dibay_admin_notice_v1'),
  ('community_comment_received', '댓글', 'Comment', 'community', 'receiver', 'inbound', 'DIBAY-SND-010', 'system_default', 'dibay_community_v1'),
  ('community_mention_received', '멘션', 'Mention', 'community', 'receiver', 'inbound', 'DIBAY-SND-010', 'system_default', 'dibay_community_v1'),
  ('community_like_received', '좋아요', 'Like', 'community', 'receiver', 'inbound', 'DIBAY-SND-010', 'system_default', 'dibay_community_v1')
ON CONFLICT (event_key) DO NOTHING;

-- Default mappings mirror event defaults
INSERT INTO public.notification_sound_mappings (event_key, asset_id)
SELECT event_key, default_asset_id
FROM public.notification_sound_events
ON CONFLICT (event_key) DO NOTHING;

ALTER TABLE public.notification_sound_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_sound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_sound_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_room_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_sound_assets_select_authenticated" ON public.notification_sound_assets;
CREATE POLICY "notification_sound_assets_select_authenticated"
  ON public.notification_sound_assets FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "notification_sound_assets_write_admin" ON public.notification_sound_assets;
CREATE POLICY "notification_sound_assets_write_admin"
  ON public.notification_sound_assets FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "notification_sound_events_select_authenticated" ON public.notification_sound_events;
CREATE POLICY "notification_sound_events_select_authenticated"
  ON public.notification_sound_events FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "notification_sound_events_write_admin" ON public.notification_sound_events;
CREATE POLICY "notification_sound_events_write_admin"
  ON public.notification_sound_events FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "notification_sound_mappings_select_authenticated" ON public.notification_sound_mappings;
CREATE POLICY "notification_sound_mappings_select_authenticated"
  ON public.notification_sound_mappings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "notification_sound_mappings_write_admin" ON public.notification_sound_mappings;
CREATE POLICY "notification_sound_mappings_write_admin"
  ON public.notification_sound_mappings FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "notification_room_overrides_select_own" ON public.notification_room_overrides;
CREATE POLICY "notification_room_overrides_select_own"
  ON public.notification_room_overrides FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_room_overrides_write_own" ON public.notification_room_overrides;
CREATE POLICY "notification_room_overrides_write_own"
  ON public.notification_room_overrides FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
