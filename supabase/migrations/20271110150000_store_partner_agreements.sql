-- 매장 입점·수수료 계약(서약) — Owner 승인 설계 v2 §4-5 (2026-11-10)
-- 설계: docs/design/delivery-launch-recruiting-mode.html (v2 §4-5)
--
-- 목적
--   신청서에서 「매장 입점·수수료 약관」 동의 + 수수료 서약 → 기록(추가만) → 어드민이 계약 목록·원문 확인,
--   매장별 무료 종료일 수정 → 계약이 있어야 입점 승인 → 승인 시 오픈 기념 무료(0%) 매장 정책 자동 생성.
--
-- 포함 객체
--   1) app_legal_documents_kind_check 에 'store_partner_terms' 추가 (기존 terms·privacy·marketing 유지).
--   2) app_legal_documents_published_immutable — 게시된 store_partner_terms 도 terms·privacy 처럼 문구 고정
--      (사장님이 서명한 원문이 나중에 몰래 바뀌지 않게. 개정 = 새 버전 문서).
--   3) store_partner_agreements — 사장님 동의 기록 (추가만: UPDATE·DELETE 트리거 거부).
--      RLS: 사장님 본인 SELECT 만. 쓰기는 service_role 만.
--   4) store_launch_free_overrides — 어드민이 바꾼 「이 매장 무료 종료일」 (계약 기록은 수정 금지라 별도 표).
--   5) store_partner_fee_percent_for_taxonomy(category, topic, store) — 업종 요율 조회 (읽기 전용).
--      store_commission_resolve_policy 와 같은 해석 규칙 (아래 함수 주석의 줄 단위 대조).
--   6) admin_upsert_store_launch_free_policy(store, free_until, actor) — 오픈 기념 무료 매장 정책 생성/종료일 변경.
--   7) 약관 초안 시드 — kind='store_partner_terms', ko·en, version '1.0', status='draft' (게시는 Owner 가 어드민에서).
--
-- 바꾸지 않는 것: 수수료 부과 트리거·계산식·store_commission_resolve_policy 본문·시그니처,
--   회원 재동의(required_consent_versions 는 kind IN ('terms','privacy') 만 읽음), 회원 동의 기록.
--
-- 운영 적용: Owner 승인 후에만. (이 파일은 저장소 기록용 — 작업자는 운영 DB 에 적용하지 않았다.)
-- 의존: public.admin_store_fee_active_policy_json (20270601141000) · public.stores.store_kind (20270707130000).
--
-- 롤백 (역순, 웹 코드 롤백 후):
--   DELETE FROM public.app_legal_documents WHERE kind = 'store_partner_terms' AND published_at IS NULL;
--   DROP FUNCTION IF EXISTS public.admin_upsert_store_launch_free_policy(uuid, date, uuid);
--   DROP FUNCTION IF EXISTS public.store_partner_fee_percent_for_taxonomy(uuid, uuid, uuid);
--   DROP TABLE IF EXISTS public.store_launch_free_overrides;
--   DROP TABLE IF EXISTS public.store_partner_agreements;   -- 동의 기록이 생긴 뒤에는 백업 후에만
--   (트리거 함수 app_legal_documents_published_immutable 은 20271106120000 정의로 되돌림)
--   ALTER TABLE public.app_legal_documents DROP CONSTRAINT app_legal_documents_kind_check;
--   ALTER TABLE public.app_legal_documents ADD CONSTRAINT app_legal_documents_kind_check
--     CHECK (kind IN ('terms', 'privacy', 'marketing'));   -- store_partner_terms 행이 남아 있으면 먼저 삭제
--   (오픈 기념 무료 정책 행 store_fee_policies.memo='launch_free' 은 수수료 정책 화면에서 보관 처리)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) 법률 문서 종류
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.app_legal_documents
  DROP CONSTRAINT IF EXISTS app_legal_documents_kind_check;
ALTER TABLE public.app_legal_documents
  ADD CONSTRAINT app_legal_documents_kind_check
  CHECK (kind IN ('terms', 'privacy', 'marketing', 'store_partner_terms'));

