-- 동네 피드 로그인 사용자 제외 목록 1회 조회 (Owner 「S4 진행」 2026-11-25)
--
-- 근거: docs/audit/supabase-request-surge-2026-11-18/budget-alert-defects-design-2026-11-24.md D5·S4
-- 실측(Vercel · 11-24 08:00 ~ 11-25 08:00 UTC · 요청 191, #577 반영 뒤): 동네 피드 1회당 5.41 (예산 5.0).
--   로그인 요청마다 차단 관계(user_social_relations 0.64)와 숨긴 글(community_post_hides 0.74)을 따로 읽는다.
--
-- 같은 조건을 한 번에 읽어 돌려줄 뿐 — 판정·필터는 TS 그대로:
--   blocked_user_ids = fetchBlockedAuthorIdsForViewerSb 와 같은 조건
--     relation_type = 'blocked' · 뷰어가 owner 또는 target · is_active 가 null 또는 true (SOCIAL_BLOCK_ACTIVE_OR_LEGACY)
--     → 상대편 id (양방향)
--   hidden_post_ids  = community_post_hides where user_id = 뷰어 (listNeighborhoodFeed 기존 조회와 같음)
-- 실행 권한: service_role 만 (동네 피드는 service role 클라이언트로 읽는다).

create or replace function public.neighborhood_feed_viewer_exclusions(p_viewer uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'blocked_user_ids', coalesce((
      select jsonb_agg(distinct x.other_id)
        from (
          select case when r.owner_user_id = p_viewer then r.target_user_id else r.owner_user_id end as other_id
            from public.user_social_relations r
           where r.relation_type = 'blocked'
             and (r.owner_user_id = p_viewer or r.target_user_id = p_viewer)
             and (r.is_active is null or r.is_active = true)
        ) x
       where x.other_id is not null
    ), '[]'::jsonb),
    'hidden_post_ids', coalesce((
      select jsonb_agg(h.post_id)
        from public.community_post_hides h
       where h.user_id = p_viewer
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.neighborhood_feed_viewer_exclusions(uuid) from public, anon, authenticated;
grant execute on function public.neighborhood_feed_viewer_exclusions(uuid) to service_role;
