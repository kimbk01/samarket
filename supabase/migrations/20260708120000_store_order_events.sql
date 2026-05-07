-- Append-only 주문 이벤트 원장 (알림·타임라인 dedupe 앵커).
-- INSERT 는 서비스 롤(서버 라우트) 위주 — RLS 로 클라 직접 쓰기 억제.

CREATE TABLE IF NOT EXISTS public.store_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.store_orders (id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  actor_user_id uuid NULL,
  actor_role text NOT NULL,
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  message text NULL,
  dedupe_key text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_order_events_actor_role_check CHECK (
    actor_role IN ('buyer', 'owner', 'rider', 'admin', 'system')
  )
);

COMMENT ON TABLE public.store_order_events IS
  '매장 주문 도메인 append-only 이벤트 — 상태·알림·타임라인 dedupe 의 단일 원장.';

CREATE INDEX IF NOT EXISTS store_order_events_order_created_idx
  ON public.store_order_events (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS store_order_events_store_created_idx
  ON public.store_order_events (store_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS store_order_events_dedupe_uidx
  ON public.store_order_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND btrim(dedupe_key) <> '';

ALTER TABLE public.store_order_events ENABLE ROW LEVEL SECURITY;

-- 구매자: 본인 주문 이벤트만 조회
CREATE POLICY store_order_events_select_buyer
  ON public.store_order_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.store_orders so
      WHERE so.id = store_order_events.order_id
        AND so.buyer_user_id = auth.uid()
    )
  );

-- 매장 소유자: 해당 매장 주문 이벤트 조회
CREATE POLICY store_order_events_select_owner
  ON public.store_order_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores st
      WHERE st.id = store_order_events.store_id
        AND st.owner_user_id = auth.uid()
    )
  );

-- 클라이언트 직접 INSERT/UPDATE/DELETE 금지 (서비스 롤은 RLS 우회)
CREATE POLICY store_order_events_no_insert_authenticated
  ON public.store_order_events
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY store_order_events_no_update_authenticated
  ON public.store_order_events
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY store_order_events_no_delete_authenticated
  ON public.store_order_events
  FOR DELETE
  TO authenticated
  USING (false);