COMMENT ON CONSTRAINT app_legal_documents_kind_check ON public.app_legal_documents IS
  'terms+privacy=required member consent; marketing=optional member consent; store_partner_terms=store owner partnership/fee terms (not a member consent).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) 게시 문서 문구 고정 — store_partner_terms 추가 (그 외 조건은 20271106120000 과 같음)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.app_legal_documents_published_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF old.published_at IS NOT NULL
     AND old.kind IN ('terms', 'privacy', 'store_partner_terms')
     AND (
       new.kind IS DISTINCT FROM old.kind
       OR new.locale IS DISTINCT FROM old.locale
       OR new.version IS DISTINCT FROM old.version
       OR new.title IS DISTINCT FROM old.title
       OR new.body IS DISTINCT FROM old.body
       OR new.effective_at IS DISTINCT FROM old.effective_at
       OR new.consent_requirement IS DISTINCT FROM old.consent_requirement
     ) THEN
    RAISE EXCEPTION 'published_legal_document_immutable'
      USING errcode = 'P0001',
            hint = 'A published terms/privacy/store partner document is fixed. Publish a revision as a new version.';
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.app_legal_documents_published_immutable() FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) 사장님 동의 기록 (추가만)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.store_partner_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 매장 삭제는 동의 기록이 있으면 막힌다 (RESTRICT) — 실매장 삭제 경로 없음, 샘플 매장은 동의 기록 없음
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  -- 동의한 사장님 (계정 삭제·익명화와 무관하게 기록 유지 — FK 없음)
  owner_user_id uuid NOT NULL,
  legal_document_id uuid NOT NULL REFERENCES public.app_legal_documents(id) ON DELETE RESTRICT,
  document_version text NOT NULL,
  -- 동의 당시 본문 SHA-256 (hex) — 원문 대조용
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  locale text NOT NULL CHECK (locale IN ('ko', 'en')),
  -- 서명 당시 화면에 표시한 무료 종료일 (필리핀 날짜). NULL = 무료 없음
  free_until date NULL,
  -- 서명 당시 매장 업종
  store_category_id uuid NULL,
  store_topic_id uuid NULL,
  -- 서명 당시 표시한 무료 기간 후 요율(%) — store_partner_fee_percent_for_taxonomy 결과. NULL = 정책 없음
  fee_percent_after numeric(5, 2) NULL CHECK (fee_percent_after IS NULL OR (fee_percent_after >= 0 AND fee_percent_after <= 100)),
  source text NOT NULL CHECK (source IN ('application', 'reconsent')),
  agreed_at timestamptz NOT NULL DEFAULT now(),
  -- 같은 매장이 같은 버전에 두 번 동의하지 않는다 (재동의 연타·재전송)
  CONSTRAINT store_partner_agreements_store_version_uidx UNIQUE (store_id, document_version)
);

CREATE INDEX IF NOT EXISTS idx_store_partner_agreements_store_agreed
  ON public.store_partner_agreements (store_id, agreed_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_partner_agreements_owner
  ON public.store_partner_agreements (owner_user_id, agreed_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_partner_agreements_document
  ON public.store_partner_agreements (legal_document_id);

COMMENT ON TABLE public.store_partner_agreements IS
  'Store owner partnership/fee agreement records (append-only). Written by server (service_role) on store application and owner re-consent.';

CREATE OR REPLACE FUNCTION public.store_partner_agreements_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'store_partner_agreements_append_only'
    USING errcode = 'P0001',
          hint = 'Store partner agreement records cannot be changed or deleted.';
END;
$$;

REVOKE ALL ON FUNCTION public.store_partner_agreements_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS store_partner_agreements_no_update ON public.store_partner_agreements;
CREATE TRIGGER store_partner_agreements_no_update
  BEFORE UPDATE OR DELETE ON public.store_partner_agreements
  FOR EACH ROW EXECUTE FUNCTION public.store_partner_agreements_append_only();

DROP TRIGGER IF EXISTS store_partner_agreements_no_truncate ON public.store_partner_agreements;
CREATE TRIGGER store_partner_agreements_no_truncate
  BEFORE TRUNCATE ON public.store_partner_agreements
  FOR EACH STATEMENT EXECUTE FUNCTION public.store_partner_agreements_append_only();

ALTER TABLE public.store_partner_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_partner_agreements_select_own ON public.store_partner_agreements;
CREATE POLICY store_partner_agreements_select_own
  ON public.store_partner_agreements FOR SELECT TO authenticated
  USING (owner_user_id = (SELECT auth.uid()));

REVOKE ALL ON public.store_partner_agreements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.store_partner_agreements TO authenticated;
GRANT SELECT, INSERT ON public.store_partner_agreements TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.store_partner_agreements FROM service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) 매장별 무료 종료일 (어드민 수정값) — 승인 전이면 승인 때, 승인 후면 즉시 정책 종료일에 반영
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.store_launch_free_overrides (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  free_until date NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) >= 2),
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_launch_free_overrides IS
  'Admin per-store launch-free end date (Manila date). Wins over the agreement free_until at approval. Server (service_role) only.';

