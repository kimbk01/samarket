-- 관심이웃(neighbor_follow) 불변식·상한을 DB 로 — 설계 docs/audit/interest-neighbor-full-fix-design-2026-11-28.md §4 (DB-1)
--
-- 불변식: neighbor_follow 행은 탈퇴(status='deleted'·deleted_at)·삭제된 회원이나 활성 차단 관계를 가리키지 않는다.
--   예전에는 앱 코드(차단 함수 사본·탈퇴 route·목록 필터)가 따로 지켰다 → 상한 경쟁(D4)·저장 수≠보이는 수(D9)·삭제 규칙 두 벌(R1).
--
-- 운영 사실(2026-11-28 16:10 PHT 조회): user_relationships 는 RLS 켜짐·정책 0개 → 회원(anon/authenticated) 직접 읽기·쓰기 불가,
--   서버(service_role)만 쓴다. 저장소의 옛 정책(20260327100000 user_relationships_own)·type 동기화 트리거는 운영에 없다.
--   이 파일은 정책을 추가하지 않는다(직접 쓰기 경로를 열지 않음).
--
-- 롤백 순서(반드시 이 순서 — 앱 정리 코드를 먼저 되돌리지 않고 트리거만 지우면 차단·탈퇴 정리 경로가 0개가 된다):
--   1) 앱 PR(neighbor-full-fix-a) 되돌리기(Vercel Instant Rollback 또는 되돌림 PR)
--   2) drop trigger if exists trg_usr_blocked_clears_neighbor_follow on public.user_social_relations;
--      drop trigger if exists trg_profiles_withdraw_clears_neighbor_follow on public.profiles;
--      drop trigger if exists trg_profiles_delete_clears_neighbor_follow on public.profiles;
--      drop function if exists public.neighbor_follow_set_for(uuid, uuid, boolean, integer);
--      drop function if exists public.neighbor_follow_on_block();
--      drop function if exists public.neighbor_follow_on_profile_withdraw();
--      drop function if exists public.neighbor_follow_on_profile_delete();
--      drop function if exists public.neighbor_follow_pair_lock(uuid, uuid);
--      alter table public.user_relationships drop constraint if exists user_relationships_type_matches_relation_type;

begin;

-- ── 두 회원 쌍 잠금: 관심이웃 추가와 차단·탈퇴 정리가 같은 쌍에서 엇갈리지 않게(설계 §4-1 · 검토 M1) ──
create or replace function public.neighbor_follow_pair_lock(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('nf_pair:' || least(p_a, p_b)::text || ':' || greatest(p_a, p_b)::text, 0)
  );
end;
$$;

-- ── 추가·해제 (상태 지정) — 서버 전용. 존재·탈퇴·차단·상한·추가를 한 트랜잭션에서 ──
create or replace function public.neighbor_follow_set_for(
  p_user uuid,
  p_target uuid,
  p_follow boolean,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_exists boolean;
begin
  if p_user is null or p_target is null or p_user = p_target then
    return jsonb_build_object('ok', false, 'error', 'bad_target');
  end if;

  perform public.neighbor_follow_pair_lock(p_user, p_target);

  if not p_follow then
    delete from public.user_relationships
     where user_id = p_user and target_user_id = p_target and type = 'neighbor_follow';
    select count(*) into v_count from public.user_relationships
     where user_id = p_user and type = 'neighbor_follow';
    return jsonb_build_object('ok', true, 'following', false, 'count', v_count);
  end if;

  -- 같은 회원의 추가를 한 줄로 세워 상한을 넘지 않게(설계 §4-1 · D4)
  perform pg_advisory_xact_lock(hashtextextended('nf_user:' || p_user::text, 0));

  select exists(
    select 1 from public.user_relationships
     where user_id = p_user and target_user_id = p_target and type = 'neighbor_follow'
  ) into v_exists;
  if v_exists then
    select count(*) into v_count from public.user_relationships
     where user_id = p_user and type = 'neighbor_follow';
    return jsonb_build_object('ok', true, 'following', true, 'count', v_count);
  end if;

  -- 대상 프로필 행을 공유 잠금 — 이 트랜잭션이 끝날 때까지 탈퇴 UPDATE·삭제가 기다린다.
  -- 그래야 탈퇴 트리거가 이 추가 행을 보고 지운다(재감사 M3: 「탈퇴 아님」을 읽은 직후 탈퇴가 커밋되면 행이 남던 경합).
  perform 1 from public.profiles p
   where p.id = p_target
     and coalesce(p.status, '') <> 'deleted'
     and p.deleted_at is null
   for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'target_unavailable');
  end if;

  -- 활성 차단(양방향) — 앱 SOCIAL_BLOCK_ACTIVE_OR_LEGACY 와 같은 조건(is_active 가 false 가 아님)
  if exists (
    select 1 from public.user_social_relations s
     where s.relation_type = 'blocked'
       and s.is_active is distinct from false
       and ((s.owner_user_id = p_user and s.target_user_id = p_target)
         or (s.owner_user_id = p_target and s.target_user_id = p_user))
  ) then
    return jsonb_build_object('ok', false, 'error', 'blocked_target');
  end if;

  select count(*) into v_count from public.user_relationships
   where user_id = p_user and type = 'neighbor_follow';
  if v_count >= p_limit then
    return jsonb_build_object('ok', false, 'error', 'neighbor_follow_limit', 'limit', p_limit);
  end if;

  insert into public.user_relationships (user_id, target_user_id, type, relation_type)
  values (p_user, p_target, 'neighbor_follow', 'neighbor_follow')
  on conflict do nothing;  -- 유일 인덱스(운영: user_id·target_user_id·type)가 무엇이든 같은 순간 중복 추가는 그대로 성공

  return jsonb_build_object('ok', true, 'following', true, 'count', v_count + 1);
