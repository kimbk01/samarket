-- DIBAY 내정보 v2.1 B2 — 앱 메타(app_meta) 테이블 (Owner 승인 2026-10-20)
--
-- 운영 DB 에 테이블이 없어 /api/me/settings/version 이 항상 대체값(missing_table)을 돌려줬고,
-- 서버에서 Android 강제 업데이트·최소 버전(android_min_version_code · android_immediate_update)을 설정할 수 없었다.
-- - key-value 테이블. 행은 넣지 않는다(값이 없으면 기존과 같은 기본 동작: 강제 업데이트 없음)
-- - 읽기: 서버(service_role)만 — 버전 API 가 서비스 키로 조회
-- - 쓰기: 플랫폼 관리자 JWT(internal.is_platform_admin) 또는 서버
-- 롤백: DROP TABLE public.app_meta;

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_meta (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{1,64}$'),
  value text NOT NULL DEFAULT '',
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_meta IS
  '앱 메타 key-value — app_version · app_build · android_min_version_code · android_immediate_update. 읽기는 서버, 쓰기는 플랫폼 관리자.';

ALTER TABLE public.app_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_meta FROM anon, authenticated;

CREATE POLICY app_meta_admin_all ON public.app_meta
  FOR ALL TO authenticated
  USING (internal.is_platform_admin(auth.uid()))
  WITH CHECK (internal.is_platform_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_meta TO authenticated;
GRANT ALL ON public.app_meta TO service_role;

CREATE OR REPLACE TRIGGER trg_app_meta_updated_at
  BEFORE UPDATE ON public.app_meta
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMIT;
