-- 가격 제안: Realtime `postgres_changes` (클라 `usePriceOffersProductRealtime`)
-- RLS 는 기존 `price_offers_select_participants` 등 유지 — publication 만 보강.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'price_offers_rt: supabase_realtime publication 없음 — 건너뜀';
    RETURN;
  END IF;

  IF to_regclass('public.price_offers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'price_offers'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.price_offers';
    RAISE NOTICE 'price_offers_rt: public.price_offers publication 추가';
  END IF;
END $$;
