-- public.posts: reserved_buyer_id 를 비당사자·anon 에게 노출하지 않도록 읽기 전용 뷰 + 권한 정리.
-- - JWT 가 service_role 이면 운영·관리자 조회와 동일하게 실제 UUID 유지
-- - 그 외에는 판매자(user_id)·예약 구매자(reserved_buyer_id)만 값 확인, 나머지는 NULL

DO $$
DECLARE
  parts text[] := ARRAY[]::text[];
  r record;
  tbl regclass := to_regclass('public.posts');
BEGIN
  IF tbl IS NULL THEN
    RAISE NOTICE 'posts_reserved_buyer_masked_view: public.posts 없음 — 스킵';
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
        'CASE '
          || 'WHEN (SELECT auth.role()) = ''service_role'' THEN p.reserved_buyer_id '
          || 'WHEN auth.uid() IS NOT NULL AND (auth.uid() = p.user_id OR auth.uid() = p.reserved_buyer_id) THEN p.reserved_buyer_id '
          || 'ELSE NULL END AS reserved_buyer_id'
      );
    ELSE
      parts := array_append(parts, format('p.%I', r.column_name));
    END IF;
  END LOOP;

  IF array_length(parts, 1) IS NULL OR array_length(parts, 1) < 1 THEN
    RAISE NOTICE 'posts_reserved_buyer_masked_view: 컬럼 없음 — 스킵';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.posts_masked AS SELECT %s FROM public.posts p',
    array_to_string(parts, ', ')
  );

  COMMENT ON VIEW public.posts_masked IS
    '거래 posts 읽기용: reserved_buyer_id 마스킹. INSERT/UPDATE/DELETE 는 public.posts 사용.';
END $$;

-- 뷰 조회 권한 (기존과 동일하게 앱 키로 읽기)
GRANT SELECT ON TABLE public.posts_masked TO anon, authenticated, service_role;

-- 직접 테이블 SELECT 제한 — 쓰기·서비스 롤·마이그레이션용 역할은 유지
DO $$
BEGIN
  IF to_regclass('public.posts') IS NULL THEN
    RETURN;
  END IF;

  REVOKE SELECT ON TABLE public.posts FROM PUBLIC;
  REVOKE SELECT ON TABLE public.posts FROM anon;
  REVOKE SELECT ON TABLE public.posts FROM authenticated;

  -- 서비스 롤·대시보드 SQL·마이그레이션용
  GRANT SELECT ON TABLE public.posts TO service_role;
  GRANT SELECT ON TABLE public.posts TO postgres;

  -- 일반 사용자 글 작성·수정 (RLS/정책은 기존과 동일)
  GRANT INSERT, UPDATE, DELETE ON TABLE public.posts TO authenticated;
  GRANT INSERT, UPDATE, DELETE ON TABLE public.posts TO service_role;

  -- anon 이 글을 쓰지 않는 전제(일반적). 필요 시 별도 정책에서 INSERT 허용.
END $$;
