-- Web Push(VAPID) 구독 저장 — 브라우저 PushSubscription 엔드포인트·키
-- 서버 발송은 service_role 로 조회·만료 구독 삭제, 사용자는 JWT 로 본인 행만 CRUD

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  key_p256dh text NOT NULL,
  key_auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_push_subscriptions_endpoint_key UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_id_idx ON public.web_push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_updated_idx ON public.web_push_subscriptions (user_id, updated_at ASC);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "web_push_subscriptions_select_own" ON public.web_push_subscriptions;
CREATE POLICY "web_push_subscriptions_select_own"
  ON public.web_push_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "web_push_subscriptions_insert_own" ON public.web_push_subscriptions;
CREATE POLICY "web_push_subscriptions_insert_own"
  ON public.web_push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "web_push_subscriptions_update_own" ON public.web_push_subscriptions;
CREATE POLICY "web_push_subscriptions_update_own"
  ON public.web_push_subscriptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "web_push_subscriptions_delete_own" ON public.web_push_subscriptions;
CREATE POLICY "web_push_subscriptions_delete_own"
  ON public.web_push_subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.web_push_subscriptions IS '브라우저 Web Push 구독(VAPID). 만료(410) 시 서버에서 삭제.';
