-- 단일 행: 메신저 통화 벨·링백·공통 사운드 (관리자 설정)

CREATE TABLE IF NOT EXISTS public.admin_messenger_call_sound_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voice_incoming_enabled boolean NOT NULL DEFAULT true,
  voice_incoming_sound_url text,
  voice_outgoing_ringback_enabled boolean NOT NULL DEFAULT true,
  voice_outgoing_ringback_url text,
  video_incoming_enabled boolean NOT NULL DEFAULT true,
  video_incoming_sound_url text,
  video_outgoing_ringback_enabled boolean NOT NULL DEFAULT true,
  video_outgoing_ringback_url text,
  missed_notification_enabled boolean NOT NULL DEFAULT true,
  missed_notification_sound_url text,
  call_end_enabled boolean NOT NULL DEFAULT true,
  call_end_sound_url text,
  use_custom_sounds boolean NOT NULL DEFAULT true,
  default_fallback_sound_url text
);

INSERT INTO public.admin_messenger_call_sound_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.admin_messenger_call_sound_settings IS '관리자 메신저 통화 음성/영상 벨·링백·부재·종료 사운드';

ALTER TABLE public.admin_messenger_call_sound_settings ENABLE ROW LEVEL SECURITY;
