-- DIBAY 차단 SSOT backfill: legacy user_blocks · user_relationships(blocked) → user_social_relations
-- 신규 저장은 앱에서 user_social_relations 만 사용. 본 마이그레이션은 1회 이관.
--
-- 안전성:
--   · UNIQUE(owner_user_id, target_user_id) 충돌 시 blocked 로 승격 (friend 등 기존 type 덮어씀 — 차단 우선)
--   · owner ≠ target (테이블 CHECK + WHERE)
--   · user_blocks: released_at IS NULL 만 활성 차단으로 이관
--   · 방향: owner_user_id = 차단한 사람, target_user_id = 차단당한 사람 (legacy user_id / blocked_user_id 와 동일)

-- user_blocks → user_social_relations (released_at 없는 활성 차단만)
INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, created_at, updated_at)
SELECT ub.user_id, ub.blocked_user_id, 'blocked', COALESCE(ub.created_at, now()), COALESCE(ub.created_at, now())
FROM public.user_blocks ub
WHERE ub.user_id IS NOT NULL
  AND ub.blocked_user_id IS NOT NULL
  AND ub.user_id <> ub.blocked_user_id
  AND ub.released_at IS NULL
ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
  SET relation_type = 'blocked',
      updated_at = GREATEST(user_social_relations.updated_at, EXCLUDED.updated_at);

-- user_relationships blocked (relation_type / type) — 20260918120000 에서 일부 이관됐을 수 있음
INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, created_at, updated_at)
SELECT ur.user_id, ur.target_user_id, 'blocked', COALESCE(ur.created_at, now()), COALESCE(ur.created_at, now())
FROM public.user_relationships ur
WHERE (ur.relation_type = 'blocked' OR ur.type = 'blocked')
  AND ur.user_id IS NOT NULL
  AND ur.target_user_id IS NOT NULL
  AND ur.user_id <> ur.target_user_id
ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
  SET relation_type = 'blocked',
      updated_at = GREATEST(user_social_relations.updated_at, EXCLUDED.updated_at);

COMMENT ON TABLE public.user_blocks IS
  'LEGACY — read fallback only after SSOT migration. Do not insert from app.';
