-- =============================================================================
-- M2 — 신규 모임(moim) 스키마 · 권한 함수 · 핵심 RPC · 메신저 모임 방 보호
-- Owner 2026-11-12 「권고안으로 진행」(설계안 v1 D1~D10 권고 + 신원 C안) → 「M2 진행」
-- 설계: docs/design/moim/moim-design-v1-2026-11-12.md §2 · §3 · §4 · §5 · §6(P1·P3~P8·P15)
--
-- 원칙
--   * 모임 테이블은 클라이언트 직접 접근 없음 (RLS on · 정책 없음 · anon/authenticated 권한 회수).
--     읽기·쓰기 모두 서버(service_role) → 아래 RPC. RPC 는 p_actor 를 받아 권한을 DB 에서 판정한다.
--   * 권한 판정은 moim_actor_can() 하나 (TS 계약 lib/moim/moim-permission-contract.ts 와 같은 표).
--   * 수치 상한(D6)은 moim_policies 한 행에 두고, 값이 NULL 이면 검사하지 않는다(Owner 지정 전).
--   * 모임 채팅방 = 메신저 private_group 방 + owner_domain='moim'. 입장·퇴장·역할은 모임 RPC 만 바꾼다.
--     메신저 쪽(초대 링크·가입 요청·방 차단·방 나가기·방장 변경·방 삭제·이름 변경)은 DB 트리거가 막는다.
--   * 카테고리는 시드하지 않는다(목록은 Owner/어드민 결정 — M5 어드민 화면).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. 메신저 방: 소유 도메인 표시
-- -----------------------------------------------------------------------------
alter table public.community_messenger_rooms
  add column if not exists owner_domain text null,
  add column if not exists owner_ref_id uuid null;

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_owner_domain_check;
alter table public.community_messenger_rooms
  add constraint community_messenger_rooms_owner_domain_check
  check (
    (owner_domain is null and owner_ref_id is null)
    or (owner_domain = 'moim' and owner_ref_id is not null and room_type = 'private_group')
  );

create index if not exists community_messenger_rooms_owner_ref_idx
  on public.community_messenger_rooms (owner_ref_id) where owner_domain is not null;

-- -----------------------------------------------------------------------------
-- 1. 테이블
-- -----------------------------------------------------------------------------
create table if not exists public.moim_policies (
  id smallint primary key default 1 check (id = 1),
  max_moims_per_user int null check (max_moims_per_user is null or max_moims_per_user > 0),
  max_capacity int null check (max_capacity is null or max_capacity >= 2),
  max_co_hosts int null check (max_co_hosts is null or max_co_hosts >= 0),
  max_staff int null check (max_staff is null or max_staff >= 0),
  max_custom_boards int null check (max_custom_boards is null or max_custom_boards >= 0),
  max_pinned_notices int null check (max_pinned_notices is null or max_pinned_notices >= 0),
  join_request_expire_days int null check (join_request_expire_days is null or join_request_expire_days > 0),
  closed_retention_days int null check (closed_retention_days is null or closed_retention_days > 0),
  schedule_room_archive_days int null check (schedule_room_archive_days is null or schedule_room_archive_days > 0),
  invite_resend_days int null check (invite_resend_days is null or invite_resend_days > 0),
  inactive_unlist_days int null check (inactive_unlist_days is null or inactive_unlist_days > 0),
  name_min_len int null, name_max_len int null,
  intro_min_len int null, intro_max_len int null,
  banned_words text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid null
);
insert into public.moim_policies (id) values (1) on conflict (id) do nothing;

