BEGIN;
INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, is_active, block_source, blocked_at)
VALUES ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'blocked', true, 'profile', now())
ON CONFLICT (owner_user_id, target_user_id) DO UPDATE SET relation_type = 'blocked', is_active = true, blocked_at = now();
DELETE FROM public.user_social_relations WHERE relation_type = 'friend'
  AND ((owner_user_id = '20000000-0000-0000-0000-000000000001' AND target_user_id = '20000000-0000-0000-0000-000000000002')
    OR (owner_user_id = '20000000-0000-0000-0000-000000000002' AND target_user_id = '20000000-0000-0000-0000-000000000001'));
COMMIT;
DELETE FROM public.user_social_relations WHERE relation_type = 'blocked'
  AND owner_user_id = '20000000-0000-0000-0000-000000000002' AND target_user_id = '20000000-0000-0000-0000-000000000001';
