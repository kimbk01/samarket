-- 커뮤니티 글 「내 상태」 1회 조회 — 요청 증폭 근본 수정 순서 7.
-- 설계: docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md §14 (Owner 「순서 7 진행」 2026-11-01)
-- 이전: `fetchCommunityPostViewerStatesBatch` 가 좋아요·저장·숨김·신고·이웃 팔로우를 표마다 1회 + 작성자마다 차단 확인 1회
--       (글 상세 1번 = 6회, 목록 20글 = 5 + 작성자 수).
-- 이 함수는 같은 조건을 1회로 돌려준다. 판정 조립(글별 상태)은 TS 그대로.
--   liked/saved/hidden : 각 표 user_id = 나 AND post_id IN 글 목록 (PostgREST in() 과 같은 uuid 비교)
--   reported           : community_reports user_id = 나 AND target_type='post' AND target_id IN 글 목록 (text 그대로 비교)
--   following          : user_relationships user_id = 나 AND (relation_type 또는 type = 'neighbor_follow') AND target_user_id IN 작성자
--   blocked            : user_social_relations relation_type='blocked' AND is_active 가 false 아님, 나↔작성자 어느 방향이든
--                        (`fetchBlockedPairFromSb` · `isActiveSocialBlockRow` 와 같음, 나 자신은 제외)

create or replace function public.community_post_viewer_states(
  p_user_id uuid,
  p_post_ids text[],
  p_author_ids uuid[]
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'liked', coalesce((select jsonb_agg(distinct x.post_id) from public.community_post_likes x
                        where x.user_id = p_user_id and x.post_id = any(p_post_ids::uuid[])), '[]'::jsonb),
    'saved', coalesce((select jsonb_agg(distinct x.post_id) from public.community_post_saves x
                        where x.user_id = p_user_id and x.post_id = any(p_post_ids::uuid[])), '[]'::jsonb),
    'hidden', coalesce((select jsonb_agg(distinct x.post_id) from public.community_post_hides x
                         where x.user_id = p_user_id and x.post_id = any(p_post_ids::uuid[])), '[]'::jsonb),
    'reported', coalesce((select jsonb_agg(distinct r.target_id) from public.community_reports r
                           where r.user_id = p_user_id and r.target_type = 'post' and r.target_id = any(p_post_ids)), '[]'::jsonb),
    'following', coalesce((select jsonb_agg(distinct f.target_user_id) from public.user_relationships f
                            where f.user_id = p_user_id
                              and (f.relation_type = 'neighbor_follow' or f.type = 'neighbor_follow')
                              and f.target_user_id = any(p_author_ids)), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(distinct case when s.owner_user_id = p_user_id then s.target_user_id else s.owner_user_id end)
                          from public.user_social_relations s
                         where s.relation_type = 'blocked'
                           and s.is_active is distinct from false
                           and ((s.owner_user_id = p_user_id and s.target_user_id = any(p_author_ids) and s.target_user_id <> p_user_id)
                             or (s.target_user_id = p_user_id and s.owner_user_id = any(p_author_ids) and s.owner_user_id <> p_user_id))), '[]'::jsonb)
  );
$$;

revoke all on function public.community_post_viewer_states(uuid, text[], uuid[]) from public, anon, authenticated;
grant execute on function public.community_post_viewer_states(uuid, text[], uuid[]) to service_role;
