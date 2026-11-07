-- DIBAY @id v2 — 자동 발급 형식 dibay+숫자 · 비슷한 아이디 차단 · dibay 접두 시스템 전용
-- Owner 「설계안 진행」 2026-11-08 (설계안 ⑦⑧). 운영 함수 정의(2026-11-08 조회)를 그대로 옮기고 검사만 추가했다.
--
-- 1) profiles.dibay_id_key — 소문자 + `.`·`_` 제거 (생성 컬럼) + 유일 인덱스
--    운영 사전 조회: 회원 간 키 중복 0건 (2026-11-08)
-- 2) dibay_id_candidate_error() — 정확 일치 = dibay_id_taken, 키 일치 = dibay_id_similar_taken,
--    dibay 접두 = dibay_id_reserved_prefix (본인 현재 아이디는 예외 — 기존 dibayapple 등 3명 유지)
-- 3) assign_auto_dibay_id — 신규 발급 `dibay` + 숫자 6자리(24회 충돌 시 7자리). 기존 dibay_xxxxxx 는 유지.
-- 4) confirm_dibay_id / admin_set_dibay_id — 위 검사 사용. admin_set 은 dibay_id_auto_assigned=false 로 정리
--    (관리자 변경 후 「자동 발급」 표시가 남던 결함 — 운영 4명)

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dibay_id_key text
  GENERATED ALWAYS AS (nullif(regexp_replace(lower(btrim(dibay_id)), '[._]', '', 'g'), '')) STORED;

