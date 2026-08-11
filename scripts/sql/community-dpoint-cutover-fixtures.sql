SELECT 'user' AS section, id::text AS k, coalesce(username,'') || '|' || coalesce(email,'') || '|pts=' || coalesce(points,0)::text AS v
  FROM public.profiles
 WHERE username IN ('asas55', 'aaaa')
    OR id IN (
      SELECT id FROM auth.users WHERE email IN ('aaaa@manual.local', 'asas55@manual.local')
    )
UNION ALL
SELECT 'topic', slug, coalesce(section_slug,'') || '|id=' || id::text
  FROM public.community_topics
 WHERE is_active IS DISTINCT FROM false
UNION ALL
SELECT 'policy', board_key,
       'layer=' || coalesce(policy_layer,'') ||
       ' inherit=' || inherit_global::text ||
       ' write=' || write_reward_type || ':' || write_fixed_point::text ||
       ' rand=' || write_random_min::text || '-' || write_random_max::text ||
       ' cd=' || write_cooldown_seconds::text ||
       ' dcap=' || daily_reward_post_cap::text ||
       ' active=' || is_active::text
  FROM public.board_point_policies
 ORDER BY 1, 2;
