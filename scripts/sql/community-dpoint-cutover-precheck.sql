-- READ-ONLY precheck. No DDL/DML.
SELECT 'related_types' AS section, related_type AS k, COUNT(*)::text AS v
  FROM public.point_ledger
 GROUP BY related_type
UNION ALL
SELECT 'dup_reward_groups', 'n', (
  SELECT COUNT(*)::text FROM (
    SELECT user_id, related_id FROM public.point_ledger
     WHERE related_type = 'community_reward'
     GROUP BY user_id, related_id HAVING COUNT(*) > 1
  ) x
)
UNION ALL
SELECT 'dup_reclaim_groups', 'n', (
  SELECT COUNT(*)::text FROM (
    SELECT user_id, related_id FROM public.point_ledger
     WHERE related_type = 'community_reclaim'
     GROUP BY user_id, related_id HAVING COUNT(*) > 1
  ) x
)
UNION ALL
SELECT 'null_related_id', 'n', (
  SELECT COUNT(*)::text FROM public.point_ledger
   WHERE related_type IN ('community_reward', 'community_reclaim')
     AND related_id IS NULL
)
UNION ALL
SELECT 'snapshot', 'ledger_all', (SELECT COUNT(*)::text FROM public.point_ledger)
UNION ALL
SELECT 'snapshot', 'reward', (SELECT COUNT(*)::text FROM public.point_ledger WHERE related_type = 'community_reward')
UNION ALL
SELECT 'snapshot', 'reclaim', (SELECT COUNT(*)::text FROM public.point_ledger WHERE related_type = 'community_reclaim')
UNION ALL
SELECT 'snapshot', 'executions', (SELECT COUNT(*)::text FROM public.point_reward_executions)
UNION ALL
SELECT 'snapshot', 'ledger_sum', (SELECT COALESCE(SUM(amount), 0)::text FROM public.point_ledger)
UNION ALL
SELECT 'snapshot', 'profiles_points_sum', (SELECT COALESCE(SUM(points), 0)::text FROM public.profiles)
UNION ALL
SELECT 'snapshot', 'neg_profiles', (SELECT COUNT(*)::text FROM public.profiles WHERE points < 0)
UNION ALL
SELECT 'snapshot', 'reclaim_policies', (SELECT COUNT(*)::text FROM public.point_reclaim_policies)
UNION ALL
SELECT 'exec_key_idx', indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename = 'point_reward_executions'
   AND indexdef ILIKE '%execution_key%'
UNION ALL
SELECT 'ledger_idx', indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename = 'point_ledger'
UNION ALL
SELECT 'board_col', column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'board_point_policies'
 ORDER BY 1, 2;