COMMENT ON COLUMN public.profiles.dibay_id_key IS
  '중복 판정 키 — lower(dibay_id) 에서 . _ 제거. lib/auth/dibay-id-policy.ts dibayIdSimilarityKey 와 같은 규칙.';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_dibay_id_key_unique_idx
  ON public.profiles (dibay_id_key)
  WHERE dibay_id_key IS NOT NULL;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dibay_id_candidate_error(p_user_id uuid, p_normalized text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := regexp_replace(lower(btrim(COALESCE(p_normalized, ''))), '[._]', '', 'g');
  v_current text;
BEGIN
  SELECT lower(btrim(COALESCE(dibay_id, ''))) INTO v_current FROM public.profiles WHERE id = p_user_id;

  IF v_key LIKE 'dibay%' AND COALESCE(v_current, '') <> lower(btrim(p_normalized)) THEN
    RETURN 'dibay_id_reserved_prefix';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id <> p_user_id
      AND (
        lower(btrim(p.dibay_id)) = lower(btrim(p_normalized))
        OR (lower(btrim(p.username)) = lower(btrim(p_normalized)) AND p.username_confirmed = true)
      )
  ) THEN
    RETURN 'dibay_id_taken';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id <> p_user_id
      AND (
        p.dibay_id_key = v_key
        OR (
          p.username_confirmed = true
          AND regexp_replace(lower(btrim(p.username)), '[._]', '', 'g') = v_key
        )
      )
  ) THEN
    RETURN 'dibay_id_similar_taken';
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.dibay_id_candidate_error(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dibay_id_candidate_error(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_auto_dibay_id(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_candidate text;
  v_now timestamptz := now();
  v_attempt int := 0;
  v_max_attempts int := 48;
  v_digits int;
  v_auto_re constant text := '^(dibay_[a-f0-9]{6}|dibay[0-9]{6,7})$';
BEGIN
  -- Supabase migration/backfill runs as postgres superuser — bypass JWT gate.
  IF session_user NOT IN ('postgres', 'supabase_admin') THEN
    IF (SELECT auth.role()) <> 'service_role' THEN
      IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
      END IF;
    END IF;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  IF v_row.dibay_id IS NOT NULL AND btrim(v_row.dibay_id) <> '' THEN
    IF COALESCE(v_row.dibay_id_auto_assigned, false) = true
       AND COALESCE(v_row.dibay_id_changed_once, false) = false THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dibay_id', lower(btrim(v_row.dibay_id)),
        'idempotent', true
      );
    END IF;
    IF v_row.dibay_id_locked = true
       OR COALESCE(v_row.dibay_id_changed_once, false) = true
       OR (
         v_row.username_confirmed = true
         AND lower(btrim(v_row.dibay_id)) !~ v_auto_re
       ) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dibay_id', lower(btrim(v_row.dibay_id)),
        'idempotent', true,
        'skipped', true
      );
    END IF;
  END IF;

  IF (v_row.dibay_id IS NULL OR btrim(v_row.dibay_id) = '')
     AND v_row.username_confirmed = true
     AND v_row.username IS NOT NULL
     AND btrim(v_row.username) <> ''
     AND lower(btrim(v_row.username)) !~ v_auto_re THEN
    RETURN jsonb_build_object('ok', false, 'error', 'skip_user_confirmed');
  END IF;

  IF v_row.dibay_id_locked = true
     AND COALESCE(v_row.dibay_id_auto_assigned, false) = false
     AND v_row.dibay_id IS NOT NULL
     AND btrim(v_row.dibay_id) <> '' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dibay_id', lower(btrim(v_row.dibay_id)),
      'idempotent', true,
      'skipped', true
    );
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > v_max_attempts THEN
      RETURN jsonb_build_object('ok', false, 'error', 'assign_collision_exhausted');
    END IF;

    -- 설계안 ⑦: dibay + 숫자 6자리, 24회 충돌하면 7자리
    v_digits := CASE WHEN v_attempt <= 24 THEN 6 ELSE 7 END;
    v_candidate := 'dibay' || lpad(floor(random() * power(10, v_digits))::bigint::text, v_digits, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.dibay_id_key = v_candidate
         OR lower(btrim(p.dibay_id)) = v_candidate
         OR (
           regexp_replace(lower(btrim(p.username)), '[._]', '', 'g') = v_candidate
           AND p.username_confirmed = true
         )
    );
  END LOOP;

  UPDATE public.profiles
  SET
    dibay_id = v_candidate,
    username = v_candidate,
    username_confirmed = true,
    dibay_id_auto_assigned = true,
    dibay_id_initial = v_candidate,
    dibay_id_changed_once = false,
    dibay_id_changed_at = NULL,
    dibay_id_locked = false,
    username_set_at = COALESCE(username_set_at, v_now),
    updated_at = v_now
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'dibay_id', v_candidate);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
END;
$function$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_dibay_id(p_user_id uuid, p_dibay_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_normalized text;
  v_row public.profiles%ROWTYPE;
  v_terms_version text;
  v_privacy_version text;
  v_now timestamptz := now();
  v_candidate_error text;
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  -- Same pick rule as pickCurrentPublishedLegalDoc (lib/legal/app-legal-documents.ts).
  SELECT d.version INTO v_terms_version
  FROM public.app_legal_documents d
  WHERE d.kind = 'terms' AND d.locale = 'ko' AND d.status = 'published'
    AND (d.effective_at IS NULL OR d.effective_at <= v_now)
  ORDER BY d.effective_at DESC NULLS LAST, d.published_at DESC NULLS LAST
  LIMIT 1;
  SELECT d.version INTO v_privacy_version
  FROM public.app_legal_documents d
  WHERE d.kind = 'privacy' AND d.locale = 'ko' AND d.status = 'published'
    AND (d.effective_at IS NULL OR d.effective_at <= v_now)
  ORDER BY d.effective_at DESC NULLS LAST, d.published_at DESC NULLS LAST
  LIMIT 1;
  v_terms_version := COALESCE(NULLIF(btrim(v_terms_version), ''), '2026-04-store-review');
  v_privacy_version := COALESCE(NULLIF(btrim(v_privacy_version), ''), '2026-04-store-review');

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;

  v_normalized := lower(btrim(replace(COALESCE(p_dibay_id, ''), '@', '')));
  IF v_normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_required');
  END IF;

  IF v_normalized !~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_invalid_format');
  END IF;

  IF v_normalized IN (
    'admin', 'administrator', 'support', 'owner', 'system', 'official',
    'staff', 'root', 'mod', 'help', 'dibay', 'samarket'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved');
  END IF;

  IF v_normalized ~ '^(dibay_[a-f0-9]{6}|dibay[0-9]{6,7})$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved_pattern');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  IF COALESCE(v_row.dibay_id_changed_once, false) = true
     AND v_row.dibay_id_locked = true
     AND v_row.dibay_id IS NOT NULL
     AND btrim(v_row.dibay_id) <> '' THEN
    IF lower(btrim(v_row.dibay_id)) = v_normalized THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dibay_id', lower(btrim(v_row.dibay_id)),
        'idempotent', true
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_change_limit');
  END IF;

  -- 설계안 ⑧: dibay 접두(시스템 전용) · 정확 일치 · 비슷한 아이디(점·밑줄만 다름)
  v_candidate_error := public.dibay_id_candidate_error(p_user_id, v_normalized);

  IF COALESCE(v_row.dibay_id_auto_assigned, false) = true
     AND COALESCE(v_row.dibay_id_changed_once, false) = false
     AND v_row.dibay_id IS NOT NULL
     AND btrim(v_row.dibay_id) <> '' THEN
    IF v_row.terms_accepted_at IS NULL
      OR v_row.privacy_accepted_at IS NULL
      OR v_row.terms_version IS DISTINCT FROM v_terms_version
      OR v_row.privacy_version IS DISTINCT FROM v_privacy_version
    THEN
      RETURN jsonb_build_object('ok', false, 'error', 'terms_required');
    END IF;

    IF v_candidate_error IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', v_candidate_error);
    END IF;

    UPDATE public.profiles
    SET
      dibay_id = v_normalized,
      dibay_id_auto_assigned = false,
      dibay_id_changed_once = true,
      dibay_id_changed_at = v_now,
      dibay_id_locked = true,
      username = v_normalized,
      username_confirmed = true,
      username_set_at = COALESCE(username_set_at, v_now),
      onboarding_status = 'completed',
      onboarding_completed_at = COALESCE(onboarding_completed_at, v_now),
      updated_at = v_now
    WHERE id = p_user_id;

    RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized);
  END IF;

  IF v_row.dibay_id_locked = true
     AND v_row.dibay_id IS NOT NULL
     AND btrim(v_row.dibay_id) <> '' THEN
    IF lower(btrim(v_row.dibay_id)) = v_normalized THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dibay_id', lower(btrim(v_row.dibay_id)),
        'idempotent', true
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_already_locked');
  END IF;

  IF v_row.terms_accepted_at IS NULL
    OR v_row.privacy_accepted_at IS NULL
    OR v_row.terms_version IS DISTINCT FROM v_terms_version
    OR v_row.privacy_version IS DISTINCT FROM v_privacy_version
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'terms_required');
  END IF;

  IF v_candidate_error IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_candidate_error);
  END IF;

  UPDATE public.profiles
  SET
    dibay_id = v_normalized,
    dibay_id_auto_assigned = false,
    dibay_id_changed_once = true,
    dibay_id_changed_at = v_now,
    dibay_id_locked = true,
    username = v_normalized,
    username_confirmed = true,
    username_set_at = COALESCE(username_set_at, v_now),
    onboarding_status = 'completed',
    onboarding_completed_at = COALESCE(onboarding_completed_at, v_now),
    updated_at = v_now
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_similar_taken');
END;
$function$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_dibay_id(
  p_target_user_id uuid,
  p_dibay_id text,
  p_actor_user_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_normalized text;
  v_row public.profiles%ROWTYPE;
  v_before text;
  v_now timestamptz := now();
  v_reason text := nullif(btrim(COALESCE(p_reason, '')), '');
  v_candidate_error text;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_target_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;
  -- 변경 사유 필수 — 사유 없는 관리자 변경은 감사 기록 누락이므로 DB 에서 거부한다.
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF char_length(v_reason) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_too_long');
  END IF;

  v_normalized := lower(btrim(replace(COALESCE(p_dibay_id, ''), '@', '')));
  IF v_normalized = '' THEN
    -- 비우면 친구 검색·표시가 끊긴다 — 관리자도 공개 아이디를 삭제할 수 없다.
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_required');
  END IF;
  IF v_normalized !~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_invalid_format');
  END IF;
  IF v_normalized IN (
    'admin', 'administrator', 'support', 'owner', 'system', 'official',
    'staff', 'root', 'mod', 'help', 'dibay', 'samarket'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved');
  END IF;
  IF v_normalized ~ '^(dibay_[a-f0-9]{6}|dibay[0-9]{6,7})$' THEN
    -- 자동 발급 패턴은 시스템 전용 (과거 자동 아이디 재사용·사칭 방지)
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved_pattern');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  v_before := nullif(lower(btrim(COALESCE(v_row.dibay_id, ''))), '');
  IF v_before = v_normalized AND lower(btrim(COALESCE(v_row.username, ''))) = v_normalized THEN
    RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized, 'idempotent', true);
  END IF;

  -- 설계안 ⑧: dibay 접두 · 정확 일치 · 비슷한 아이디(점·밑줄만 다름)
  v_candidate_error := public.dibay_id_candidate_error(p_target_user_id, v_normalized);
  IF v_candidate_error IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_candidate_error);
  END IF;

  UPDATE public.profiles
  SET
    dibay_id = v_normalized,
    username = v_normalized,
    username_confirmed = true,
    username_set_at = COALESCE(username_set_at, v_now),
    -- 관리자가 정한 아이디는 자동 발급이 아니다 (설계안 ⑧ G2). 회원 본인 변경권(dibay_id_changed_once)은 건드리지 않는다.
    dibay_id_auto_assigned = false,
    updated_at = v_now
  WHERE id = p_target_user_id;

  INSERT INTO public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  VALUES (
    'admin',
    p_actor_user_id,
    'member',
    p_target_user_id::text,
    'admin_member_dibay_id_change',
    jsonb_build_object('dibay_id', v_before, 'username', v_row.username),
    jsonb_build_object(
      'before', v_before,
      'after', v_normalized,
      'reason', v_reason,
      'member_change_right_used', COALESCE(v_row.dibay_id_changed_once, false),
      'via', 'admin_set_dibay_id'
    )
  );

  RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized, 'before', v_before);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_similar_taken');
END;
$function$;

COMMIT;
