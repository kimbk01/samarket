-- 1b 시험용: 운영 user_social_relations 제약 (운영 pg_constraint 읽기 전용 복사, 2026-11-10)
ALTER TABLE public.user_social_relations ADD CONSTRAINT user_social_relations_pkey PRIMARY KEY USING INDEX user_social_relations_pkey;
ALTER TABLE public.user_social_relations ADD CONSTRAINT user_social_relations_owner_user_id_target_user_id_key UNIQUE USING INDEX user_social_relations_owner_user_id_target_user_id_key;
ALTER TABLE public.user_social_relations ADD CONSTRAINT user_social_relations_block_source_check CHECK (((block_source IS NULL) OR (block_source = ANY (ARRAY['friend_list'::text, 'chat_room'::text, 'profile'::text, 'incoming_call'::text, 'call_log'::text]))));
ALTER TABLE public.user_social_relations ADD CONSTRAINT user_social_relations_check CHECK ((owner_user_id <> target_user_id));
ALTER TABLE public.user_social_relations ADD CONSTRAINT user_social_relations_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_social_relations ADD CONSTRAINT user_social_relations_relation_type_check CHECK ((relation_type = ANY (ARRAY['friend'::text, 'blocked'::text])));
ALTER TABLE public.user_social_relations ADD CONSTRAINT user_social_relations_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
