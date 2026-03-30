-- =============================================================================
-- SAMarket: 앱 DB 실데이터 전부 삭제 (복구 불가)
-- =============================================================================
-- 실행 위치: Supabase Dashboard → SQL Editor (postgres / service role 권한)
--
-- 하는 일:
--   • public 스키마의 "일반 테이블"만 TRUNCATE … CASCADE + RESTART IDENTITY
--   • 확장(PostGIS 등)이 소유한 테이블은 건너뜀 (TRUNCATE 실패 방지)
--
-- 하지 않는 일 (별도 필요 시 아래 주석·대시보드 참고):
--   • Storage 버킷 파일 (Dashboard → Storage 또는 storage.objects)
--   • auth.users (로그인 주체) — 아래 [선택] 블록 참고
--
-- 과거에 "어느 아이디로 들어왔는지" 같은 감사 추적은, 해당 컬럼/로그가 없으면
-- DB만으로는 복원·확인이 불가능합니다. 이 스크립트는 데이터를 지울 뿐입니다.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  stmt text;
BEGIN
  SELECT coalesce(
    string_agg(format('%I.%I', n.nspname::text, c.relname::text), ', ' ORDER BY n.nspname::text, c.relname::text),
    ''
  )
  INTO stmt
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend d
      WHERE d.classid = 'pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
    );

  IF stmt = '' THEN
    RAISE NOTICE 'wipe-all-app-data: public에 TRUNCATE 대상 테이블 없음';
  ELSE
    EXECUTE 'TRUNCATE TABLE ' || stmt || ' RESTART IDENTITY CASCADE';
    RAISE NOTICE 'wipe-all-app-data: public 테이블 TRUNCATE 완료';
  END IF;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- [선택] 로그인 계정까지 전부 제거 (플랫폼 어드민·일반 사용자 UUID 모두 삭제)
-- public을 먼저 비운 뒤, 한 번에 실행하세요. 복구 불가.
--
-- BEGIN;
-- DELETE FROM auth.users;
-- COMMIT;
--
-- 권한/정책 때문에 실패하면: Authentication → Users에서 일괄 삭제하거나
-- Supabase CLI `supabase db reset` (로컬) 등 프로젝트 정책에 맞는 방법을 쓰세요.
-- -----------------------------------------------------------------------------
