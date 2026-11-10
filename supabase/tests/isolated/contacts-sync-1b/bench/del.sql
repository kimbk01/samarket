DELETE FROM public.user_social_relations WHERE relation_type = 'friend'
  AND ((owner_user_id = '20000000-0000-0000-0000-000000000001' AND target_user_id = '20000000-0000-0000-0000-000000000002')
    OR (owner_user_id = '20000000-0000-0000-0000-000000000002' AND target_user_id = '20000000-0000-0000-0000-000000000001'));
