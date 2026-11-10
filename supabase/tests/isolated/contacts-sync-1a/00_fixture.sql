-- 연락처 동기화 1a 격리 시험 — 로컬 일회용 PostgreSQL 16 전용 (Supabase 프로젝트·테스트 DB 아님).
-- 운영 카탈로그를 읽기 전용으로 복사한 모양 (2026-11-10):
--   user_social_relations: 전체 열·유일/일반 색인 + 기존 트리거 trg_user_social_relations_blocked_clears_friend (함수 본문 원문)
--   community_friend_requests: 전체 열·색인
--   profiles: 이 기능이 읽는 열만 (id, created_at, nickname, username, dibay_id, avatar_url, status, deleted_at,
--             deletion_requested_at, phone, phone_country_code, phone_verified, phone_verified_at)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  nickname text,
  username text,
  dibay_id text,
  avatar_url text,
  status text,
  deleted_at timestamptz,
  deletion_requested_at timestamptz,
  phone text,
  phone_country_code text,
  phone_verified boolean NOT NULL DEFAULT false,
  phone_verified_at timestamptz
);

CREATE TABLE public.user_social_relations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  relation_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  block_source text,
  block_reason text,
  is_active boolean NOT NULL DEFAULT true,
  blocked_at timestamptz,
  unblocked_at timestamptz,
  last_action_at timestamptz
);
CREATE UNIQUE INDEX user_social_relations_owner_user_id_target_user_id_key ON public.user_social_relations USING btree (owner_user_id, target_user_id);
CREATE UNIQUE INDEX user_social_relations_pkey ON public.user_social_relations USING btree (id);
CREATE INDEX user_social_relations_owner_blocked_active_idx ON public.user_social_relations USING btree (owner_user_id, relation_type, is_active) WHERE (relation_type = 'blocked'::text);
CREATE INDEX user_social_relations_owner_type_idx ON public.user_social_relations USING btree (owner_user_id, relation_type, created_at DESC);
CREATE INDEX user_social_relations_target_type_idx ON public.user_social_relations USING btree (target_user_id, relation_type);

CREATE OR REPLACE FUNCTION public.user_social_relations_blocked_clears_friend()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.relation_type = 'blocked' THEN
    DELETE FROM public.user_social_relations
    WHERE owner_user_id = NEW.owner_user_id
      AND target_user_id = NEW.target_user_id
      AND relation_type = 'friend';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_user_social_relations_blocked_clears_friend BEFORE INSERT OR UPDATE OF relation_type ON public.user_social_relations FOR EACH ROW EXECUTE FUNCTION user_social_relations_blocked_clears_friend();

CREATE TABLE public.community_friend_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  admin_note text,
  handled_by_admin_id uuid,
  handled_at timestamptz
);
CREATE UNIQUE INDEX community_friend_requests_pkey ON public.community_friend_requests USING btree (id);
CREATE UNIQUE INDEX community_friend_requests_requester_id_addressee_id_key ON public.community_friend_requests USING btree (requester_id, addressee_id);
CREATE INDEX community_friend_requests_addressee_idx ON public.community_friend_requests USING btree (addressee_id, status, created_at DESC);
CREATE INDEX community_friend_requests_requester_idx ON public.community_friend_requests USING btree (requester_id, status, created_at DESC);
CREATE INDEX community_friend_requests_status_idx ON public.community_friend_requests USING btree (status, created_at DESC);
