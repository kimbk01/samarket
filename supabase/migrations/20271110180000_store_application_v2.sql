-- 매장 입점 신청 v2 — Owner 「권장안으로 승인」 2026-11-10
-- 설계: docs/audit/store-apply-redesign-v2-2026-11-10.md (S1·S2·S4)
--
-- 포함 객체
--   1) store_application_events — 입점 심사 상태 변경 기록(추가만). 사장님 진행 막대 시각·어드민 처리 이력의 단일 원천.
--      RLS: 사장님 본인 매장 SELECT 만. 쓰기는 service_role 만.
--      ※ 후속 20271110190000 이 사장님 SELECT 를 회수(관리자 메모·id 노출) → service_role 전용.
--   2) store_phone_verifications — 매장 전화 전용 인증(회원 phone_otp_challenges·profiles 와 분리).
--      회원 번호와 같아도 됨. RLS 켜고 정책 없음(service_role 전용).
--   3) stores.phone_verified_at · stores.phone_verification_id · stores.branch_name 추가.
--   4) phone_otp_delivery_events.purpose 추가(기본 'member') — 어드민 문자 발송 현황에서 매장 인증 구분.
--   5) store_name_duplicate_candidates(name, exclude) — 매장 이름 중복 후보(실매장 · 심사·운영 중 상태만). 읽기 전용.
--
-- 바꾸지 않는 것: stores 승인 상태 값·전이, 회원 전화 인증 표·함수, 수수료 트리거.
-- 운영 적용: Owner 승인 후에만. 지난 데이터 채우기 없음(phone_verified_at null = 「인증 기록 없음」).
--
-- 롤백 (웹 코드 롤백 후, 역순):
--   DROP FUNCTION IF EXISTS public.store_name_duplicate_candidates(text, uuid);
--   ALTER TABLE public.phone_otp_delivery_events DROP COLUMN IF EXISTS purpose;
--   ALTER TABLE public.stores DROP COLUMN IF EXISTS branch_name;
--   ALTER TABLE public.stores DROP COLUMN IF EXISTS phone_verification_id;
--   ALTER TABLE public.stores DROP COLUMN IF EXISTS phone_verified_at;
--   DROP TABLE IF EXISTS public.store_phone_verifications;
--   DROP TABLE IF EXISTS public.store_application_events;   -- 기록이 생긴 뒤에는 백업 후에만

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) 입점 심사 상태 변경 기록
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.store_application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  /** submit · start_review · approve_store · reject_store · request_revision · reopen_application · resubmit · suspend_store · resume_store */
  action text NOT NULL,
  reason text,
  actor_type text NOT NULL CHECK (actor_type IN ('owner', 'admin', 'system')),
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_application_events_store_created_idx
  ON public.store_application_events (store_id, created_at DESC);

COMMENT ON TABLE public.store_application_events IS
  'Store application/approval status transitions (append-only). Owner progress bar timestamps + admin history.';

CREATE OR REPLACE FUNCTION public.store_application_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'store_application_events_append_only' USING errcode = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS store_application_events_no_update ON public.store_application_events;
CREATE TRIGGER store_application_events_no_update
  BEFORE UPDATE ON public.store_application_events
  FOR EACH ROW EXECUTE FUNCTION public.store_application_events_append_only();

ALTER TABLE public.store_application_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_application_events_owner_select ON public.store_application_events;
CREATE POLICY store_application_events_owner_select
  ON public.store_application_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_application_events.store_id
        AND s.owner_user_id = auth.uid()
    )
  );

REVOKE ALL ON public.store_application_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.store_application_events FROM authenticated;
GRANT SELECT ON public.store_application_events TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) 매장 전화 전용 인증
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.store_phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /** 승인 후 번호 변경이면 대상 매장 · 신청 전이면 null */
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  purpose text NOT NULL CHECK (purpose IN ('store_apply', 'store_phone_change')),
  /** E.164 (+63… / +82…) */
  phone text NOT NULL,
  otp_code_hash text NOT NULL,
  otp_expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  consumed_at timestamptz,
  consumed_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_phone_verifications_user_purpose_idx
  ON public.store_phone_verifications (user_id, purpose, requested_at DESC);

COMMENT ON TABLE public.store_phone_verifications IS
  'Store phone OTP (separate from member phone_otp_challenges/profiles). Member number duplicates allowed.';

ALTER TABLE public.store_phone_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_phone_verifications FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) 매장 컬럼
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_verification_id uuid REFERENCES public.store_phone_verifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_name text;

COMMENT ON COLUMN public.stores.phone_verified_at IS 'Store phone verified by store_phone_verifications (null = no verification record).';
COMMENT ON COLUMN public.stores.branch_name IS 'Branch label appended to store_name when the base name duplicates another store (chain stores).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) 문자 발송 기록 구분
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.phone_otp_delivery_events
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'member';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) 매장 이름 중복 후보
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.store_name_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(lower(coalesce(p, '')), '[^a-z0-9가-힣ㄱ-ㅎ]', '', 'g');
$$;

/**
 * 같은 이름 후보: 비교 키(소문자·공백·기호 제거)가 같거나, 지점명을 붙인 매장의 「본 이름」이 같은 매장.
 * 대상 = 실매장(store_kind='real') · 대기·검토중·보완·승인·정지 (반려·샘플·옛 시험 제외).
 */
CREATE OR REPLACE FUNCTION public.store_name_duplicate_candidates(p_name text, p_exclude_store_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, store_name text, branch_name text, approval_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.store_name, s.branch_name, s.approval_status
  FROM public.stores s
  WHERE public.store_name_key(p_name) <> ''
    AND s.store_kind = 'real'
    AND s.approval_status IN ('pending', 'under_review', 'revision_requested', 'approved', 'suspended')
    AND (p_exclude_store_id IS NULL OR s.id <> p_exclude_store_id)
    AND (
      public.store_name_key(s.store_name) = public.store_name_key(p_name)
      OR (
        coalesce(s.branch_name, '') <> ''
        AND public.store_name_key(s.store_name)
            = public.store_name_key(p_name) || public.store_name_key(s.branch_name)
      )
    )
  ORDER BY s.created_at DESC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.store_name_duplicate_candidates(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_name_duplicate_candidates(text, uuid) TO service_role;

COMMIT;