ALTER TABLE public.store_launch_free_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_launch_free_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_launch_free_overrides TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) 업종 요율 조회 (매장이 아직 없을 때도) — 읽기 전용
--
-- 규칙 = public.store_commission_resolve_policy(p_store_id) (20270510120000 §4) 와 같다:
--   resolver                                                      | 이 함수
--   ─────────────────────────────────────────────────────────────┼──────────────────────────────────────────
--   1. p.store_id = p_store_id                                    | 1. p_store_id 가 있으면 같은 조건 + memo <> 'launch_free'
--                                                                 |    (무료 「후」 요율이므로 오픈 기념 무료 행만 뺀다)
--   2. v_topic IS NOT NULL → store_id IS NULL AND topic_id = v_topic | 2. admin_store_fee_active_policy_json(.., p_topic_id, .., 'topic')
--   3. v_cat IS NOT NULL → store_id IS NULL AND topic_id IS NULL    | 3. admin_store_fee_active_policy_json(.., p_category_id, 'category')
--      AND category_id = v_cat                                     |
--   4. store_id·topic_id·category_id 모두 NULL                      | 4. admin_store_fee_active_policy_json(.., 'default')
--   공통: is_active AND NOT coalesce(is_archived,false)             | 공통: 같은 줄 (admin_store_fee_active_policy_json 본문
--         AND (starts_at IS NULL OR starts_at <= now())             |       20270601141000 — 「store_commission_resolve_policy 와
--         AND (ends_at IS NULL OR ends_at > now())                  |       같은 조건·순서」로 이미 공유 중인 함수)
--   정렬: priority ASC, starts_at DESC NULLS FIRST, created_at DESC | 정렬: 같음 · LIMIT 1
--   fee_percent = LEAST(100, GREATEST(0, coalesce(fee_percent,0)))  | 같음
--   fixed_fee  = GREATEST(0, round(coalesce(fixed_fee,0)))          | 같음
-- 2~4 단계는 기존 공유 함수를 그대로 호출한다 (규칙 중복 구현 없음). 1단계만 launch_free 제외 조건 때문에 직접 쓴다.
-- 결과 NULL = 적용 정책 없음.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.store_partner_fee_percent_for_taxonomy(
  p_category_id uuid,
  p_topic_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.store_fee_policies%ROWTYPE;
  v jsonb;
  v_scope text;
BEGIN
  IF p_store_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.store_fee_policies p
     WHERE p.is_active AND NOT coalesce(p.is_archived, false)
       AND (p.starts_at IS NULL OR p.starts_at <= now()) AND (p.ends_at IS NULL OR p.ends_at > now())
       AND p.store_id = p_store_id
       AND coalesce(p.memo, '') <> 'launch_free'
     ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC LIMIT 1;
    IF FOUND THEN
      v := jsonb_build_object('policy_id', v_row.id, 'fee_percent', v_row.fee_percent, 'fixed_fee', v_row.fixed_fee);
      v_scope := 'store';
    END IF;
  END IF;

  IF v_scope IS NULL AND p_topic_id IS NOT NULL THEN
    v := public.admin_store_fee_active_policy_json(NULL, p_topic_id, NULL, 'topic');
    IF v IS NOT NULL THEN v_scope := 'topic'; END IF;
  END IF;

  IF v_scope IS NULL AND p_category_id IS NOT NULL THEN
    v := public.admin_store_fee_active_policy_json(NULL, NULL, p_category_id, 'category');
    IF v IS NOT NULL THEN v_scope := 'category'; END IF;
  END IF;

  IF v_scope IS NULL THEN
    v := public.admin_store_fee_active_policy_json(NULL, NULL, NULL, 'default');
    IF v IS NOT NULL THEN v_scope := 'default'; END IF;
  END IF;

  IF v_scope IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'policy_id', v->'policy_id',
    'fee_percent', LEAST(100, GREATEST(0, coalesce((v->>'fee_percent')::numeric, 0))),
    'fixed_fee', GREATEST(0, round(coalesce((v->>'fixed_fee')::numeric, 0))),
    'scope', v_scope
  );
