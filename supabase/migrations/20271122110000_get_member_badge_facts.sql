-- 2026-11-22 읽음 3단계 (Owner 「LOCK 재개봉·구현 승인」) — 배지 계산 입력 3번 → 함수 1번.
-- 설계: docs/audit/supabase-request-surge-2026-11-18/read-mark-stage3-badge-facts-design-2026-11-22.md
--
-- 계산기(`buildDomainBadgeAuthorityHttpPayload`)가 사람마다 따로 읽던 세 입력을 **같은 조건·같은 정렬·같은 상한**으로 한 번에 돌려준다:
--   inputs          = member_unread_room_inputs 그 사람 행 전부 (get_member_unread_room_inputs 와 같은 `select *`)
--   bell_rows       = 안 읽은 알림 행 (loadBellExplainUnreadEventRows 와 같은 열·조건·created_at desc·상한 1~2000)
--   owned_store_ids = stores.id where owner_user_id = 사람 limit 50 (listOwnedStoreIdsForBadge 와 같음)
-- 권한: SECURITY INVOKER · service_role 전용. 쓰기 없음(stable).

create or replace function public.get_member_badge_facts(
  p_user_id uuid,
  p_bell_limit integer default 2000
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'inputs', coalesce((
      select jsonb_agg(to_jsonb(i))
      from public.member_unread_room_inputs i
      where i.user_id = p_user_id
    ), '[]'::jsonb),
    'bell_rows', coalesce((
      select jsonb_agg(to_jsonb(r) - 'created_at' order by r.created_at desc)
      from (
        select e.id, e.type, e.category, e.display_payload, e.room_id, e.dedupe_key,
               e.unread, e.read_at, e.muted_snapshot, e.created_at
        from public.notification_events e
        where e.user_id = p_user_id and e.unread = true and e.read_at is null
        order by e.created_at desc
        limit greatest(1, least(2000, coalesce(p_bell_limit, 2000)))
      ) r
    ), '[]'::jsonb),
    'owned_store_ids', coalesce((
      select jsonb_agg(s.id::text)
      from (
        select st.id from public.stores st where st.owner_user_id = p_user_id limit 50
      ) s
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.get_member_badge_facts(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_member_badge_facts(uuid, integer) to service_role;
