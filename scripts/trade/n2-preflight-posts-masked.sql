-- N2 preflight: posts_masked / posts / mask function (read-only)
SELECT
  to_regclass('public.posts') IS NOT NULL AS has_posts,
  to_regclass('public.posts_masked') IS NOT NULL AS has_posts_masked,
  to_regprocedure('public.posts_mask_reserved_buyer_id(uuid)') IS NOT NULL AS has_mask_fn,
  to_regclass('public.trade_national_lgu') IS NOT NULL AS has_trade_national_lgu;

SELECT c.relname, c.relkind,
  CASE WHEN c.relkind = 'v' THEN pg_get_viewdef(c.oid, true) ELSE NULL END AS viewdef_preview
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'posts_masked';

SELECT COUNT(*)::bigint AS posts_count_before FROM public.posts;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'trade_lgu_id'
  ) AS has_trade_lgu_id_already;
