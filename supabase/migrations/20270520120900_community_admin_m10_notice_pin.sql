-- 커뮤니티 Admin M10 (C-41, O-6): 피드 공지·상단 고정. 게시글 엔진에 필드만 추가한다 (새 테이블 없음).
-- 공지 = origin_kind 'admin' 글 + is_notice. 작성자 user_id 는 실제 작성한 관리자, 화면 이름은 display_author_name.
-- 고정 한도 (Owner 확정): 피드 전체 3개 · 카테고리별 2개. 만료는 조회 조건(pinned_until > now())으로 처리.
alter table public.community_posts
  add column if not exists is_notice boolean not null default false,
  add column if not exists notice_starts_at timestamptz,
  add column if not exists notice_ends_at timestamptz,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_until timestamptz,
  add column if not exists pinned_by uuid,
  add column if not exists pin_scope text,
  add column if not exists pin_rank integer not null default 0,
  add column if not exists pin_reason text;

alter table public.community_posts drop constraint if exists community_posts_pin_scope_check;
alter table public.community_posts add constraint community_posts_pin_scope_check
  check (pin_scope is null or pin_scope in ('feed', 'topic'));

create index if not exists idx_community_posts_pinned
  on public.community_posts (pin_scope, topic_id, pin_rank)
  where pinned_at is not null;

create or replace function public.admin_set_community_post_pin(
  p_post_id uuid,
  p_actor_id uuid,
  p_scope text,
  p_until timestamptz,
  p_rank integer,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_post record;
  v_count integer;
  v_limit integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(p_scope, '') not in ('feed', 'topic') then
    return jsonb_build_object('ok', false, 'error', 'invalid_scope');
  end if;
  if p_until is not null and p_until <= now() then
    return jsonb_build_object('ok', false, 'error', 'invalid_until');
  end if;

  -- 고정 한도 검사를 직렬화 (동시 고정 경합 방지)
  perform pg_advisory_xact_lock(hashtext('community_post_pin'));

  select id, status, topic_id, pinned_at into v_post
    from public.community_posts where id = p_post_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_post.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'not_active'); end if;
  if p_scope = 'topic' and v_post.topic_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_topic');
  end if;

  v_limit := case when p_scope = 'feed' then 3 else 2 end;
  select count(*) into v_count
    from public.community_posts
   where pinned_at is not null
     and id <> p_post_id
     and status = 'active'
     and pin_scope = p_scope
     and (pinned_until is null or pinned_until > now())
     and (p_scope = 'feed' or topic_id = v_post.topic_id);
  if v_count >= v_limit then
    return jsonb_build_object('ok', false, 'error', 'pin_limit', 'limit', v_limit);
  end if;

  update public.community_posts
     set pinned_at = now(), pinned_until = p_until, pinned_by = p_actor_id,
         pin_scope = p_scope, pin_rank = coalesce(p_rank, 0), pin_reason = left(coalesce(p_reason, ''), 500)
   where id = p_post_id;

  return jsonb_build_object('ok', true, 'limit', v_limit, 'count', v_count + 1);
end; $$;

-- 숨김·삭제되면 고정 자동 해제
create or replace function public.community_posts_clear_pin_on_inactive()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from 'active' and new.pinned_at is not null then
    new.pinned_at := null;
    new.pinned_until := null;
    new.pin_scope := null;
    new.pin_rank := 0;
  end if;
  return new;
end; $$;

drop trigger if exists trg_community_posts_clear_pin on public.community_posts;
create trigger trg_community_posts_clear_pin
  before update of status on public.community_posts
  for each row execute function public.community_posts_clear_pin_on_inactive();

revoke all on function public.admin_set_community_post_pin(uuid, uuid, text, timestamptz, integer, text) from public, anon, authenticated;
grant execute on function public.admin_set_community_post_pin(uuid, uuid, text, timestamptz, integer, text) to service_role;
