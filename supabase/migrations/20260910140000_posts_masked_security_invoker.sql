-- Security Advisor ERROR: Security Definer View — public.posts_masked
--
-- PostgreSQL 뷰 기본값은 SECURITY DEFINER(소유자 권한)이다.
-- WITH (security_invoker = true) 로 전환하되, reserved_buyer_id 마스킹 계약은 유지한다.
--
-- 계약 (20260413130000_posts_reserved_buyer_masked_view.sql 와 동일):
-- - service_role: 실제 reserved_buyer_id
-- - 판매자(user_id)·예약 구매자(reserved_buyer_id): 실제 값
-- - 그 외: NULL
-- - 컬럼 집합·순서: public.posts information_schema 기준 동적 (신규 컬럼 자동 포함)
-- - anon/authenticated: posts 실테이블 SELECT 는 reserved_buyer_id 컬럼 제외 column grant
-- - 읽기 경로: posts_masked (INSERT/UPDATE/DELETE 는 public.posts)

BEGIN;

-- ---------------------------------------------------------------------------
-- reserved_buyer_id 마스킹 — invoker 뷰가 실컬럼 SELECT 없이 동일 결과를 내도록
-- (뷰는 security_invoker, 이 함수만 SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.posts_mask_reserved_buyer_id(p_post_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_post_id IS NULL THEN NULL::uuid
    WHEN (SELECT auth.role()) = 'service_role' THEN p.reserved_buyer_id
    WHEN auth.uid() IS NOT NULL
         AND (auth.uid() = p.user_id OR auth.uid() = p.reserved_buyer_id)
      THEN p.reserved_buyer_id
    ELSE NULL::uuid
  END
  FROM public.posts AS p
  WHERE p.id = p_post_id;
$$;

COMMENT ON FUNCTION public.posts_mask_reserved_buyer_id(uuid) IS
  'posts_masked 전용: reserved_buyer_id 마스킹. 뷰 security_invoker 와 함께 사용.';

REVOKE ALL ON FUNCTION public.posts_mask_reserved_buyer_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.posts_mask_reserved_buyer_id(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- posts_masked 재생성 — security_invoker=true, 컬럼 구조·이름 불변
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  parts text[] := ARRAY[]::text[];
  r record;
  tbl regclass := to_regclass('public.posts');
  col_grant text;
BEGIN
  IF tbl IS NULL THEN
    RAISE NOTICE 'posts_masked_security_invoker: public.posts 없음 — 스킵';
    RETURN;
  END IF;

  FOR r IN
    SELECT column_name, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts'
    ORDER BY ordinal_position
  LOOP
    IF r.column_name = 'reserved_buyer_id' THEN
      parts := array_append(
        parts,
        'public.posts_mask_reserved_buyer_id(p.id) AS reserved_buyer_id'
      );
    ELSE
      parts := array_append(parts, format('p.%I', r.column_name));
    END IF;
  END LOOP;

  IF array_length(parts, 1) IS NULL OR array_length(parts, 1) < 1 THEN
    RAISE NOTICE 'posts_masked_security_invoker: 컬럼 없음 — 스킵';
    RETURN;
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS public.posts_masked';

  EXECUTE format(
    'CREATE VIEW public.posts_masked WITH (security_invoker = true) AS SELECT %s FROM public.posts AS p',
    array_to_string(parts, ', ')
  );

  COMMENT ON VIEW public.posts_masked IS
    '거래 posts 읽기용: reserved_buyer_id 마스킹 (security_invoker). INSERT/UPDATE/DELETE 는 public.posts 사용.';

  -- invoker 뷰: 기본 컬럼만 직접 SELECT 허용 (reserved_buyer_id 우회 차단)
  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO col_grant
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'posts'
    AND c.column_name <> 'reserved_buyer_id';

  IF col_grant IS NOT NULL AND length(trim(col_grant)) > 0 THEN
    REVOKE SELECT ON TABLE public.posts FROM PUBLIC;
    REVOKE SELECT ON TABLE public.posts FROM anon;
    REVOKE SELECT ON TABLE public.posts FROM authenticated;

    EXECUTE format(
      'GRANT SELECT (%s) ON TABLE public.posts TO anon, authenticated',
      col_grant
    );
  END IF;
END $$;

GRANT SELECT ON TABLE public.posts_masked TO anon, authenticated, service_role;

-- 서비스 롤·마이그레이션용 실테이블 읽기 (기존 20260413130000 과 동일)
DO $$
BEGIN
  IF to_regclass('public.posts') IS NULL THEN
    RETURN;
  END IF;

  GRANT SELECT ON TABLE public.posts TO service_role;
  GRANT SELECT ON TABLE public.posts TO postgres;

  GRANT INSERT, UPDATE, DELETE ON TABLE public.posts TO authenticated;
  GRANT INSERT, UPDATE, DELETE ON TABLE public.posts TO service_role;
END $$;

COMMIT;
