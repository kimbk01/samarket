ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS messenger_voice_messages_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS messenger_voice_calls_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS messenger_video_calls_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.stores.messenger_voice_messages_enabled IS
  '매장 주문 메신저 방에서 음성 메시지 허용 여부';
COMMENT ON COLUMN public.stores.messenger_voice_calls_enabled IS
  '매장 주문 메신저 방에서 음성 통화 허용 여부';
COMMENT ON COLUMN public.stores.messenger_video_calls_enabled IS
  '매장 주문 메신저 방에서 영상 통화 허용 여부';
