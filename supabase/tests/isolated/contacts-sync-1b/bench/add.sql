INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type)
VALUES ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'friend'),
       ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'friend')
ON CONFLICT (owner_user_id, target_user_id) DO NOTHING;