END;
$$;

REVOKE ALL ON FUNCTION public.store_partner_fee_percent_for_taxonomy(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_partner_fee_percent_for_taxonomy(uuid, uuid, uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) 오픈 기념 무료(0%) 매장 정책 생성 / 종료일 변경
--   - 그 매장 전용 행: fee 0 · fixed 0 · delivery_fee_mode 'none' (percent 금지 제약과 충돌 없음) ·
--     is_active · starts_at now() · ends_at = p_free_until 다음날 00:00 Asia/Manila · priority 1 · memo 'launch_free'
--   - 이미 launch_free 행(보관 안 됨)이 있으면 ends_at 만 바꾼다.
--   - p_free_until < 오늘(필리핀) → 아무것도 안 하고 skipped.
--   - 매장 범위 행이라 플랫폼 기본 정책 보호(기본 정책 공백 방지)와 무관. 무료가 끝나면(ends_at 지남)
--     해석 규칙이 다음 단계(세부업종 → 업종 → 기본)로 넘어가 업종 요율이 다시 적용된다.
--   - 수수료 금액은 계산·기록하지 않는다 (부과는 DB 트리거). 감사 기록은 호출하는 서버(TS appendAuditLog).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_upsert_store_launch_free_policy(
  p_store_id uuid,
  p_free_until date,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_ends timestamptz;
  v_prev public.store_fee_policies%ROWTYPE;
  v_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_store_id IS NULL OR p_free_until IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;
  IF p_free_until < v_today THEN
    RETURN jsonb_build_object(
      'ok', true, 'result', 'skipped', 'reason', 'free_until_past',
      'free_until', p_free_until, 'today', v_today, 'actor', p_actor
    );
  END IF;

  v_ends := ((p_free_until + 1)::timestamp AT TIME ZONE 'Asia/Manila');

  -- 같은 매장 동시 호출(승인·종료일 수정 연타) 직렬화
  PERFORM pg_advisory_xact_lock(hashtext('store_launch_free:' || p_store_id::text));

  SELECT * INTO v_prev
    FROM public.store_fee_policies p
   WHERE p.store_id = p_store_id
     AND p.memo = 'launch_free'
     AND NOT coalesce(p.is_archived, false)
   ORDER BY p.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.store_fee_policies
       SET ends_at = v_ends
     WHERE id = v_prev.id;
    RETURN jsonb_build_object(
      'ok', true, 'result', 'updated', 'policy_id', v_prev.id,
      'before_ends_at', v_prev.ends_at, 'ends_at', v_ends,
      'free_until', p_free_until, 'actor', p_actor
    );
  END IF;

  INSERT INTO public.store_fee_policies (
    policy_name, store_id, category_id, topic_id,
    fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent,
    is_active, starts_at, ends_at, priority, memo, is_archived
  ) VALUES (
    'Launch free 0%', p_store_id, NULL, NULL,
    0, 0, 'none', 0,
    true, now(), v_ends, 1, 'launch_free', false
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'result', 'created', 'policy_id', v_id,
    'ends_at', v_ends, 'free_until', p_free_until, 'actor', p_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_store_launch_free_policy(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_store_launch_free_policy(uuid, date, uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) 약관 초안 (draft · 게시는 Owner 가 어드민 「약관·정책」에서) — 이미 있으면 넣지 않음
--    본문 형식 = 기존 terms 와 같음: 일반 글, 빈 줄로 문단 구분 (splitLegalBodyParagraphs).
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.app_legal_documents (kind, locale, title, body, version, status, effective_at, published_at)
SELECT 'store_partner_terms', 'ko', '매장 입점·수수료 약관', $ko$제1조 (목적) 이 약관은 DIBAY(이하 「회사」)가 운영하는 배달·매장 서비스에 매장을 입점하여 운영하려는 사장님(이하 「매장」)과 회사 사이의 입점 조건과 수수료에 관한 권리·의무를 정합니다.

제2조 (정의) 1) 「입점」은 매장이 회사 서비스에 매장 정보와 메뉴를 등록하고 고객 주문을 받는 것을 말합니다. 2) 「수수료」는 회사가 주문마다 매장에 부과하는 판매 수수료를 말합니다. 3) 「매장 캐시」는 매장이 수수료 납부를 위해 충전해 두는 금액을 말합니다. 4) 「무료 종료일」은 오픈 기념 무료가 적용되는 마지막 날(필리핀 시간 기준)을 말합니다.

