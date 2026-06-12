-- 사용자 포인트 충전 신청: 관리자 Realtime 구독 + RLS SELECT

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'user_point_charge_rt: supabase_realtime publication 없음 — 건너뜀';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'point_charge_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.point_charge_requests';
  END IF;
END $$;

DROP POLICY IF EXISTS point_charge_requests_admin_select ON public.point_charge_requests;
CREATE POLICY point_charge_requests_admin_select
  ON public.point_charge_requests
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));
