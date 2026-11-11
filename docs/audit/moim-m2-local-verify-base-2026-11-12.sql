-- 운영(ckdosyydvgzqwpbwuhon) 의존 구조 재현 (2026-11-12 조회 결과 기준) — 로컬 임시 검증 전용
do $r$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $r$;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant execute on function auth.role(), auth.uid() to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key,
  nickname text,
  avatar_url text,
  phone_verified boolean default false,
  date_of_birth date,
  member_status text,
  deleted_at timestamptz
);
create table public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  canonical_lgu_id text,
  is_default_master boolean default false,
  is_active boolean default true
);

create table public.community_messenger_rooms (
  id uuid primary key default gen_random_uuid(),
  room_type text not null,
  title text not null default '',
  avatar_url text,
  created_by uuid,
  direct_key text unique,
  last_message text not null default '',
  last_message_at timestamptz not null default now(),
  last_message_type text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  room_status text not null default 'active',
  is_readonly boolean not null default false,
  admin_note text not null default '',
  moderated_by uuid, moderated_at timestamptz,
  summary text not null default '',
  visibility text not null default 'private',
  join_policy text not null default 'invite_only',
  password_hash text,
  owner_user_id uuid,
  member_limit integer default 200,
  is_discoverable boolean not null default false,
  allow_member_invite boolean not null default true,
  identity_policy text not null default 'real_name',
  notice_text text not null default '',
  notice_updated_at timestamptz, notice_updated_by uuid,
  allow_admin_invite boolean not null default true,
  allow_admin_kick boolean not null default true,
  allow_member_upload boolean not null default true,
  allow_member_call boolean not null default true,
  allow_admin_edit_notice boolean not null default true,
  trade_seller_left_at timestamptz, trade_messenger_write_block_user_id uuid,
  relation_status text not null default 'accepted',
  accepted_at timestamptz, declined_at timestamptz, blocked_at timestamptz,
  pinned_message_id uuid,
  invite_token text,
  invite_link_enabled boolean not null default true,
  chat_domain text not null,
  domain_identity_key text not null,
  domain_identity text,
  deleted_at timestamptz, deleted_by uuid,
  last_message_meta jsonb,
  constraint community_messenger_rooms_chat_domain_check CHECK (((chat_domain IS NULL) OR (chat_domain = ANY (ARRAY['general_direct'::text, 'group'::text, 'trade'::text, 'store_order'::text])))),
  constraint community_messenger_rooms_direct_consistency_check CHECK ((((room_type = 'direct'::text) AND (direct_key IS NOT NULL)) OR ((room_type = ANY (ARRAY['private_group'::text, 'open_group'::text])) AND (direct_key IS NULL)))),
  constraint community_messenger_rooms_identity_policy_check CHECK ((identity_policy = ANY (ARRAY['real_name'::text, 'alias_allowed'::text]))),
  constraint community_messenger_rooms_join_policy_check CHECK ((join_policy = ANY (ARRAY['invite_only'::text, 'password'::text, 'free'::text]))),
  constraint community_messenger_rooms_last_message_type_check CHECK ((last_message_type = ANY (ARRAY['text'::text, 'image'::text, 'file'::text, 'system'::text, 'call_stub'::text, 'voice'::text, 'sticker'::text, 'community_post_share'::text, 'gift_certificate'::text]))),
  constraint community_messenger_rooms_member_limit_check CHECK (((member_limit IS NULL) OR ((member_limit >= 2) AND (member_limit <= 1000)))),
  constraint community_messenger_rooms_password_consistency_check CHECK ((((room_type = 'open_group'::text) AND (visibility = 'public'::text) AND (join_policy = 'password'::text) AND (password_hash IS NOT NULL)) OR ((room_type = 'open_group'::text) AND (visibility = 'public'::text) AND (join_policy = 'free'::text) AND (password_hash IS NULL)) OR ((room_type = 'private_group'::text) AND (visibility = 'private'::text) AND (join_policy = 'invite_only'::text) AND (password_hash IS NULL)) OR ((room_type = 'direct'::text) AND (visibility = 'private'::text) AND (join_policy = 'invite_only'::text) AND (password_hash IS NULL)))),
  constraint community_messenger_rooms_relation_status_check CHECK ((relation_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'blocked'::text]))),
  constraint community_messenger_rooms_room_status_check CHECK ((room_status = ANY (ARRAY['active'::text, 'blocked'::text, 'archived'::text]))),
  constraint community_messenger_rooms_room_type_check CHECK ((room_type = ANY (ARRAY['direct'::text, 'private_group'::text, 'open_group'::text]))),
  constraint community_messenger_rooms_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'public'::text])))
);
create unique index community_messenger_rooms_domain_identity_key_uidx on public.community_messenger_rooms (chat_domain, domain_identity_key);
create unique index community_messenger_rooms_invite_token_uidx on public.community_messenger_rooms (invite_token) where invite_token is not null;
create unique index uq_cm_rooms_domain_identity on public.community_messenger_rooms (domain_identity) where domain_identity is not null;