제3조 (입점 신청·심사) 1) 매장은 입점 신청서에 정확한 정보를 적고 이 약관과 수수료 서약에 동의해야 신청할 수 있습니다. 2) 회사는 신청 내용을 심사하여 승인, 보완 요청 또는 반려할 수 있으며, 보완 요청과 반려 사유는 매장에 알립니다. 3) 입점 승인 후 실제 영업에는 회사의 판매 승인과 매장 노출 설정이 추가로 필요합니다.

제4조 (오픈 기념 무료) 1) 신청 화면에 무료 종료일이 표시된 경우, 입점 승인 시점부터 그 무료 종료일까지 이 매장의 배달 주문에는 수수료를 부과하지 않습니다(0%). 2) 무료 종료일 다음 날 0시(필리핀 시간) 이후 조리 단계에 들어가는 주문부터 제5조의 수수료가 적용됩니다. 3) 무료 종료일이 이미 지난 뒤에 승인되면 오픈 기념 무료는 적용되지 않습니다. 4) 회사는 매장별로 무료 종료일을 연장할 수 있습니다.

제5조 (무료 기간 후 수수료) 1) 무료 기간이 끝난 뒤에는 매장 업종에 적용되는 회사의 수수료율이 적용되며, 신청 화면에 표시된 요율을 기준으로 합니다. 2) 수수료는 주문의 수수료 기준액(고객 결제 금액(배달비 포함) + 상품권 사용 금액 + 회사가 부담한 쿠폰 금액)에 수수료율을 곱해 계산하고, 원 단위 미만은 버립니다. 회사 수수료 정책에 고정 수수료가 정해져 있으면 함께 적용합니다. 3) 회사가 업종 수수료율을 변경하는 경우 운영 공지로 미리 알리며, 변경된 요율은 알린 적용 시점 이후 조리 단계에 들어가는 주문부터 적용합니다.

제6조 (수수료 정산 방식) 1) 고객은 주문 금액을 매장에 직접 결제합니다. 회사는 고객의 결제 대금을 대신 받아 매장에 지급하지 않습니다. 다만 상품권 사용분과 회사가 부담한 쿠폰 금액은 회사의 별도 정산 절차에 따릅니다. 2) 수수료는 주문이 처음 조리 단계(또는 그 이후 단계)에 들어갈 때 주문마다 한 번 부과되며, 매장 캐시에서 차감됩니다. 3) 매장 캐시가 부족하면 부족한 금액은 미납으로 기록되고, 이후 충전되는 매장 캐시에서 오래된 미납부터 정산됩니다. 4) 조리 단계 이후 취소·환불된 주문의 수수료는 회사가 검토하여 환급 여부와 금액을 결정합니다. 5) 매장은 사장님 화면에서 수수료·캐시 내역을 확인할 수 있으며, 이의가 있으면 고객센터로 문의할 수 있습니다.

제7조 (매장의 의무) 매장은 1) 매장 정보·메뉴·가격·영업시간을 정확하게 등록하고 바뀌면 바로 고치며, 2) 음식의 위생과 안전을 지키고, 3) 식품·영업·세금 등 관계 법령을 지키며, 4) 고객 주문과 문의에 성실하게 응대하고, 5) 회사의 수수료와 매장 캐시 정책을 따릅니다.

제8조 (회사의 권한) 1) 회사는 입점 신청을 심사하고, 기준에 맞지 않으면 승인하지 않을 수 있습니다. 2) 회사는 다음 경우 매장 노출을 중지하거나 판매·운영을 중지할 수 있습니다: 허위 정보 등록, 관계 법령 위반, 위생·안전 문제, 고객 피해나 반복된 민원, 수수료 미납, 이 약관 위반. 3) 중지한 경우 그 사유를 매장에 알립니다.

제9조 (약관 변경) 회사가 이 약관을 변경하는 경우 새 버전을 게시하고, 사장님 화면에서 매장에 새 버전 동의를 요청합니다. 변경 내용과 적용 시점은 게시할 때 함께 안내합니다.

제10조 (해지) 1) 매장은 고객센터를 통해 언제든지 입점 해지(운영 종료)를 요청할 수 있습니다. 2) 회사는 제8조의 사유가 중대하거나 반복되면 입점을 해지할 수 있습니다. 3) 해지 전에 발생한 수수료와 미납은 해지 후에도 정산 대상입니다.

