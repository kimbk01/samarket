-- Post-apply proof. Read-only.
SELECT 'rpc' AS section, p.proname AS k,
       pg_get_function_identity_arguments(p.oid) || ' definer=' || p.prosecdef::text AS v
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'apply_community_point_reward',
     'apply_community_point_reclaim',
     'project_user_point_balance_from_ledger'
   )
UNION ALL
SELECT 'uniq_idx', indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN (
     'uq_point_ledger_community_reward_source',
     'uq_point_ledger_community_reclaim_source'
   )
UNION ALL
SELECT 'exec_col', column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'point_reward_executions'
   AND column_name IN ('policy_snapshot', 'related_ledger_id')
UNION ALL
SELECT 'policy_col', column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'board_point_policies'
   AND column_name IN (
     'inherit_global', 'policy_layer', 'daily_reward_post_cap',
     'daily_reward_comment_cap', 'min_reward_post_chars',
     'min_reward_comment_chars', 'policy_version'
   )
UNION ALL
SELECT 'layer', board_key, policy_layer || ' inherit=' || inherit_global::text
  FROM public.board_point_policies
 WHERE board_key IN ('general', 'qna')
UNION ALL
SELECT 'reclaim_seed', id, target_type || '/' || trigger_type || ' active=' || is_active::text
  FROM public.point_reclaim_policies
 WHERE id IN ('prp-4','prp-5','prp-6','prp-7','prp-8')
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
SELECT 'grant', routine_name, grantee || ':' || privilege_type
  FROM information_schema.routine_privileges
 WHERE specific_schema = 'public'
   AND routine_name IN ('apply_community_point_reward', 'apply_community_point_reclaim')
 ORDER BY 1, 2;
