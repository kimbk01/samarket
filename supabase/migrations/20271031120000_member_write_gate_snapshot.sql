-- 회원 쓰기 검사(proxy PRODUCT_WRITE) 1회 조회 — 요청 증폭 근본 수정 2단계 2-A.
-- 설계: docs/audit/supabase-request-fanout-root-fix-design-2026-10-30.md 「2단계 상세 설계」 (Owner 승인 2026-10-30)
-- 이전: 회원 상태(profiles status·deleted_at) + 동의 행(profiles terms·privacy·role) + 활성 관리자 membership 을 각각 조회.
-- 판정은 호출자 TS 가 그대로 한다 (lifecycle 분류·동의 버전 비교·관리자 역할 판정) — 이 함수는 행만 한 번에 읽는다.
-- 캐시 없음: 매 쓰기 요청 DB 를 새로 읽는다 (P0-R3).

create or replace function public.member_write_gate_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when p.id is null then jsonb_build_object('found', false)
    else jsonb_build_object(
      'found', true,
      'status', p.status,
      'deleted_at', p.deleted_at,
      'terms_accepted_at', p.terms_accepted_at,
      'terms_version', p.terms_version,
      'privacy_accepted_at', p.privacy_accepted_at,
      'privacy_version', p.privacy_version,
      'role', p.role,
      -- admin_memberships_one_active_per_user_idx: 활성 행은 사용자당 최대 1개
      'admin_role', (
        select m.role from public.admin_memberships m
         where m.user_id = p_user_id and m.status = 'active'
         limit 1
      )
    )
  end
  from (select 1) as one
  left join public.profiles p on p.id = p_user_id;
$$;

revoke all on function public.member_write_gate_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.member_write_gate_snapshot(uuid) to service_role;