create function public.guard_community_messenger_rooms_domain_immutable() returns trigger language plpgsql as $$
begin
  if new.chat_domain is distinct from old.chat_domain
     or new.domain_identity_key is distinct from old.domain_identity_key then
    raise exception 'dibay_chat_domain_identity_immutable';
  end if;
  return new;
end;
$$;
create trigger trg_community_messenger_rooms_guard_domain_immutable before update on public.community_messenger_rooms
  for each row execute function public.guard_community_messenger_rooms_domain_immutable();

create table public.community_messenger_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_messenger_rooms(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  unread_count integer not null default 0,
  is_muted boolean not null default false,
  is_pinned boolean not null default false,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz, last_read_message_id uuid,
  is_archived boolean not null default false,
  hidden_at timestamptz, left_at timestamptz, blocked_hidden_at timestamptz,
  last_visible_message_id uuid, declined_hidden_at timestamptz, cleared_at timestamptz,
  mark_read_generation bigint not null default 0,
  store_order_role text,
  unique (room_id, user_id)
);
create unique index community_messenger_participants_one_active_owner_uidx on public.community_messenger_participants (room_id) where role = 'owner' and left_at is null;
alter table public.community_messenger_participants enable row level security;
create policy cm_participants_self_update on public.community_messenger_participants for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cm_participants_self_select on public.community_messenger_participants for select to authenticated using (user_id = auth.uid());
grant select, update on public.community_messenger_participants to authenticated;
alter table public.community_messenger_rooms enable row level security;
grant select, insert, update on public.community_messenger_rooms to service_role;
grant all on public.community_messenger_participants to service_role;

-- 운영 prosrc 그대로
create function public.cm_participants_guard_privileged_insert() returns trigger language plpgsql as $$
DECLARE
  jwt_role text := coalesce(auth.role(), '');
BEGIN
  IF jwt_role = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF jwt_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'cm_participants_insert_requires_server';
  END IF;
  IF NEW.role IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'cm_participants_role_requires_server';
  END IF;
  RETURN NEW;
END;
$$;
create function public.cm_participants_guard_privileged_update() returns trigger language plpgsql as $$
DECLARE
  jwt_role text := coalesce(auth.role(), '');
BEGIN
  IF jwt_role = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF jwt_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'cm_participants_identity_immutable';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'cm_participants_role_requires_server';
  END IF;
  IF NEW.left_at IS DISTINCT FROM OLD.left_at THEN
    RAISE EXCEPTION 'cm_participants_leave_requires_server';
  END IF;
  RETURN NEW;
END;
$$;
create trigger trg_cm_participants_guard_privileged_insert before insert on public.community_messenger_participants for each row execute function public.cm_participants_guard_privileged_insert();
create trigger trg_cm_participants_guard_privileged_update before update on public.community_messenger_participants for each row execute function public.cm_participants_guard_privileged_update();

create table public.community_messenger_room_profiles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_messenger_rooms(id) on delete cascade,
  user_id uuid not null,
  identity_mode text not null check (identity_mode in ('real_name', 'alias')),
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table public.community_messenger_group_invite_links (id uuid primary key default gen_random_uuid(), room_id uuid not null, token text);
create table public.community_messenger_group_join_requests (id uuid primary key default gen_random_uuid(), room_id uuid not null, user_id uuid);
create table public.community_messenger_group_bans (id uuid primary key default gen_random_uuid(), room_id uuid not null, user_id uuid);

-- 시험 회원: u1·u2·u3 전화 인증 + 기본 주소, u4 미인증
insert into public.profiles (id, nickname, phone_verified, date_of_birth) values
  ('00000000-0000-0000-0000-0000000000a1', 'host1', true, '1990-01-01'),
  ('00000000-0000-0000-0000-0000000000a2', 'mem2', true, null),
  ('00000000-0000-0000-0000-0000000000a3', 'mem3', true, '2001-05-05'),
  ('00000000-0000-0000-0000-0000000000a4', 'nophone', false, null);
insert into public.user_addresses (user_id, canonical_lgu_id, is_default_master) values
  ('00000000-0000-0000-0000-0000000000a1', '1381300000', true),
  ('00000000-0000-0000-0000-0000000000a4', '1381300000', true);
grant all on all tables in schema public to service_role;
create table if not exists public.community_messenger_messages (id uuid primary key default gen_random_uuid(), room_id uuid not null);
grant all on public.community_messenger_messages to service_role;
