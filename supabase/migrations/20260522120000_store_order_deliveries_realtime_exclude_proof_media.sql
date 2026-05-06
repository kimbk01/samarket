-- Step 22: Realtime 페이로드에서 POD 증빙 스토리지 필드 제외 (구매자·오너·라이더 WS 노출 차단)
-- - REST·관리자 서명 URL 경로는 변경 없음 (동일 테이블 컬럼 유지)
-- - supabase_realtime publication 에서 테이블만 제거하지 않고, 컬럼 제한 재등록 (PG15+)
-- - 제외: delivered_proof_image_path, failure_proof_image_path, delivered_proof_image_url, failure_proof_image_url

DO $$
DECLARE
  v_pg_ok boolean;
  v_in_pub boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'store_order_deliveries_rt_exclude_proof: supabase_realtime 없음 — 건너뜀';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'store_order_deliveries'
  ) THEN
    RAISE NOTICE 'store_order_deliveries_rt_exclude_proof: store_order_deliveries 없음 — 건너뜀';
    RETURN;
  END IF;

  SELECT current_setting('server_version_num')::int >= 150000 INTO v_pg_ok;
  IF NOT v_pg_ok THEN
    RAISE WARNING 'store_order_deliveries_rt_exclude_proof: PostgreSQL 15+ 필요( publication 컬럼 목록 ). 업그레이드 후 재적용하세요.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'store_order_deliveries'
  ) INTO v_in_pub;

  -- PK 기준 OLD 튜플 최소화( FULL 일 때 publication 컬럼 제약 회피 )
  ALTER TABLE public.store_order_deliveries REPLICA IDENTITY DEFAULT;

  IF v_in_pub THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.store_order_deliveries';
    RAISE NOTICE 'store_order_deliveries_rt_exclude_proof: publication 에서 기존 등록 제거';
  END IF;

  EXECUTE $pub$
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_order_deliveries (
      order_id,
      store_id,
      buyer_user_id,
      rider_id,
      delivery_status,
      assigned_at,
      picked_up_at,
      delivered_at,
      admin_note,
      failure_reason,
      rider_accepted_at,
      customer_arrived_at,
      rider_decline_reason,
      delivered_proof_note,
      delivered_receiver_name,
      delivered_confirmed_at,
      delivered_proof_lat,
      delivered_proof_lng,
      failure_note,
      rider_failure_reported_at,
      rider_failure_report_reason,
      failure_report_lat,
      failure_report_lng,
      failed_at,
      created_at,
      updated_at
    )
  $pub$;

  RAISE NOTICE 'store_order_deliveries_rt_exclude_proof: POD 미디어 4컬럼 제외 후 재등록 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'store_order_deliveries_rt_exclude_proof 실패: %', SQLERRM;
END $$;