end;
$$;

-- ── 차단되면 두 방향 관심이웃 삭제 (차단 경로 4개가 모두 blockUserSocial → 이 표) ──
create or replace function public.neighbor_follow_on_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.neighbor_follow_pair_lock(new.owner_user_id, new.target_user_id);
  delete from public.user_relationships
   where type = 'neighbor_follow'
     and ((user_id = new.owner_user_id and target_user_id = new.target_user_id)
       or (user_id = new.target_user_id and target_user_id = new.owner_user_id));
  return null;
end;
$$;

drop trigger if exists trg_usr_blocked_clears_neighbor_follow on public.user_social_relations;
-- 다시 차단(is_active false→true)하는 UPDATE 도 잡고, updated_at·last_action_at 만 바뀐 UPDATE 는 제외(검토 L3).
-- 행마다 쌍 잠금을 잡는다 — 운영 차단 경로는 한 쌍 단건 upsert(`blockUserSocial`)라 문장 사이 잠금 순서 교착이 없다.
-- 여러 쌍을 한 문장으로 바꾸는 일괄 UPDATE 를 새로 만들 때는 쌍 순서를 정렬해 쓴다(재감사 M4).
create trigger trg_usr_blocked_clears_neighbor_follow
  after insert or update of relation_type, is_active on public.user_social_relations
  for each row
  when (new.relation_type = 'blocked' and new.is_active is distinct from false)
  execute function public.neighbor_follow_on_block();

-- ── 탈퇴(status='deleted' 또는 deleted_at 설정)되면 맺은·받은 관심이웃 삭제 ──
create or replace function public.neighbor_follow_on_profile_withdraw()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.user_relationships
   where type = 'neighbor_follow'
     and (user_id = new.id or target_user_id = new.id);
  return null;
end;
$$;

drop trigger if exists trg_profiles_withdraw_clears_neighbor_follow on public.profiles;
create trigger trg_profiles_withdraw_clears_neighbor_follow
  after update of status, deleted_at on public.profiles
  for each row
  when ((new.status = 'deleted' and old.status is distinct from 'deleted')
     or (new.deleted_at is not null and old.deleted_at is null))
  execute function public.neighbor_follow_on_profile_withdraw();

-- ── 영구 삭제(auth → profiles CASCADE)되면 맺은·받은 관심이웃 삭제 (user_relationships 에는 FK 없음) ──
create or replace function public.neighbor_follow_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.user_relationships
   where type = 'neighbor_follow'
     and (user_id = old.id or target_user_id = old.id);
  return null;
end;
$$;

drop trigger if exists trg_profiles_delete_clears_neighbor_follow on public.profiles;
create trigger trg_profiles_delete_clears_neighbor_follow
  after delete on public.profiles
  for each row
  execute function public.neighbor_follow_on_profile_delete();

-- ── type·relation_type 는 항상 같다 (운영 불일치 0건 — 2026-11-28 15:03 PHT) ──
alter table public.user_relationships drop constraint if exists user_relationships_type_matches_relation_type;
alter table public.user_relationships
  add constraint user_relationships_type_matches_relation_type check (type = relation_type);

-- ── 권한: 서버(service_role)만 ──
revoke all on function public.neighbor_follow_pair_lock(uuid, uuid) from public, anon, authenticated;
revoke all on function public.neighbor_follow_set_for(uuid, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.neighbor_follow_on_block() from public, anon, authenticated;
revoke all on function public.neighbor_follow_on_profile_withdraw() from public, anon, authenticated;
revoke all on function public.neighbor_follow_on_profile_delete() from public, anon, authenticated;
grant execute on function public.neighbor_follow_set_for(uuid, uuid, boolean, integer) to service_role;

commit;