제11조 (분쟁 해결) 이 약관과 관련한 분쟁은 먼저 고객센터를 통한 협의로 해결하도록 노력합니다. 이 약관에 정하지 않은 사항은 관계 법령과 회사의 운영 정책에 따릅니다.$ko$,
       '1.0', 'draft', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_legal_documents d
   WHERE d.kind = 'store_partner_terms' AND d.locale = 'ko'
);

INSERT INTO public.app_legal_documents (kind, locale, title, body, version, status, effective_at, published_at)
SELECT 'store_partner_terms', 'en', 'Store partnership terms', $en$Article 1 (Purpose) These terms set out the partnership conditions and fees between DIBAY (the "Company") and a store owner (the "Store") who joins and runs a store on the Company's delivery and store service.

Article 2 (Definitions) 1) "Joining" means the Store registers its store details and menu on the Company's service and takes customer orders. 2) "Fee" means the sales fee the Company charges the Store for each order. 3) "Store Cash" means the balance the Store tops up to pay fees. 4) "Free end date" means the last day (Philippine time) the opening free offer applies.

Article 3 (Application and review) 1) To apply, the Store must enter accurate details on the application form and agree to these terms and the fee pledge. 2) The Company reviews the application and may approve it, request changes, or reject it. The Store is told the reason for a change request or rejection. 3) After approval, the Store also needs the Company's sales approval and must turn on store visibility before it can take orders.

Article 4 (Opening free offer) 1) If a free end date is shown on the application screen, no fee (0%) is charged on this Store's delivery orders from approval until that free end date. 2) The fee in Article 5 applies to orders that start preparing from 00:00 (Philippine time) on the day after the free end date. 3) If the Store is approved after the free end date has passed, the opening free offer does not apply. 4) The Company may extend the free end date for each store.

Article 5 (Fee after the free period) 1) After the free period, the Company's fee rate for the Store's category applies, based on the rate shown on the application screen. 2) The fee is the order's fee base (customer payment including delivery fee + gift certificate amount used + coupon amount paid by the Company) multiplied by the fee rate, rounded down to the peso. If the Company's fee policy sets a fixed fee, it is added. 3) If the Company changes a category fee rate, it gives notice in advance through an operations notice. The new rate applies to orders that start preparing after the notified start time.

Article 6 (How fees are settled) 1) Customers pay the order amount directly to the Store. The Company does not collect customer payments or pay them out to the Store. Gift certificate amounts and coupons paid by the Company follow the Company's separate settlement process. 2) The fee is charged once per order, when the order first starts preparing (or reaches a later step), and is deducted from Store Cash. 3) If Store Cash is not enough, the shortfall is recorded as unpaid and is settled from later Store Cash top-ups, oldest first. 4) For orders cancelled or refunded after preparing started, the Company reviews the fee and decides whether and how much to refund. 5) The Store can see its fee and cash history in the owner screens and can contact customer support with any objection.

Article 7 (Store obligations) The Store must 1) register accurate store details, menu, prices, and hours, and update them right away when they change, 2) keep food hygienic and safe, 3) follow applicable laws, including food, business, and tax laws, 4) respond to customer orders and inquiries in good faith, and 5) follow the Company's fee and Store Cash policies.

Article 8 (Company rights) 1) The Company reviews applications and may decline those that do not meet its standards. 2) The Company may hide the Store or suspend its sales or operation in these cases: false information, violation of applicable laws, hygiene or safety problems, customer harm or repeated complaints, unpaid fees, or violation of these terms. 3) The Store is told the reason for a suspension.

Article 9 (Changes to these terms) If the Company changes these terms, it publishes a new version and asks the Store to agree to it in the owner screens. The changes and start time are announced when published.

Article 10 (Termination) 1) The Store may ask customer support to end its partnership (close the store) at any time. 2) The Company may end the partnership if a reason in Article 8 is serious or repeated. 3) Fees and unpaid amounts incurred before termination remain due after termination.

Article 11 (Disputes) Disputes about these terms are first settled through discussion with customer support. Matters not covered by these terms follow applicable laws and the Company's operating policies.$en$,
       '1.0', 'draft', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_legal_documents d
   WHERE d.kind = 'store_partner_terms' AND d.locale = 'en'
);

COMMIT;
