-- store_orders Realtime: 오너(store_id)·구매자(buyer_user_id)·단건(id) 필터 구독용 publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'store_orders'
  ) THEN
    RAISE NOTICE 'store_orders_rt_pub: store_orders 없음 — 건너뜀';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'store_orders_rt_pub: supabase_realtime publication 없음 — 건너뜀';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'store_orders'
  ) THEN
    RAISE NOTICE 'store_orders_rt_pub: 이미 publication 에 포함됨';
    RETURN;
  END IF;

  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.store_orders';
  RAISE NOTICE 'store_orders_rt_pub: public.store_orders publication 추가';
END $$;
