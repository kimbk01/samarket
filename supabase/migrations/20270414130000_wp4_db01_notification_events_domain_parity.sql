-- WP-4 / DB-01 — notification_events 도메인 컬럼·제약·인덱스 migration 패리티
--
-- 재감사(2026-10-02, prod ckdosyydvgzqwpbwuhon): 아래 2개 컬럼 / 3개 CHECK 제약 /
-- 1개 인덱스가 prod 에는 있으나 migrations 에 없어 신규/로컬 DB 가 prod 와 어긋난다.
-- prod 정의를 그대로 옮긴 멱등 마이그레이션 — prod 적용 시 전부 IF NOT EXISTS 로 no-op.
-- (동일 이름의 다른 정의가 이미 있으면 건드리지 않는다. 정의 교체가 필요하면 별도 PR.)

BEGIN;

-- 컬럼 2개
ALTER TABLE public.notification_events ADD COLUMN IF NOT EXISTS chat_domain text;
ALTER TABLE public.notification_events ADD COLUMN IF NOT EXISTS domain_identity_key text;

-- CHECK 제약 3개 (prod 정의 그대로)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='notification_events_chat_domain_check'
      AND conrelid='public.notification_events'::regclass
  ) THEN
    ALTER TABLE public.notification_events
      ADD CONSTRAINT notification_events_chat_domain_check
      CHECK ((chat_domain IS NULL) OR (chat_domain = ANY (ARRAY['general_direct','group','trade','store_order'])));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='notification_events_domain_identity_pair_check'
      AND conrelid='public.notification_events'::regclass
  ) THEN
    ALTER TABLE public.notification_events
      ADD CONSTRAINT notification_events_domain_identity_pair_check
      CHECK (
        ((chat_domain IS NULL) AND (domain_identity_key IS NULL))
        OR ((chat_domain IS NOT NULL)
            AND (NULLIF(btrim(domain_identity_key), '') IS NOT NULL)
            AND (domain_identity_key LIKE (chat_domain || ':%')))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='notification_events_message_domain_required_check'
      AND conrelid='public.notification_events'::regclass
  ) THEN
    ALTER TABLE public.notification_events
      ADD CONSTRAINT notification_events_message_domain_required_check
      CHECK (
        (type <> ALL (ARRAY['chat_message','group_message','mention_message','pin_message','trade_message','store_order_message']))
        OR ((chat_domain IS NOT NULL) AND (domain_identity_key IS NOT NULL))
      );
  END IF;
END $$;

-- 인덱스 1개 (prod 정의 그대로)
CREATE INDEX IF NOT EXISTS idx_notification_events_user_domain_unread
  ON public.notification_events USING btree (user_id, chat_domain, created_at DESC)
  WHERE ((unread = true) AND (read_at IS NULL) AND (chat_domain IS NOT NULL));

COMMIT;