create table if not exists public.moim_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]{2,40}$'),
  label_ko text not null,
  label_en text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  is_restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moims (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  intro text not null default '',
  cover_image_url text null,
  category_id uuid not null references public.moim_categories(id),
  lgu_id text not null,
  region_scope text not null default 'city' check (region_scope in ('city')),
  join_mode text not null check (join_mode in ('instant', 'approval')),
  capacity int null check (capacity is null or capacity >= 2),
  age_min_birth_year int null,
  age_max_birth_year int null,
  host_user_id uuid not null references public.profiles(id),
  status text not null default 'active' check (status in ('active', 'closed', 'deleted')),
  platform_state text not null default 'normal' check (platform_state in ('normal', 'unlisted', 'warned', 'blocked')),
  member_count int not null default 0 check (member_count >= 0),
  last_activity_at timestamptz not null default now(),
  main_room_id uuid null references public.community_messenger_rooms(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by uuid null,
  check (age_min_birth_year is null or age_max_birth_year is null or age_min_birth_year <= age_max_birth_year)
);
create index if not exists moims_discover_idx on public.moims (lgu_id, status, platform_state, last_activity_at desc);
create index if not exists moims_host_idx on public.moims (host_user_id);
create index if not exists moims_creator_active_idx on public.moims (created_by) where status = 'active';

create table if not exists public.moim_members (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role text not null default 'member' check (role in ('host', 'co_host', 'staff', 'member')),
  status text not null check (status in ('pending', 'active', 'left', 'kicked', 'banned', 'rejected')),
  nickname text not null,
  avatar_url text null,
  bio text not null default '',
  joined_at timestamptz null,
  left_at timestamptz null,
  rejoin_count int not null default 0,
  invited_by uuid null,
  decided_by uuid null,
  decided_at timestamptz null,
  role_changed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (moim_id, user_id)
);
create index if not exists moim_members_user_idx on public.moim_members (user_id, status);
create index if not exists moim_members_moim_idx on public.moim_members (moim_id, status, role);
create unique index if not exists moim_members_one_host_uidx on public.moim_members (moim_id) where role = 'host' and status = 'active';

create table if not exists public.moim_member_profile_history (
  id bigint generated always as identity primary key,
  moim_id uuid not null references public.moims(id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  avatar_url text null,
  bio text not null default '',
  changed_at timestamptz not null default now()
);

create table if not exists public.moim_join_questions (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  sort_order int not null check (sort_order between 1 and 3),
  question text not null,
  unique (moim_id, sort_order)
);

create table if not exists public.moim_join_requests (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  answers jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  reason text null,
  decided_by uuid null,
  decided_at timestamptz null,
  created_at timestamptz not null default now()
);
create unique index if not exists moim_join_requests_one_pending_uidx on public.moim_join_requests (moim_id, user_id) where status = 'pending';
create index if not exists moim_join_requests_moim_idx on public.moim_join_requests (moim_id, status, created_at);

create table if not exists public.moim_bans (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  banned_by uuid not null,
  reason text null,
  created_at timestamptz not null default now(),
  released_at timestamptz null,
  released_by uuid null
);
create unique index if not exists moim_bans_active_uidx on public.moim_bans (moim_id, user_id) where released_at is null;

create table if not exists public.moim_member_notes (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  target_user_id uuid not null,
  author_user_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists moim_member_notes_target_idx on public.moim_member_notes (moim_id, target_user_id);

create table if not exists public.moim_permissions (
  moim_id uuid not null references public.moims(id) on delete cascade,
  action text not null,
  min_role text not null check (min_role in ('host', 'co_host', 'staff', 'member')),
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  primary key (moim_id, action)
);

create table if not exists public.moim_invites (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  token text not null unique,
  created_by uuid not null,
  expires_at timestamptz null,
  usage_count int not null default 0,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.moim_invite_targets (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id),
  invitee_user_id uuid not null references public.profiles(id),
  status text not null default 'sent' check (status in ('sent', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz null
);
create index if not exists moim_invite_targets_invitee_idx on public.moim_invite_targets (invitee_user_id, status);
create index if not exists moim_invite_targets_pair_idx on public.moim_invite_targets (moim_id, invitee_user_id, created_at desc);

create table if not exists public.moim_boards (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  kind text not null check (kind in ('notice', 'free', 'greeting', 'review', 'custom')),
  name text null,
  write_min_role text not null default 'member' check (write_min_role in ('host', 'co_host', 'staff', 'member')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind = 'custom' and name is not null or kind <> 'custom')
);
create unique index if not exists moim_boards_system_kind_uidx on public.moim_boards (moim_id, kind) where kind <> 'custom';

create table if not exists public.moim_posts (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  board_id uuid not null references public.moim_boards(id),
  author_id uuid not null references public.profiles(id),
  title text not null default '',
  body text not null default '',
  images jsonb not null default '[]'::jsonb,
  visibility text not null default 'members' check (visibility in ('members', 'public')),
  is_pinned boolean not null default false,
  status text not null default 'active' check (status in ('active', 'hidden', 'deleted')),
  hidden_by uuid null,
  hidden_reason text null,
  comment_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists moim_posts_board_idx on public.moim_posts (moim_id, board_id, status, created_at desc);

create table if not exists public.moim_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.moim_posts(id) on delete cascade,
  moim_id uuid not null references public.moims(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  status text not null default 'active' check (status in ('active', 'hidden', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists moim_comments_post_idx on public.moim_comments (post_id, created_at);

create table if not exists public.moim_schedules (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  host_user_id uuid not null references public.profiles(id),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  place_text text not null default '',
  place_lat double precision null,
  place_lng double precision null,
  description text not null default '',
  images jsonb not null default '[]'::jsonb,
  capacity int null check (capacity is null or capacity >= 1),
  join_mode text not null default 'first_come' check (join_mode in ('first_come', 'approval')),
  ask_motivation boolean not null default false,
  status text not null default 'recruiting' check (status in ('recruiting', 'full', 'closed', 'done', 'cancelled')),
  room_id uuid null references public.community_messenger_rooms(id) on delete set null,
  confirmed_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists moim_schedules_moim_idx on public.moim_schedules (moim_id, starts_at);

create table if not exists public.moim_schedule_participants (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.moim_schedules(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  status text not null check (status in ('requested', 'confirmed', 'rejected', 'cancelled', 'removed')),
  motivation text null,
  attendance text not null default 'unknown' check (attendance in ('unknown', 'present', 'absent')),
  decided_by uuid null,
  decided_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, user_id)
);

create table if not exists public.moim_album_items (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id),
  url text not null,
  schedule_id uuid null references public.moim_schedules(id) on delete set null,
  is_pinned boolean not null default false,
  status text not null default 'active' check (status in ('active', 'hidden', 'deleted')),
  created_at timestamptz not null default now()
);
create index if not exists moim_album_items_moim_idx on public.moim_album_items (moim_id, status, created_at desc);

create table if not exists public.moim_host_transfers (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  from_user_id uuid not null,
  to_user_id uuid not null,
  kind text not null check (kind in ('direct', 'inactive_request', 'admin', 'account_withdrawal')),
  status text not null check (status in ('requested', 'accepted', 'declined', 'cancelled', 'done')),
  reason text null,
  actor_id uuid null,
  created_at timestamptz not null default now(),
  decided_at timestamptz null
);
create unique index if not exists moim_host_transfers_one_open_uidx on public.moim_host_transfers (moim_id) where status = 'requested';

create table if not exists public.moim_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  moim_id uuid not null references public.moims(id) on delete cascade,
  target_type text not null check (target_type in ('moim', 'member', 'post', 'comment', 'schedule', 'album', 'chat_message')),
  target_id uuid not null,
  reason_code text not null,
  detail text null,
  status text not null default 'received' check (status in ('received', 'reviewing', 'actioned', 'dismissed')),
  action_id uuid null,
  handled_by uuid null,
  handled_at timestamptz null,
  created_at timestamptz not null default now()
);
create unique index if not exists moim_reports_open_dedupe_uidx on public.moim_reports (reporter_id, target_type, target_id) where status in ('received', 'reviewing');
create index if not exists moim_reports_queue_idx on public.moim_reports (status, created_at);

create table if not exists public.moim_sanctions (
  id uuid primary key default gen_random_uuid(),
  moim_id uuid not null references public.moims(id) on delete cascade,
  target_kind text not null check (target_kind in ('moim', 'host', 'member', 'content')),
  target_id uuid not null,
  level text not null check (level in ('unlist', 'warn', 'block', 'content_hide', 'user_restrict')),
  reason_code text not null,
  reason text not null,
  source_report_id uuid null references public.moim_reports(id) on delete set null,
  actor_id uuid not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz null,
  revoked_at timestamptz null,
  revoked_by uuid null,
  created_at timestamptz not null default now()
);
create index if not exists moim_sanctions_moim_idx on public.moim_sanctions (moim_id, created_at desc);

create table if not exists public.moim_events (
  id bigint generated always as identity primary key,
  moim_id uuid not null references public.moims(id) on delete cascade,
  actor_id uuid null,
  actor_kind text not null check (actor_kind in ('user', 'admin', 'system')),
  type text not null,
  target_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists moim_events_moim_idx on public.moim_events (moim_id, created_at desc);

-- 클라이언트 직접 접근 차단 (RLS on · 정책 없음 · 권한 회수)
do $rls$
declare t text;
begin
  foreach t in array array[
    'moim_policies', 'moim_categories', 'moims', 'moim_members', 'moim_member_profile_history',
    'moim_join_questions', 'moim_join_requests', 'moim_bans', 'moim_member_notes', 'moim_permissions',
    'moim_invites', 'moim_invite_targets', 'moim_boards', 'moim_posts', 'moim_comments', 'moim_schedules',
    'moim_schedule_participants', 'moim_album_items', 'moim_host_transfers', 'moim_reports', 'moim_sanctions',
    'moim_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end
$rls$;

-- -----------------------------------------------------------------------------
-- 2. 메신저 모임 방 보호 (모임 RPC 만 입장·퇴장·역할·방 설정을 바꾼다)
-- -----------------------------------------------------------------------------
create or replace function public.moim__writer_on() returns void
language plpgsql volatile set search_path = public as $$
begin
  perform set_config('dibay.moim_writer', 'on', true);
end
$$;

create or replace function public.cm_moim_room_is_owned(p_room_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.community_messenger_rooms r where r.id = p_room_id and r.owner_domain = 'moim');
$$;

-- 트리거 함수는 다른 함수를 부르지 않는다(일반 회원 세션의 함수 실행 권한과 무관하게 동작).
create or replace function public.cm_moim_guard_participants() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 읽음 처리·알림 끄기 등 멤버십과 무관한 변경은 방 조회 없이 통과 (자주 일어나는 갱신의 비용 0)
  if tg_op = 'UPDATE' and new.role is not distinct from old.role and new.left_at is not distinct from old.left_at
     and new.user_id is not distinct from old.user_id and new.room_id is not distinct from old.room_id then
    return new;
  end if;
  if coalesce(current_setting('dibay.moim_writer', true), '') = 'on' then
    return new;
  end if;
  if exists (select 1 from public.community_messenger_rooms r where r.id = new.room_id and r.owner_domain is not null) then
    raise exception 'moim_room_membership_managed_by_moim' using errcode = 'P0001';
  end if;
  return new;
end
$$;

drop trigger if exists trg_cm_moim_guard_participants on public.community_messenger_participants;
create trigger trg_cm_moim_guard_participants
  before insert or update on public.community_messenger_participants
  for each row execute function public.cm_moim_guard_participants();

create or replace function public.cm_moim_guard_room_side_writes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('dibay.moim_writer', true), '') = 'on' then
    return new;
  end if;
  if exists (select 1 from public.community_messenger_rooms r where r.id = new.room_id and r.owner_domain is not null) then
    raise exception 'moim_room_membership_managed_by_moim' using errcode = 'P0001';
  end if;
  return new;
end
$$;

do $grd$
declare t text;
begin
  foreach t in array array['community_messenger_group_invite_links', 'community_messenger_group_join_requests', 'community_messenger_group_bans'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_cm_moim_guard_room_side on public.%I', t);
      execute format('create trigger trg_cm_moim_guard_room_side before insert on public.%I for each row execute function public.cm_moim_guard_room_side_writes()', t);
    end if;
  end loop;
end
$grd$;

create or replace function public.cm_moim_guard_rooms() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_writer boolean := coalesce(current_setting('dibay.moim_writer', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and (new.owner_domain is distinct from old.owner_domain or new.owner_ref_id is distinct from old.owner_ref_id) then
    raise exception 'moim_room_owner_immutable' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.owner_domain is not null and not v_writer then
      raise exception 'moim_room_create_requires_moim' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.owner_domain is null or v_writer then
    return new;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id
     or new.deleted_at is distinct from old.deleted_at
     or new.room_type is distinct from old.room_type
     or new.visibility is distinct from old.visibility
     or new.join_policy is distinct from old.join_policy
     or new.is_discoverable is distinct from old.is_discoverable
     or new.invite_link_enabled is distinct from old.invite_link_enabled
     or new.invite_token is distinct from old.invite_token
     or new.allow_member_invite is distinct from old.allow_member_invite
     or new.allow_admin_invite is distinct from old.allow_admin_invite
     or new.allow_admin_kick is distinct from old.allow_admin_kick
     or new.title is distinct from old.title
     or new.avatar_url is distinct from old.avatar_url
     or new.member_limit is distinct from old.member_limit
     or new.identity_policy is distinct from old.identity_policy then
    raise exception 'moim_room_settings_managed_by_moim' using errcode = 'P0001';
  end if;
  return new;
end
$$;

drop trigger if exists trg_cm_moim_guard_rooms on public.community_messenger_rooms;
create trigger trg_cm_moim_guard_rooms
  before insert or update on public.community_messenger_rooms
  for each row execute function public.cm_moim_guard_rooms();

-- -----------------------------------------------------------------------------
-- 3. 내부 도우미 (service_role 만)
-- -----------------------------------------------------------------------------
create or replace function public.moim__role_rank(p_role text) returns int
language sql immutable set search_path = public as $$
  select case p_role when 'host' then 4 when 'co_host' then 3 when 'staff' then 2 when 'member' then 1 else 0 end;
$$;

create or replace function public.moim__cm_role(p_role text) returns text
language sql immutable set search_path = public as $$
  select case p_role when 'host' then 'owner' when 'co_host' then 'admin' else 'member' end;
$$;

create or replace function public.moim__fail(p_code text) returns void
language plpgsql set search_path = public as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end
$$;

create or replace function public.moim__log(p_moim uuid, p_actor uuid, p_kind text, p_type text, p_target uuid, p_payload jsonb)
returns void language sql volatile set search_path = public as $$
  insert into public.moim_events (moim_id, actor_id, actor_kind, type, target_id, payload)
  values (p_moim, p_actor, p_kind, p_type, p_target, coalesce(p_payload, '{}'::jsonb));
$$;

/** 메신저 방 생성 (모임 전체 방 / 일정 방). 방장 = p_owner. 반환: room id */
create or replace function public.moim__room_create(p_kind text, p_ref uuid, p_owner uuid, p_title text, p_nickname text, p_avatar text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_room uuid := gen_random_uuid();
begin
  perform public.moim__writer_on();
  insert into public.community_messenger_rooms (
    id, room_type, room_status, visibility, join_policy, is_readonly, created_by, owner_user_id, title, summary,
    is_discoverable, allow_member_invite, notice_text, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice,
    allow_member_upload, allow_member_call, last_message, last_message_type, invite_token, invite_link_enabled,
    member_limit, identity_policy, chat_domain, domain_identity, domain_identity_key, owner_domain, owner_ref_id
  ) values (
    v_room, 'private_group', 'active', 'private', 'invite_only', false, p_owner, p_owner, left(p_title, 120), '',
    false, false, '', false, false, true,
    true, true, '', 'system', null, false,
    null, 'alias_allowed', 'group', 'group:' || v_room::text, 'group:' || v_room::text, 'moim', p_ref
  );
  perform public.moim__room_member_activate(v_room, p_owner, 'host', p_nickname, p_avatar);
  return v_room;
end
$$;

create or replace function public.moim__room_member_activate(p_room uuid, p_user uuid, p_role text, p_nickname text, p_avatar text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_cm_role text := public.moim__cm_role(p_role);
begin
  if p_room is null then return; end if;
  perform public.moim__writer_on();
  insert into public.community_messenger_participants (room_id, user_id, role, left_at, joined_at)
  values (p_room, p_user, v_cm_role, null, now())
  on conflict (room_id, user_id) do update
    set role = excluded.role, left_at = null, joined_at = case when public.community_messenger_participants.left_at is null then public.community_messenger_participants.joined_at else now() end;
  insert into public.community_messenger_room_profiles (room_id, user_id, identity_mode, display_name, bio, avatar_url)
  values (p_room, p_user, 'alias', left(p_nickname, 40), '', p_avatar)
  on conflict (room_id, user_id) do update
    set identity_mode = 'alias', display_name = excluded.display_name, avatar_url = excluded.avatar_url, updated_at = now();
end
$$;

create or replace function public.moim__room_member_deactivate(p_room uuid, p_user uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if p_room is null then return; end if;
  perform public.moim__writer_on();
  update public.community_messenger_participants
     set left_at = now(), role = case when role = 'owner' then 'member' else role end
   where room_id = p_room and user_id = p_user and left_at is null;
end
$$;

/** 역할만 바꾼다(방장 교체 시 old owner → member 를 먼저 호출해야 한다: one_active_owner 고유 인덱스) */
create or replace function public.moim__room_member_role(p_room uuid, p_user uuid, p_role text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if p_room is null then return; end if;
  perform public.moim__writer_on();
  update public.community_messenger_participants
     set role = public.moim__cm_role(p_role)
   where room_id = p_room and user_id = p_user and left_at is null;
  if public.moim__cm_role(p_role) = 'owner' then
    update public.community_messenger_rooms set owner_user_id = p_user, updated_at = now() where id = p_room;
  end if;
end
$$;

/** 모임의 모든 방(전체 방 + 일정 방) id */
create or replace function public.moim__rooms_of(p_moim uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.community_messenger_rooms where owner_domain = 'moim' and owner_ref_id = p_moim
  union
  select s.room_id from public.moim_schedules s where s.moim_id = p_moim and s.room_id is not null;
$$;

create or replace function public.moim__refresh_count(p_moim uuid) returns void
language sql volatile security definer set search_path = public as $$
  update public.moims m
     set member_count = (select count(*) from public.moim_members x where x.moim_id = m.id and x.status = 'active')
   where m.id = p_moim;
$$;

/** 활성 멤버를 만든다(가입·승인·초대 수락 공통). 정원·차단·연령은 호출 전에 검사. */
create or replace function public.moim__activate_member(p_moim uuid, p_user uuid, p_nickname text, p_avatar text, p_bio text, p_invited_by uuid, p_decided_by uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_prev text;
  v_room uuid;
begin
  select status into v_prev from public.moim_members where moim_id = p_moim and user_id = p_user;
  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio, joined_at, invited_by, decided_by, decided_at)
  values (p_moim, p_user, 'member', 'active', p_nickname, p_avatar, coalesce(p_bio, ''), now(), p_invited_by, p_decided_by, case when p_decided_by is null then null else now() end)
  on conflict (moim_id, user_id) do update
    set role = 'member', status = 'active', nickname = excluded.nickname, avatar_url = excluded.avatar_url, bio = excluded.bio,
        joined_at = now(), left_at = null, invited_by = excluded.invited_by, decided_by = excluded.decided_by,
        decided_at = excluded.decided_at,
        rejoin_count = public.moim_members.rejoin_count + case when v_prev in ('left', 'kicked') then 1 else 0 end,
        updated_at = now();
  select main_room_id into v_room from public.moims where id = p_moim;
  perform public.moim__room_member_activate(v_room, p_user, 'member', p_nickname, p_avatar);
  perform public.moim__refresh_count(p_moim);
  update public.moims set last_activity_at = now() where id = p_moim;
end
$$;

/** 모임의 모든 방에서 내보낸다 + 다가오는 일정 참여 취소 */
create or replace function public.moim__deactivate_member(p_moim uuid, p_user uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_room uuid;
begin
  for v_room in select public.moim__rooms_of(p_moim) loop
    perform public.moim__room_member_deactivate(v_room, p_user);
  end loop;
  update public.moim_schedule_participants sp
     set status = 'cancelled', updated_at = now()
    from public.moim_schedules s
   where sp.schedule_id = s.id and s.moim_id = p_moim and sp.user_id = p_user
     and sp.status in ('requested', 'confirmed') and s.status in ('recruiting', 'full', 'closed') and s.starts_at > now();
  perform public.moim__refresh_count(p_moim);
end
$$;

-- -----------------------------------------------------------------------------
-- 4. 권한 판정 (TS 계약 lib/moim/moim-permission-contract.ts 와 같은 표)
-- -----------------------------------------------------------------------------
/** 기본 최소 역할 · 조정 가능 여부 · 조정 하한 */
create or replace function public.moim_permission_defaults()
returns table (action text, default_min_role text, adjustable boolean, floor_role text)
language sql immutable set search_path = public as $$
  values
    ('edit_info',          'host',    false, 'host'),
    ('decide_join',        'staff',   true,  'staff'),
    ('manage_invite_link', 'staff',   true,  'staff'),
    ('send_invite',        'member',  true,  'member'),
    ('pin_notice',         'staff',   true,  'staff'),
    ('manage_boards',      'co_host', false, 'co_host'),
    ('hide_post',          'staff',   false, 'staff'),
    ('create_schedule',    'member',  true,  'member'),
    ('remove_member',      'co_host', true,  'staff'),
    ('ban_member',         'co_host', true,  'staff'),
    ('write_note',         'co_host', true,  'staff'),
    ('set_role',           'host',    false, 'host'),
    ('transfer_host',      'host',    false, 'host'),
    ('close',              'host',    false, 'host');
$$;

create or replace function public.moim_actor_role(p_moim uuid, p_actor uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.moim_members where moim_id = p_moim and user_id = p_actor and status = 'active';
$$;

create or replace function public.moim_actor_can(p_moim uuid, p_actor uuid, p_action text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text;
  v_min text;
  v_def record;
  v_m record;
begin
  select status, platform_state into v_m from public.moims where id = p_moim;
  if not found or v_m.status <> 'active' then
    return false;
  end if;
  if v_m.platform_state = 'blocked' and p_action <> 'close' then
    return false;
  end if;
  if v_m.platform_state = 'warned' and p_action = 'transfer_host' then
    return false;
  end if;
  v_role := public.moim_actor_role(p_moim, p_actor);
  if v_role is null then
    return false;
  end if;
  select * into v_def from public.moim_permission_defaults() d where d.action = p_action;
  if not found then
    return false;
  end if;
  v_min := v_def.default_min_role;
  if v_def.adjustable then
    select coalesce(p.min_role, v_min) into v_min from public.moim_permissions p where p.moim_id = p_moim and p.action = p_action;
    v_min := coalesce(v_min, v_def.default_min_role);
  end if;
  return public.moim__role_rank(v_role) >= public.moim__role_rank(v_min);
end
$$;

-- -----------------------------------------------------------------------------
-- 5. 공개 RPC (service_role 전용) — 반환 jsonb, 실패는 예외 메시지 'moim_*'
-- -----------------------------------------------------------------------------

/** P1 개설 */
create or replace function public.moim_create(p_actor uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_pol public.moim_policies;
  v_prof record;
  v_lgu text;
  v_cat record;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_intro text := btrim(coalesce(p->>'intro', ''));
  v_join text := coalesce(p->>'join_mode', 'instant');
  v_cap int := nullif(p->>'capacity', '')::int;
  v_nick text;
  v_id uuid := gen_random_uuid();
  v_room uuid;
  v_q jsonb;
  v_i int := 0;
  v_word text;
begin
  select * into v_pol from public.moim_policies where id = 1;
  select id, nickname, avatar_url, phone_verified, deleted_at into v_prof from public.profiles where id = p_actor;
  if not found or v_prof.deleted_at is not null then perform public.moim__fail('moim_actor_invalid'); end if;
  if coalesce(v_prof.phone_verified, false) is not true then perform public.moim__fail('moim_phone_verification_required'); end if;

  select a.canonical_lgu_id into v_lgu from public.user_addresses a
   where a.user_id = p_actor and a.is_default_master = true and coalesce(a.is_active, true) = true
   order by a.canonical_lgu_id is null limit 1;
  if v_lgu is null or btrim(v_lgu) = '' then perform public.moim__fail('moim_address_required'); end if;

  select id, is_active, is_restricted into v_cat from public.moim_categories where id = nullif(p->>'category_id', '')::uuid;
  if not found or not v_cat.is_active or v_cat.is_restricted then perform public.moim__fail('moim_category_invalid'); end if;

  if v_join not in ('instant', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
  if char_length(v_name) < coalesce(v_pol.name_min_len, 1) or char_length(v_name) > coalesce(v_pol.name_max_len, 60) then
    perform public.moim__fail('moim_name_length');
  end if;
  if v_pol.intro_min_len is not null and char_length(v_intro) < v_pol.intro_min_len then perform public.moim__fail('moim_intro_length'); end if;
  if char_length(v_intro) > coalesce(v_pol.intro_max_len, 2000) then perform public.moim__fail('moim_intro_length'); end if;
  if v_cap is not null and (v_cap < 2 or (v_pol.max_capacity is not null and v_cap > v_pol.max_capacity)) then
    perform public.moim__fail('moim_capacity_invalid');
  end if;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and (position(lower(v_word) in lower(v_name)) > 0 or position(lower(v_word) in lower(v_intro)) > 0) then
      perform public.moim__fail('moim_banned_word');
    end if;
  end loop;
  if v_pol.max_moims_per_user is not null and
     (select count(*) from public.moims where created_by = p_actor and status = 'active') >= v_pol.max_moims_per_user then
    perform public.moim__fail('moim_create_limit');
  end if;
  if exists (select 1 from public.moims where created_by = p_actor and status = 'active' and lgu_id = v_lgu and lower(name) = lower(v_name)) then
    perform public.moim__fail('moim_duplicate');
  end if;

  v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
  if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;

  insert into public.moims (id, name, intro, cover_image_url, category_id, lgu_id, join_mode, capacity,
                            age_min_birth_year, age_max_birth_year, host_user_id, created_by)
  values (v_id, v_name, v_intro, nullif(p->>'cover_image_url', ''), v_cat.id, v_lgu, v_join, v_cap,
          nullif(p->>'age_min_birth_year', '')::int, nullif(p->>'age_max_birth_year', '')::int, p_actor, p_actor);

  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio, joined_at)
  values (v_id, p_actor, 'host', 'active', v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), coalesce(p->>'bio', ''), now());

  insert into public.moim_boards (moim_id, kind, write_min_role, sort_order) values
    (v_id, 'notice', 'staff', 1), (v_id, 'free', 'member', 2), (v_id, 'greeting', 'member', 3), (v_id, 'review', 'member', 4);

  if jsonb_typeof(p->'questions') = 'array' then
    for v_q in select * from jsonb_array_elements(p->'questions') loop
      if btrim(coalesce(v_q #>> '{}', '')) <> '' then
        v_i := v_i + 1;
        if v_i > 3 then perform public.moim__fail('moim_questions_too_many'); end if;
        insert into public.moim_join_questions (moim_id, sort_order, question) values (v_id, v_i, left(btrim(v_q #>> '{}'), 200));
      end if;
    end loop;
  end if;

  v_room := public.moim__room_create('moim', v_id, p_actor, v_name, v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url));
  update public.moims set main_room_id = v_room, member_count = 1 where id = v_id;
  perform public.moim__log(v_id, p_actor, 'user', 'created', null, jsonb_build_object('join_mode', v_join));
  return jsonb_build_object('ok', true, 'moim_id', v_id, 'room_id', v_room);
end
$$;

/** 가입 가능 검사 (정원·차단·연령·상태). 실패 시 예외 */
create or replace function public.moim__assert_joinable(p_moim uuid, p_user uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_m record;
  v_prof record;
  v_birth_year int;
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found or v_m.status <> 'active' then perform public.moim__fail('moim_not_found'); end if;
  if v_m.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_user and released_at is null) then
    perform public.moim__fail('moim_join_not_allowed');
  end if;
  select phone_verified, date_of_birth, deleted_at into v_prof from public.profiles where id = p_user;
  if not found or v_prof.deleted_at is not null then perform public.moim__fail('moim_actor_invalid'); end if;
  if coalesce(v_prof.phone_verified, false) is not true then perform public.moim__fail('moim_phone_verification_required'); end if;
  if v_m.age_min_birth_year is not null or v_m.age_max_birth_year is not null then
    if v_prof.date_of_birth is null then perform public.moim__fail('moim_birth_date_required'); end if;
    v_birth_year := extract(year from v_prof.date_of_birth)::int;
    if (v_m.age_min_birth_year is not null and v_birth_year < v_m.age_min_birth_year)
       or (v_m.age_max_birth_year is not null and v_birth_year > v_m.age_max_birth_year) then
      perform public.moim__fail('moim_age_not_allowed');
    end if;
  end if;
  if v_m.capacity is not null and v_m.member_count >= v_m.capacity then perform public.moim__fail('moim_full'); end if;
end
$$;

/** P3 가입 (바로 가입 / 승인 신청) */
create or replace function public.moim_join(p_actor uuid, p_moim uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_m record;
  v_cur text;
  v_prof record;
  v_nick text;
  v_req uuid;
begin
  perform public.moim__assert_joinable(p_moim, p_actor);
  select * into v_m from public.moims where id = p_moim;
  select status into v_cur from public.moim_members where moim_id = p_moim and user_id = p_actor;
  if v_cur = 'active' then perform public.moim__fail('moim_already_member'); end if;
  if v_cur = 'pending' then perform public.moim__fail('moim_already_pending'); end if;
  select nickname, avatar_url into v_prof from public.profiles where id = p_actor;
  v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
  if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;

  if v_m.join_mode = 'instant' then
    perform public.moim__activate_member(p_moim, p_actor, v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), p->>'bio', null, null);
    perform public.moim__log(p_moim, p_actor, 'user', 'member_joined', p_actor, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'status', 'active', 'room_id', v_m.main_room_id);
  end if;

  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio)
  values (p_moim, p_actor, 'member', 'pending', v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), coalesce(p->>'bio', ''))
  on conflict (moim_id, user_id) do update
    set status = 'pending', role = 'member', nickname = excluded.nickname, avatar_url = excluded.avatar_url, bio = excluded.bio, updated_at = now();
  insert into public.moim_join_requests (moim_id, user_id, answers)
  values (p_moim, p_actor, case when jsonb_typeof(p->'answers') = 'array' then p->'answers' else '[]'::jsonb end)
  returning id into v_req;
  perform public.moim__log(p_moim, p_actor, 'user', 'join_requested', v_req, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'status', 'pending', 'request_id', v_req);
end
$$;

create or replace function public.moim_join_cancel(p_actor uuid, p_moim uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_req uuid;
begin
  update public.moim_join_requests set status = 'cancelled', decided_at = now()
   where moim_id = p_moim and user_id = p_actor and status = 'pending' returning id into v_req;
  if v_req is null then perform public.moim__fail('moim_request_not_found'); end if;
  update public.moim_members set status = 'left', left_at = now(), updated_at = now()
   where moim_id = p_moim and user_id = p_actor and status = 'pending';
  perform public.moim__log(p_moim, p_actor, 'user', 'join_cancelled', v_req, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$$;

/** P3 승인·거절 */
create or replace function public.moim_join_decide(p_actor uuid, p_request uuid, p_approve boolean, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_r record;
  v_mem record;
begin
  select * into v_r from public.moim_join_requests where id = p_request for update;
  if not found or v_r.status <> 'pending' then perform public.moim__fail('moim_request_not_found'); end if;
  if not public.moim_actor_can(v_r.moim_id, p_actor, 'decide_join') then perform public.moim__fail('moim_forbidden'); end if;
  if p_approve then
    perform public.moim__assert_joinable(v_r.moim_id, v_r.user_id);
    select nickname, avatar_url, bio into v_mem from public.moim_members where moim_id = v_r.moim_id and user_id = v_r.user_id;
    perform public.moim__activate_member(v_r.moim_id, v_r.user_id, v_mem.nickname, v_mem.avatar_url, v_mem.bio, null, p_actor);
    update public.moim_join_requests set status = 'approved', decided_by = p_actor, decided_at = now() where id = p_request;
    perform public.moim__log(v_r.moim_id, p_actor, 'user', 'join_approved', v_r.user_id, '{}'::jsonb);
  else
    update public.moim_join_requests set status = 'rejected', reason = left(p_reason, 500), decided_by = p_actor, decided_at = now() where id = p_request;
    update public.moim_members set status = 'rejected', decided_by = p_actor, decided_at = now(), updated_at = now()
     where moim_id = v_r.moim_id and user_id = v_r.user_id and status = 'pending';
    perform public.moim__log(v_r.moim_id, p_actor, 'user', 'join_rejected', v_r.user_id, jsonb_build_object('reason', left(p_reason, 500)));
  end if;
  return jsonb_build_object('ok', true, 'moim_id', v_r.moim_id, 'user_id', v_r.user_id, 'approved', p_approve);
end
$$;

/** P5 탈퇴 — 모임장은 위임 전 불가 */
create or replace function public.moim_leave(p_actor uuid, p_moim uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_role text;
begin
  v_role := public.moim_actor_role(p_moim, p_actor);
  if v_role is null then perform public.moim__fail('moim_not_member'); end if;
  if v_role = 'host' then perform public.moim__fail('moim_host_must_transfer'); end if;
  update public.moim_members set status = 'left', role = 'member', left_at = now(), updated_at = now()
   where moim_id = p_moim and user_id = p_actor;
  perform public.moim__deactivate_member(p_moim, p_actor);
  perform public.moim__log(p_moim, p_actor, 'user', 'member_left', p_actor, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$$;

/** P6 내보내기 · 차단 — 자기 자신·같거나 높은 역할은 불가. 차단은 탈퇴한 사람·가입 전 사람에게도 가능 */
create or replace function public.moim_member_remove(p_actor uuid, p_moim uuid, p_target uuid, p_ban boolean, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor_role text := public.moim_actor_role(p_moim, p_actor);
  v_target record;
  v_found boolean;
begin
  if p_actor = p_target then perform public.moim__fail('moim_cannot_target_self'); end if;
  if not public.moim_actor_can(p_moim, p_actor, case when p_ban then 'ban_member' else 'remove_member' end) then
    perform public.moim__fail('moim_forbidden');
  end if;
  select role, status into v_target from public.moim_members where moim_id = p_moim and user_id = p_target for update;
  v_found := found;
  if not p_ban and (not v_found or v_target.status not in ('active', 'pending')) then
    perform public.moim__fail('moim_target_not_member');
  end if;
  if v_found and v_target.status = 'active' and public.moim__role_rank(v_target.role) >= public.moim__role_rank(v_actor_role) then
    perform public.moim__fail('moim_forbidden');
  end if;
  if v_found and (v_target.status in ('active', 'pending') or p_ban) then
    update public.moim_members
       set status = case when p_ban then 'banned' else 'kicked' end, role = 'member',
           left_at = case when v_target.status = 'active' then now() else left_at end,
           decided_by = p_actor, decided_at = now(), updated_at = now()
     where moim_id = p_moim and user_id = p_target;
    update public.moim_join_requests set status = 'rejected', decided_by = p_actor, decided_at = now()
     where moim_id = p_moim and user_id = p_target and status = 'pending';
    if v_target.status = 'active' then
      perform public.moim__deactivate_member(p_moim, p_target);
    end if;
  end if;
  if p_ban then
    if not exists (select 1 from public.profiles where id = p_target) then perform public.moim__fail('moim_target_not_member'); end if;
    insert into public.moim_bans (moim_id, user_id, banned_by, reason)
    select p_moim, p_target, p_actor, left(p_reason, 500)
     where not exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_target and released_at is null);
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', case when p_ban then 'member_banned' else 'member_removed' end, p_target,
                           jsonb_build_object('reason', left(p_reason, 500)));
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.moim_member_unban(p_actor uuid, p_moim uuid, p_target uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'ban_member') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_bans set released_at = now(), released_by = p_actor
   where moim_id = p_moim and user_id = p_target and released_at is null returning id into v_id;
  if v_id is null then perform public.moim__fail('moim_ban_not_found'); end if;
  perform public.moim__log(p_moim, p_actor, 'user', 'member_unbanned', p_target, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$$;

/** P7 역할 지정 (부모임장·운영진·멤버) */
create or replace function public.moim_member_role_set(p_actor uuid, p_moim uuid, p_target uuid, p_role text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_pol public.moim_policies;
  v_cur text;
  v_room uuid;
begin
  if p_role not in ('co_host', 'staff', 'member') then perform public.moim__fail('moim_role_invalid'); end if;
  if not public.moim_actor_can(p_moim, p_actor, 'set_role') then perform public.moim__fail('moim_forbidden'); end if;
  if p_actor = p_target then perform public.moim__fail('moim_cannot_target_self'); end if;
  select role into v_cur from public.moim_members where moim_id = p_moim and user_id = p_target and status = 'active' for update;
  if v_cur is null then perform public.moim__fail('moim_target_not_member'); end if;
  if v_cur = 'host' then perform public.moim__fail('moim_forbidden'); end if;
  select * into v_pol from public.moim_policies where id = 1;
  if p_role = 'co_host' and v_pol.max_co_hosts is not null and v_cur <> 'co_host' and
     (select count(*) from public.moim_members where moim_id = p_moim and status = 'active' and role = 'co_host') >= v_pol.max_co_hosts then
    perform public.moim__fail('moim_role_limit');
  end if;
  if p_role = 'staff' and v_pol.max_staff is not null and v_cur <> 'staff' and
     (select count(*) from public.moim_members where moim_id = p_moim and status = 'active' and role = 'staff') >= v_pol.max_staff then
    perform public.moim__fail('moim_role_limit');
  end if;
  update public.moim_members set role = p_role, role_changed_at = now(), updated_at = now() where moim_id = p_moim and user_id = p_target;
  for v_room in select public.moim__rooms_of(p_moim) loop
    perform public.moim__room_member_role(v_room, p_target, p_role);
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'role_changed', p_target, jsonb_build_object('from', v_cur, 'to', p_role));
  return jsonb_build_object('ok', true);
end
$$;

/** 모임장 교체 공통 (요청 수락·어드민 지정·탈퇴 자동 위임) */
create or replace function public.moim__host_swap(p_moim uuid, p_from uuid, p_to uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_room uuid;
begin
  if not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_to and status = 'active') then
    perform public.moim__fail('moim_target_not_member');
  end if;
  update public.moim_members set role = 'co_host', role_changed_at = now(), updated_at = now()
   where moim_id = p_moim and user_id = p_from and status = 'active' and role = 'host';
  update public.moim_members set role = 'host', role_changed_at = now(), updated_at = now()
   where moim_id = p_moim and user_id = p_to;
  update public.moims set host_user_id = p_to, updated_at = now() where id = p_moim;
  for v_room in select public.moim__rooms_of(p_moim) loop
    perform public.moim__room_member_role(v_room, p_from, 'co_host');
    perform public.moim__room_member_role(v_room, p_to, 'host');
  end loop;
end
$$;

/** P8 위임 요청 (상대 수락 필요) */
create or replace function public.moim_host_transfer_request(p_actor uuid, p_moim uuid, p_to uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'transfer_host') then perform public.moim__fail('moim_forbidden'); end if;
  if p_actor = p_to then perform public.moim__fail('moim_cannot_target_self'); end if;
  if not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_to and status = 'active') then
    perform public.moim__fail('moim_target_not_member');
  end if;
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, actor_id)
  values (p_moim, p_actor, p_to, 'direct', 'requested', p_actor) returning id into v_id;
  perform public.moim__log(p_moim, p_actor, 'user', 'host_transfer_requested', p_to, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'transfer_id', v_id);
end
$$;

create or replace function public.moim_host_transfer_respond(p_actor uuid, p_transfer uuid, p_accept boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_t record;
begin
  select * into v_t from public.moim_host_transfers where id = p_transfer for update;
  if not found or v_t.status <> 'requested' or v_t.to_user_id <> p_actor then perform public.moim__fail('moim_transfer_not_found'); end if;
  if not p_accept then
    update public.moim_host_transfers set status = 'declined', decided_at = now() where id = p_transfer;
    perform public.moim__log(v_t.moim_id, p_actor, 'user', 'host_transfer_declined', v_t.from_user_id, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'accepted', false);
  end if;
  if public.moim_actor_role(v_t.moim_id, v_t.from_user_id) is distinct from 'host' then perform public.moim__fail('moim_transfer_stale'); end if;
  if (select platform_state from public.moims where id = v_t.moim_id) in ('warned', 'blocked') then perform public.moim__fail('moim_transfer_blocked_by_warning'); end if;
  perform public.moim__host_swap(v_t.moim_id, v_t.from_user_id, p_actor);
  update public.moim_host_transfers set status = 'done', decided_at = now() where id = p_transfer;
  perform public.moim__log(v_t.moim_id, p_actor, 'user', 'host_changed', p_actor, jsonb_build_object('from', v_t.from_user_id, 'kind', 'direct'));
  return jsonb_build_object('ok', true, 'accepted', true, 'moim_id', v_t.moim_id);
end
$$;

/** P15 모임 종료 (모임장) — 모든 방 읽기 전용, 진행 중 일정 취소 */
create or replace function public.moim_close(p_actor uuid, p_moim uuid, p_confirm_name text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_m record;
  v_room uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'close') then perform public.moim__fail('moim_forbidden'); end if;
  select * into v_m from public.moims where id = p_moim for update;
  if btrim(coalesce(p_confirm_name, '')) <> v_m.name then perform public.moim__fail('moim_confirm_name_mismatch'); end if;
  update public.moims set status = 'closed', closed_at = now(), updated_at = now() where id = p_moim;
  update public.moim_schedules set status = 'cancelled', updated_at = now() where moim_id = p_moim and status in ('recruiting', 'full', 'closed');
  update public.moim_join_requests set status = 'expired', decided_at = now() where moim_id = p_moim and status = 'pending';
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  perform public.moim__writer_on();
  for v_room in select public.moim__rooms_of(p_moim) loop
    update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_room;
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'closed', null, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$$;

/** 모임 정보 수정 (모임장) — 낙관적 잠금 */
create or replace function public.moim_update_info(p_actor uuid, p_moim uuid, p jsonb, p_expected_updated_at timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_pol public.moim_policies;
  v_m record;
  v_name text;
  v_intro text;
  v_cap int;
  v_cat uuid;
  v_room uuid;
  v_q jsonb;
  v_i int := 0;
  v_word text;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'edit_info') then perform public.moim__fail('moim_forbidden'); end if;
  select * into v_m from public.moims where id = p_moim for update;
  if p_expected_updated_at is null or v_m.updated_at <> p_expected_updated_at then perform public.moim__fail('moim_conflict'); end if;
  select * into v_pol from public.moim_policies where id = 1;
  v_name := case when p ? 'name' then btrim(coalesce(p->>'name', '')) else v_m.name end;
  v_intro := case when p ? 'intro' then btrim(coalesce(p->>'intro', '')) else v_m.intro end;
  v_cap := case when p ? 'capacity' then nullif(p->>'capacity', '')::int else v_m.capacity end;
  v_cat := case when p ? 'category_id' then nullif(p->>'category_id', '')::uuid else v_m.category_id end;
  if char_length(v_name) < coalesce(v_pol.name_min_len, 1) or char_length(v_name) > coalesce(v_pol.name_max_len, 60) then perform public.moim__fail('moim_name_length'); end if;
  if char_length(v_intro) > coalesce(v_pol.intro_max_len, 2000) or (v_pol.intro_min_len is not null and char_length(v_intro) < v_pol.intro_min_len) then
    perform public.moim__fail('moim_intro_length');
  end if;
  if v_cap is not null and (v_cap < 2 or v_cap < v_m.member_count or (v_pol.max_capacity is not null and v_cap > v_pol.max_capacity)) then
    perform public.moim__fail('moim_capacity_invalid');
  end if;
  if not exists (select 1 from public.moim_categories where id = v_cat and is_active and not is_restricted) then perform public.moim__fail('moim_category_invalid'); end if;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and (position(lower(v_word) in lower(v_name)) > 0 or position(lower(v_word) in lower(v_intro)) > 0) then
      perform public.moim__fail('moim_banned_word');
    end if;
  end loop;
  update public.moims set
    name = v_name, intro = v_intro, capacity = v_cap, category_id = v_cat,
    cover_image_url = case when p ? 'cover_image_url' then nullif(p->>'cover_image_url', '') else cover_image_url end,
    join_mode = case when p->>'join_mode' in ('instant', 'approval') then p->>'join_mode' else join_mode end,
    age_min_birth_year = case when p ? 'age_min_birth_year' then nullif(p->>'age_min_birth_year', '')::int else age_min_birth_year end,
    age_max_birth_year = case when p ? 'age_max_birth_year' then nullif(p->>'age_max_birth_year', '')::int else age_max_birth_year end,
    updated_at = now()
  where id = p_moim;
  if jsonb_typeof(p->'questions') = 'array' then
    delete from public.moim_join_questions where moim_id = p_moim;
    for v_q in select * from jsonb_array_elements(p->'questions') loop
      if btrim(coalesce(v_q #>> '{}', '')) <> '' then
        v_i := v_i + 1;
        if v_i > 3 then perform public.moim__fail('moim_questions_too_many'); end if;
        insert into public.moim_join_questions (moim_id, sort_order, question) values (p_moim, v_i, left(btrim(v_q #>> '{}'), 200));
      end if;
    end loop;
  end if;
  if v_name <> v_m.name or (p ? 'cover_image_url') then
    perform public.moim__writer_on();
    select main_room_id into v_room from public.moims where id = p_moim;
    if v_room is not null then
      update public.community_messenger_rooms
         set title = left(v_name, 120),
             avatar_url = (select cover_image_url from public.moims where id = p_moim),
             updated_at = now()
       where id = v_room;
    end if;
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', 'info_updated', null, p);
  return jsonb_build_object('ok', true, 'updated_at', (select updated_at from public.moims where id = p_moim));
end
$$;

/** 멤버 권한 관리 (모임장) — {action: min_role} */
create or replace function public.moim_permissions_set(p_actor uuid, p_moim uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_key text;
  v_val text;
  v_def record;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'edit_info') then perform public.moim__fail('moim_forbidden'); end if;
  for v_key, v_val in select key, value #>> '{}' from jsonb_each(coalesce(p, '{}'::jsonb)) loop
    select * into v_def from public.moim_permission_defaults() d where d.action = v_key;
    if not found or not v_def.adjustable then perform public.moim__fail('moim_permission_not_adjustable'); end if;
    if v_val not in ('host', 'co_host', 'staff', 'member') or public.moim__role_rank(v_val) < public.moim__role_rank(v_def.floor_role) then
      perform public.moim__fail('moim_permission_value_invalid');
    end if;
    insert into public.moim_permissions (moim_id, action, min_role, updated_by) values (p_moim, v_key, v_val, p_actor)
    on conflict (moim_id, action) do update set min_role = excluded.min_role, updated_at = now(), updated_by = p_actor;
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'permissions_updated', null, p);
  return jsonb_build_object('ok', true);
end
$$;

/** 내 모임 프로필 수정 — 모임 방 표시 이름도 함께 */
create or replace function public.moim_profile_update(p_actor uuid, p_moim uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_mem record;
  v_nick text;
  v_room uuid;
begin
  select * into v_mem from public.moim_members where moim_id = p_moim and user_id = p_actor and status = 'active' for update;
  if not found then perform public.moim__fail('moim_not_member'); end if;
  v_nick := case when p ? 'nickname' then btrim(coalesce(p->>'nickname', '')) else v_mem.nickname end;
  if v_nick = '' or char_length(v_nick) > 40 then perform public.moim__fail('moim_nickname_invalid'); end if;
  insert into public.moim_member_profile_history (moim_id, user_id, nickname, avatar_url, bio)
  values (p_moim, p_actor, v_mem.nickname, v_mem.avatar_url, v_mem.bio);
  update public.moim_members set
    nickname = v_nick,
    avatar_url = case when p ? 'avatar_url' then nullif(p->>'avatar_url', '') else avatar_url end,
    bio = case when p ? 'bio' then left(coalesce(p->>'bio', ''), 300) else bio end,
    updated_at = now()
  where moim_id = p_moim and user_id = p_actor;
  perform public.moim__writer_on();
  for v_room in select public.moim__rooms_of(p_moim) loop
    update public.community_messenger_room_profiles
       set display_name = left(v_nick, 40),
           avatar_url = (select avatar_url from public.moim_members where moim_id = p_moim and user_id = p_actor),
           updated_at = now()
     where room_id = v_room and user_id = p_actor;
  end loop;
  return jsonb_build_object('ok', true);
end
$$;

/** P4 초대 링크 */
create or replace function public.moim_invite_link_create(p_actor uuid, p_moim uuid, p_expires_at timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'manage_invite_link') then perform public.moim__fail('moim_forbidden'); end if;
  if p_expires_at is not null and p_expires_at <= now() then perform public.moim__fail('moim_invite_expiry_invalid'); end if;
  insert into public.moim_invites (moim_id, token, created_by, expires_at) values (p_moim, v_token, p_actor, p_expires_at) returning id into v_id;
  perform public.moim__log(p_moim, p_actor, 'user', 'invite_link_created', v_id, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'invite_id', v_id, 'token', v_token);
end
$$;

create or replace function public.moim_invite_link_revoke(p_actor uuid, p_invite uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_moim uuid;
begin
  select moim_id into v_moim from public.moim_invites where id = p_invite and revoked_at is null;
  if v_moim is null then perform public.moim__fail('moim_invite_not_found'); end if;
  if not public.moim_actor_can(v_moim, p_actor, 'manage_invite_link') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_invites set revoked_at = now() where id = p_invite;
  perform public.moim__log(v_moim, p_actor, 'user', 'invite_link_revoked', p_invite, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$$;

/** 링크 토큰 → 모임 id (만료·회수 검사). 가입은 moim_join 그대로(승인 생략 없음) */
create or replace function public.moim_invite_link_resolve(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_i record;
begin
  select i.*, m.status m_status, m.platform_state into v_i
    from public.moim_invites i join public.moims m on m.id = i.moim_id where i.token = p_token;
  if not found or v_i.revoked_at is not null or (v_i.expires_at is not null and v_i.expires_at <= now())
     or v_i.m_status <> 'active' or v_i.platform_state = 'blocked' then
    return jsonb_build_object('ok', false, 'error', 'moim_invite_not_found');
  end if;
  update public.moim_invites set usage_count = usage_count + 1 where id = v_i.id;
  return jsonb_build_object('ok', true, 'moim_id', v_i.moim_id, 'inviter_id', v_i.created_by);
end
$$;

/** P4 친구 직접 초대 */
create or replace function public.moim_invite_send(p_actor uuid, p_moim uuid, p_invitee uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_pol public.moim_policies;
  v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'send_invite') then perform public.moim__fail('moim_forbidden'); end if;
  if p_actor = p_invitee then perform public.moim__fail('moim_cannot_target_self'); end if;
  if exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_invitee and status in ('active', 'pending')) then
    perform public.moim__fail('moim_already_member');
  end if;
  if exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_invitee and released_at is null) then
    perform public.moim__fail('moim_join_not_allowed');
  end if;
  select * into v_pol from public.moim_policies where id = 1;
  if v_pol.invite_resend_days is not null and exists (
       select 1 from public.moim_invite_targets
        where moim_id = p_moim and invitee_user_id = p_invitee
          and created_at > now() - make_interval(days => v_pol.invite_resend_days)) then
    perform public.moim__fail('moim_invite_too_soon');
  end if;
  insert into public.moim_invite_targets (moim_id, inviter_id, invitee_user_id) values (p_moim, p_actor, p_invitee) returning id into v_id;
  perform public.moim__log(p_moim, p_actor, 'user', 'invite_sent', p_invitee, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'invite_target_id', v_id);
end
$$;

/** 초대 수락·거절 — 운영진(staff 이상)이 보낸 초대는 승인 생략, 멤버가 보낸 초대는 가입 방식 그대로 */
create or replace function public.moim_invite_respond(p_actor uuid, p_invite_target uuid, p_accept boolean, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_t record;
  v_inviter_role text;
  v_prof record;
  v_nick text;
  v_res jsonb;
begin
  select * into v_t from public.moim_invite_targets where id = p_invite_target for update;
  if not found or v_t.invitee_user_id <> p_actor or v_t.status <> 'sent' then perform public.moim__fail('moim_invite_not_found'); end if;
  if not p_accept then
    update public.moim_invite_targets set status = 'declined', responded_at = now() where id = p_invite_target;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
  v_inviter_role := public.moim_actor_role(v_t.moim_id, v_t.inviter_id);
  update public.moim_invite_targets set status = 'accepted', responded_at = now() where id = p_invite_target;
  if v_inviter_role is not null and public.moim__role_rank(v_inviter_role) >= public.moim__role_rank('staff') then
    perform public.moim__assert_joinable(v_t.moim_id, p_actor);
    if exists (select 1 from public.moim_members where moim_id = v_t.moim_id and user_id = p_actor and status = 'active') then
      perform public.moim__fail('moim_already_member');
    end if;
    select nickname, avatar_url into v_prof from public.profiles where id = p_actor;
    v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
    if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;
    update public.moim_join_requests set status = 'approved', decided_by = v_t.inviter_id, decided_at = now()
     where moim_id = v_t.moim_id and user_id = p_actor and status = 'pending';
    perform public.moim__activate_member(v_t.moim_id, p_actor, v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), p->>'bio', v_t.inviter_id, v_t.inviter_id);
    perform public.moim__log(v_t.moim_id, p_actor, 'user', 'member_joined', p_actor, jsonb_build_object('via', 'staff_invite'));
    return jsonb_build_object('ok', true, 'status', 'active', 'moim_id', v_t.moim_id);
  end if;
  v_res := public.moim_join(p_actor, v_t.moim_id, p);
  update public.moim_members set invited_by = v_t.inviter_id where moim_id = v_t.moim_id and user_id = p_actor;
  return v_res || jsonb_build_object('moim_id', v_t.moim_id);
end
$$;

-- -----------------------------------------------------------------------------
-- 6. 실행 권한: service_role 만
-- -----------------------------------------------------------------------------
do $grant$
declare f record;
begin
  for f in
    select p.oid::regprocedure sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'moim\_%' or p.proname like 'moim\_\_%' or p.proname like 'cm\_moim\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end
$grant$;

commit;
