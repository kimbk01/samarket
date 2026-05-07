-- 알림 인박스: 스토어 주문 이벤트 기준 DB 중복 방지 (Phase 9).
-- store_order_events 적용 이후 실행 가정.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text NULL;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS store_order_event_id uuid NULL REFERENCES public.store_order_events (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.notifications.dedupe_key IS
  '동일 수신자(user_id)에게 같은 비즈니스 알림을 반복 삽입하지 않기 위한 키 (선택).';

COMMENT ON COLUMN public.notifications.store_order_event_id IS
  'store_order_events 원장 행과 1:1로 매칭되는 인앱 알림 (선택, ON DELETE SET NULL).';

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_store_order_event_uidx
  ON public.notifications (user_id, store_order_event_id)
  WHERE store_order_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_key_uidx
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND btrim(dedupe_key) <> '';
