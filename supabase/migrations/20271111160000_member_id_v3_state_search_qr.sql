-- 회원 아이디 v3 · 친구 찾기 · QR 친구 추가 — DB (설계안 v3 §3·§4, Owner 「1단계 시작」 2026-11-11)
-- 설계: docs/audit/member-id-base-id-audit-design-2026-11-11.md
--
-- 칸 의미 (단일 정의)
--   dibay_id          = 회원 아이디 (회원 화면에 보이는 유일한 아이디)
--   dibay_id_initial  = 기본 아이디 (처음 발급, 평생 고정, 어드민 전용 · 회원 친구 찾기에 쓰지 않음)
--   dibay_id_state    = 'none' | 'auto' (숫자5+영어3, 안 바꿈) | 'auto_legacy' (dibay… 옛 형식, 안 바꿈) | 'custom' (바뀐·직접 정한 아이디)
--   dibay_id_can_change = 회원 본인 1회 변경 가능 여부 (confirm_dibay_id 허용 조건과 같은 식)
--
-- 운영 사전 조회 (2026-11-11, 읽기 전용)
--   회원 142 · dibay_id 없음 0 · dibay_id_initial 없음 61 (직접 정한 아이디) · dibay_id_initial 중복 0
--   다른 회원 현재 아이디와 겹치는 dibay_id_initial 0 · `^[0-9]{5}[a-z]{3}$` 사용 중 0
-- 운영 함수 정의(confirm_dibay_id · admin_set_dibay_id · dibay_id_candidate_error · cm_accept_friend_request)는
-- 2026-11-11 조회본을 그대로 옮기고 표시한 줄만 바꿨다.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. 백업 (전 행, 되돌림용)
CREATE TABLE IF NOT EXISTS public.member_id_v3_backup_20271111 AS
SELECT
  p.id,
  p.dibay_id,
  p.dibay_id_initial,
  p.dibay_id_auto_assigned,
  p.dibay_id_changed_once,
  p.dibay_id_changed_at,
  p.dibay_id_locked,
  p.username,
  p.username_confirmed,
  now() AS backed_up_at
FROM public.profiles p;

ALTER TABLE public.member_id_v3_backup_20271111 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.member_id_v3_backup_20271111 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.member_id_v3_backup_20271111 TO service_role;

-- ---------------------------------------------------------------------------
-- 1. 기본 아이디 채우기 — 직접 정한 아이디만 있는 회원(운영 61명): 지금 아이디를 기본 아이디로 기록 (새 발급 없음)
UPDATE public.profiles
SET dibay_id_initial = lower(btrim(dibay_id))
WHERE dibay_id_initial IS NULL
  AND dibay_id IS NOT NULL
  AND btrim(dibay_id) <> '';

-- ---------------------------------------------------------------------------
-- 2. 기본 아이디 키(유일) · 상태 · 변경 가능 여부 — 생성 컬럼 = DB 단일 판정
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dibay_id_initial_key text
  GENERATED ALWAYS AS (nullif(regexp_replace(lower(btrim(dibay_id_initial)), '[._]', '', 'g'), '')) STORED;

COMMENT ON COLUMN public.profiles.dibay_id_initial_key IS
  '기본 아이디 중복 판정 키 — lower(dibay_id_initial) 에서 . _ 제거. dibay_id_key 와 같은 규칙.';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_dibay_id_initial_key_unique_idx
  ON public.profiles (dibay_id_initial_key)
  WHERE dibay_id_initial_key IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dibay_id_state text
  GENERATED ALWAYS AS (
    CASE
      WHEN dibay_id IS NULL OR btrim(dibay_id) = '' THEN 'none'
      WHEN COALESCE(dibay_id_auto_assigned, false)
           AND NOT COALESCE(dibay_id_changed_once, false)
           AND lower(btrim(dibay_id)) = lower(btrim(COALESCE(dibay_id_initial, '')))
           AND lower(btrim(dibay_id)) ~ '^[0-9]{5}[a-z]{3}$' THEN 'auto'
      WHEN COALESCE(dibay_id_auto_assigned, false)
           AND NOT COALESCE(dibay_id_changed_once, false)
           AND lower(btrim(dibay_id)) = lower(btrim(COALESCE(dibay_id_initial, ''))) THEN 'auto_legacy'
      ELSE 'custom'
    END
  ) STORED;

COMMENT ON COLUMN public.profiles.dibay_id_state IS
  '회원 아이디 상태 단일 판정 — none · auto(숫자5+영어3, 안 바꿈) · auto_legacy(dibay… 옛 형식, 안 바꿈) · custom(바뀐·직접 정한 아이디).';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dibay_id_can_change boolean
  GENERATED ALWAYS AS (
    dibay_id IS NOT NULL
    AND btrim(dibay_id) <> ''
    AND NOT COALESCE(dibay_id_changed_once, false)
    AND (COALESCE(dibay_id_auto_assigned, false) OR NOT COALESCE(dibay_id_locked, false))
  ) STORED;

COMMENT ON COLUMN public.profiles.dibay_id_can_change IS
  '회원 본인 1회 변경 가능 — confirm_dibay_id 허용 조건과 같은 식. 앱은 이 값만 쓴다.';

-- ---------------------------------------------------------------------------
-- 3. 기본 아이디 변경 금지 (관리자·service_role 포함)
CREATE OR REPLACE FUNCTION public.profiles_guard_dibay_id_initial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF OLD.dibay_id_initial IS NOT NULL
     AND btrim(OLD.dibay_id_initial) <> ''
     AND NEW.dibay_id_initial IS DISTINCT FROM OLD.dibay_id_initial THEN
    RAISE EXCEPTION 'dibay_id_initial_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_profiles_guard_dibay_id_initial ON public.profiles;
CREATE TRIGGER trg_profiles_guard_dibay_id_initial
  BEFORE UPDATE OF dibay_id_initial ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_dibay_id_initial();

-- ---------------------------------------------------------------------------
-- 4. 자동 아이디 단어표 — 영어 3글자 78개 (설계안 §3.2: i·l·o 없음, 부정·민감 단어 제외)
CREATE TABLE IF NOT EXISTS public.dibay_id_wordlist (
  word text PRIMARY KEY CHECK (word ~ '^[a-z]{3}$' AND word !~ '[ilo]'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dibay_id_wordlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dibay_id_wordlist FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.dibay_id_wordlist TO service_role;

INSERT INTO public.dibay_id_wordlist (word) VALUES
  ('ace'), ('ant'), ('arc'), ('art'), ('awe'), ('bag'), ('bat'), ('bay'), ('bee'), ('bud'),
  ('bun'), ('bus'), ('cab'), ('cap'), ('car'), ('cat'), ('cub'), ('cup'), ('day'), ('den'),
  ('dew'), ('emu'), ('fan'), ('fun'), ('gem'), ('gum'), ('gym'), ('ham'), ('hat'), ('hen'),
  ('hue'), ('hug'), ('hut'), ('jam'), ('jar'), ('jay'), ('jet'), ('jug'), ('key'), ('map'),
  ('mat'), ('nap'), ('net'), ('new'), ('nut'), ('pad'), ('pan'), ('pea'), ('pen'), ('pet'),
  ('pup'), ('ram'), ('ray'), ('red'), ('rug'), ('run'), ('rye'), ('sap'), ('saw'), ('sea'),
  ('sky'), ('spa'), ('sub'), ('sum'), ('sun'), ('tag'), ('tan'), ('tea'), ('tub'), ('tug'),
  ('van'), ('vet'), ('wax'), ('way'), ('web'), ('yak'), ('yam'), ('yes')
ON CONFLICT (word) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. 중복 검사 — 기본 아이디 키도 대조 (바뀐 기본 아이디를 다른 회원이 못 가져감)
CREATE OR REPLACE FUNCTION public.dibay_id_candidate_error(p_user_id uuid, p_normalized text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
        OR lower(btrim(p.dibay_id_initial)) = lower(btrim(p_normalized))  -- v3: 기본 아이디
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
        OR p.dibay_id_initial_key = v_key  -- v3: 기본 아이디
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
-- 6. 자동 발급 — 숫자 5자리 + 영어 3글자. 아이디가 이미 있으면 절대 다시 발급하지 않는다.
CREATE OR REPLACE FUNCTION public.assign_auto_dibay_id(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_candidate text;
  v_word text;
  v_now timestamptz := now();
  v_attempt int := 0;
  v_max_attempts constant int := 48;
  v_auto_re constant text := '^(dibay_[a-f0-9]{6}|dibay[0-9]{6,7}|[0-9]{5}[a-z]{3})$';
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

  -- v3: 회원 아이디가 있으면 그대로 (자동 아이디 그대로면 idempotent, 아니면 skipped)
  IF v_row.dibay_id IS NOT NULL AND btrim(v_row.dibay_id) <> '' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dibay_id', lower(btrim(v_row.dibay_id)),
      'idempotent', true,
      'skipped', NOT (
        COALESCE(v_row.dibay_id_auto_assigned, false)
        AND NOT COALESCE(v_row.dibay_id_changed_once, false)
      )
    );
  END IF;

  IF v_row.username_confirmed = true
     AND v_row.username IS NOT NULL
     AND btrim(v_row.username) <> ''
     AND lower(btrim(v_row.username)) !~ v_auto_re THEN
    RETURN jsonb_build_object('ok', false, 'error', 'skip_user_confirmed');
  END IF;

  -- 기본 아이디가 이미 있는데 회원 아이디만 비어 있는 행 — 기본 아이디는 바꿀 수 없으므로 발급하지 않는다
  IF v_row.dibay_id_initial IS NOT NULL AND btrim(v_row.dibay_id_initial) <> '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_initial_exists');
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > v_max_attempts THEN
      RETURN jsonb_build_object('ok', false, 'error', 'assign_collision_exhausted');
    END IF;

    SELECT w.word INTO v_word
    FROM public.dibay_id_wordlist w
    WHERE w.enabled = true
    ORDER BY random()
    LIMIT 1;
    IF v_word IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wordlist_empty');
    END IF;

    v_candidate := lpad(floor(random() * 100000)::int::text, 5, '0') || v_word;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.dibay_id_key = v_candidate
         OR p.dibay_id_initial_key = v_candidate
         OR lower(btrim(p.username)) = v_candidate
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
-- 7. 회원 1회 변경 — 운영 정의 그대로, 시스템 전용 모양에 숫자5+영어3 추가 (표시한 줄)
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
  -- v3: 숫자5+영어3 자동 아이디 모양 추가
  IF v_normalized ~ '^(dibay_[a-f0-9]{6}|dibay[0-9]{6,7}|[0-9]{5}[a-z]{3})$' THEN
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
      RETURN jsonb_build_object('ok', true, 'dibay_id', lower(btrim(v_row.dibay_id)), 'idempotent', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_change_limit');
  END IF;

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
      RETURN jsonb_build_object('ok', true, 'dibay_id', lower(btrim(v_row.dibay_id)), 'idempotent', true);
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
-- 8. 관리자 아이디 변경 — 운영 정의 그대로, 시스템 전용 모양에 숫자5+영어3 추가 (표시한 줄)
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
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF char_length(v_reason) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_too_long');
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
  -- v3: 숫자5+영어3 자동 아이디 모양 추가
  IF v_normalized ~ '^(dibay_[a-f0-9]{6}|dibay[0-9]{6,7}|[0-9]{5}[a-z]{3})$' THEN
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

-- ---------------------------------------------------------------------------
-- 9. 관리자 — 본인 변경권 다시 주기 (사유 필수, 감사 기록)
CREATE OR REPLACE FUNCTION public.admin_grant_dibay_id_change(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_reason text := nullif(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_target_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF char_length(v_reason) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_too_long');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;
  IF v_row.dibay_id IS NULL OR btrim(v_row.dibay_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_required');
  END IF;
  -- 이미 변경 가능하면 줄 것이 없다 (dibay_id_can_change 와 같은 식)
  IF v_row.dibay_id_can_change THEN
    RETURN jsonb_build_object('ok', false, 'error', 'change_right_available');
  END IF;

  UPDATE public.profiles
  SET
    dibay_id_changed_once = false,
    dibay_id_locked = false,
    updated_at = now()
  WHERE id = p_target_user_id;

  INSERT INTO public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  VALUES (
    'admin',
    p_actor_user_id,
    'member',
    p_target_user_id::text,
    'admin_member_dibay_id_change_grant',
    jsonb_build_object(
      'dibay_id', lower(btrim(v_row.dibay_id)),
      'dibay_id_changed_once', COALESCE(v_row.dibay_id_changed_once, false),
      'dibay_id_locked', COALESCE(v_row.dibay_id_locked, false)
    ),
    jsonb_build_object(
      'dibay_id_changed_once', false,
      'dibay_id_locked', false,
      'reason', v_reason,
      'via', 'admin_grant_dibay_id_change'
    )
  );

  RETURN jsonb_build_object('ok', true, 'dibay_id', lower(btrim(v_row.dibay_id)));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_grant_dibay_id_change(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_dibay_id_change(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. 친구 찾기 설정 (연락처 동기화 설정 표와 분리 — 그 표는 연락처 동의자만 행이 있다)
CREATE TABLE IF NOT EXISTS public.member_discovery_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  allow_id_search boolean NOT NULL DEFAULT true,
  allow_qr_add boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_discovery_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.member_discovery_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_discovery_settings TO service_role;

-- ---------------------------------------------------------------------------
-- 11. QR 토큰 — 아이디를 담지 않는 무작위 22자 (16바이트 base64url)
CREATE TABLE IF NOT EXISTS public.member_friend_qr (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  regenerated_at timestamptz,
  scan_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.member_friend_qr ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.member_friend_qr FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_friend_qr TO service_role;

CREATE OR REPLACE FUNCTION public.member_friend_qr_new_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path TO 'public'
AS $function$
  SELECT translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_');
$function$;

REVOKE ALL ON FUNCTION public.member_friend_qr_new_token() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_friend_qr_new_token() TO service_role;

-- 내 QR 토큰 (없으면 만든다)
CREATE OR REPLACE FUNCTION public.member_friend_qr_ensure(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;
  INSERT INTO public.member_friend_qr (user_id, token)
  VALUES (p_user_id, public.member_friend_qr_new_token())
  ON CONFLICT (user_id) DO NOTHING;
  SELECT q.token INTO v_token FROM public.member_friend_qr q WHERE q.user_id = p_user_id;
  RETURN jsonb_build_object('ok', true, 'token', v_token);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_token_collision');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
END;
$function$;

REVOKE ALL ON FUNCTION public.member_friend_qr_ensure(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_friend_qr_ensure(uuid) TO service_role;

-- QR 다시 만들기 — 옛 토큰 즉시 무효
CREATE OR REPLACE FUNCTION public.member_friend_qr_regenerate(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text := public.member_friend_qr_new_token();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;
  INSERT INTO public.member_friend_qr (user_id, token, regenerated_at)
  VALUES (p_user_id, v_token, now())
  ON CONFLICT (user_id) DO UPDATE
    SET token = excluded.token,
        regenerated_at = excluded.regenerated_at,
        scan_count = 0;
  RETURN jsonb_build_object('ok', true, 'token', v_token);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_token_collision');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
END;
$function$;

REVOKE ALL ON FUNCTION public.member_friend_qr_regenerate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_friend_qr_regenerate(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 12. 친구가 된 경로
ALTER TABLE public.community_friend_requests
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.community_friend_requests
  DROP CONSTRAINT IF EXISTS community_friend_requests_source_check;
ALTER TABLE public.community_friend_requests
  ADD CONSTRAINT community_friend_requests_source_check
  CHECK (source IS NULL OR source IN ('id_search', 'qr', 'contacts', 'profile'));

-- ---------------------------------------------------------------------------
-- 13. 친구 찾기 (설계안 §3.3) — 조건·정렬·차단·설정을 DB 한 곳에서
--   입력: 앞뒤 공백·앞의 @ 제거, 소문자. 아이디 비교 키 = 영문 소문자·숫자만 남긴 값.
--   auto        : 숫자 5자리 = 아이디 앞 5자리, 또는 아이디 전체
--   auto_legacy : 아이디 전체(키)만
--   custom      : 키 4자 이상 앞부분·포함, 또는 아이디 전체 · 닉네임 2자 이상 포함
--   기본 아이디(dibay_id_initial)는 회원 친구 찾기에 쓰지 않는다.
CREATE OR REPLACE FUNCTION public.cm_search_members(
  p_viewer uuid,
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  user_id uuid,
  dibay_id text,
  nickname text,
  display_name text,
  avatar_url text,
  match_kind text,
  match_rank integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_text text := regexp_replace(lower(btrim(COALESCE(p_query, ''))), '^@+', '');
  v_key text;
  v_limit integer := least(greatest(COALESCE(p_limit, 20), 1), 50);
BEGIN
  v_text := btrim(v_text);
  v_key := regexp_replace(v_text, '[^a-z0-9]', '', 'g');
  IF p_viewer IS NULL OR char_length(v_text) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH cand AS (
    SELECT
      p.id AS cid,
      p.dibay_id AS cdibay,
      p.nickname AS cnick,
      p.display_name AS cdisplay,
      p.avatar_url AS cavatar,
      p.dibay_id_state AS cstate,
      COALESCE(p.dibay_id_key, '') AS ckey
    FROM public.profiles p
    WHERE p.id <> p_viewer
      AND p.deleted_at IS NULL
      AND COALESCE(p.status, '') <> 'deleted'
      AND p.dibay_id IS NOT NULL
      AND btrim(p.dibay_id) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.member_discovery_settings s
        WHERE s.user_id = p.id AND s.allow_id_search = false
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_social_relations r
        WHERE r.relation_type = 'blocked' AND r.is_active IS TRUE
          AND (
            (r.owner_user_id = p_viewer AND r.target_user_id = p.id)
            OR (r.owner_user_id = p.id AND r.target_user_id = p_viewer)
          )
      )
  ),
  ranked AS (
    SELECT
      cand.*,
      CASE
        WHEN v_key <> '' AND cand.ckey = v_key THEN 0
        WHEN cand.cstate = 'auto' AND v_key ~ '^[0-9]{5}$' AND left(cand.ckey, 5) = v_key THEN 1
        WHEN cand.cstate = 'custom' AND char_length(v_key) >= 4 AND left(cand.ckey, char_length(v_key)) = v_key THEN 1
        WHEN cand.cstate = 'custom' AND char_length(v_key) >= 4 AND strpos(cand.ckey, v_key) > 0 THEN 2
        WHEN cand.cstate = 'custom'
             AND (
               strpos(lower(COALESCE(cand.cnick, '')), v_text) > 0
               OR strpos(lower(COALESCE(cand.cdisplay, '')), v_text) > 0
             ) THEN 3
        ELSE NULL
      END AS crank
    FROM cand
  )
  SELECT
    ranked.cid,
    ranked.cdibay,
    ranked.cnick,
    ranked.cdisplay,
    ranked.cavatar,
    CASE ranked.crank
      WHEN 0 THEN 'exact'
      WHEN 1 THEN 'prefix'
      WHEN 2 THEN 'contains'
      ELSE 'name'
    END,
    ranked.crank
  FROM ranked
  WHERE ranked.crank IS NOT NULL
  ORDER BY ranked.crank, ranked.cdibay
  LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.cm_search_members(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cm_search_members(uuid, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 14. QR 친구 추가 — 스캔한 사람과 QR 주인을 바로 친구로 (cm_accept_friend_request 와 같은 쓰기, 같은 쌍 잠금)
CREATE OR REPLACE FUNCTION public.cm_add_friend_via_qr(p_viewer uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_owner_row public.profiles%ROWTYPE;
  v_now timestamptz := now();
  v_ab boolean;
  v_ba boolean;
BEGIN
  IF p_viewer IS NULL OR p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{22}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_invalid');
  END IF;

  SELECT q.user_id INTO v_owner FROM public.member_friend_qr q WHERE q.token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_invalid');
  END IF;
  IF v_owner = p_viewer THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_self');
  END IF;

  SELECT * INTO v_owner_row FROM public.profiles WHERE id = v_owner;
  IF NOT FOUND OR v_owner_row.deleted_at IS NOT NULL OR COALESCE(v_owner_row.status, '') = 'deleted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_invalid');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_discovery_settings s
    WHERE s.user_id = v_owner AND s.allow_qr_add = false
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_disabled');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      least(p_viewer::text, v_owner::text) || ':' || greatest(p_viewer::text, v_owner::text),
      0
    )
  );

  IF EXISTS (
    SELECT 1 FROM public.user_social_relations r
    WHERE r.relation_type = 'blocked' AND r.is_active IS TRUE
      AND (
        (r.owner_user_id = p_viewer AND r.target_user_id = v_owner)
        OR (r.owner_user_id = v_owner AND r.target_user_id = p_viewer)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'blocked_target');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_social_relations r
    WHERE r.owner_user_id = p_viewer AND r.target_user_id = v_owner
      AND r.relation_type = 'friend' AND r.is_active IS TRUE
  ) INTO v_ab;
  SELECT EXISTS (
    SELECT 1 FROM public.user_social_relations r
    WHERE r.owner_user_id = v_owner AND r.target_user_id = p_viewer
      AND r.relation_type = 'friend' AND r.is_active IS TRUE
  ) INTO v_ba;

  UPDATE public.member_friend_qr SET scan_count = scan_count + 1 WHERE user_id = v_owner;

  IF v_ab AND v_ba THEN
    RETURN jsonb_build_object('ok', true, 'peer_user_id', v_owner, 'status', 'accepted', 'idempotent', true);
  END IF;

  INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, is_active, created_at, last_action_at, updated_at)
  VALUES (p_viewer, v_owner, 'friend', true, v_now, v_now, v_now)
  ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
    SET relation_type = 'friend',
        is_active = true,
        last_action_at = excluded.last_action_at,
        updated_at = excluded.updated_at
    WHERE public.user_social_relations.relation_type IS DISTINCT FROM 'friend'
       OR public.user_social_relations.is_active IS DISTINCT FROM true;

  INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, is_active, created_at, last_action_at, updated_at)
  VALUES (v_owner, p_viewer, 'friend', true, v_now, v_now, v_now)
  ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
    SET relation_type = 'friend',
        is_active = true,
        last_action_at = excluded.last_action_at,
        updated_at = excluded.updated_at
    WHERE public.user_social_relations.relation_type IS DISTINCT FROM 'friend'
       OR public.user_social_relations.is_active IS DISTINCT FROM true;

  -- 요청 기록: 스캔한 사람 → QR 주인 (accepted, source qr). QR 을 보여 준 것이 동의이므로 이전 거절도 덮는다.
  INSERT INTO public.community_friend_requests (requester_id, addressee_id, status, note, responded_at, source)
  VALUES (p_viewer, v_owner, 'accepted', '', v_now, 'qr')
  ON CONFLICT (requester_id, addressee_id) DO UPDATE
    SET status = 'accepted',
        responded_at = excluded.responded_at,
        source = 'qr';

  -- 반대 방향 대기 요청 정리
  UPDATE public.community_friend_requests
  SET status = 'accepted', responded_at = v_now
  WHERE requester_id = v_owner AND addressee_id = p_viewer AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'peer_user_id', v_owner, 'status', 'accepted');
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.cm_add_friend_via_qr(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cm_add_friend_via_qr(uuid, text) TO service_role;

-- QR 미리보기 — 토큰 → QR 주인 (스캔 결과 시트·웹 /f 용). 실패는 한 가지로.
CREATE OR REPLACE FUNCTION public.member_friend_qr_resolve(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_row public.profiles%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{22}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_invalid');
  END IF;
  SELECT q.user_id INTO v_owner FROM public.member_friend_qr q WHERE q.token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_invalid');
  END IF;
  SELECT * INTO v_row FROM public.profiles WHERE id = v_owner;
  IF NOT FOUND OR v_row.deleted_at IS NOT NULL OR COALESCE(v_row.status, '') = 'deleted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_invalid');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.member_discovery_settings s
    WHERE s.user_id = v_owner AND s.allow_qr_add = false
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_disabled');
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_owner,
    'dibay_id', lower(btrim(v_row.dibay_id)),
    'nickname', v_row.nickname,
    'display_name', v_row.display_name,
    'avatar_url', v_row.avatar_url
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.member_friend_qr_resolve(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_friend_qr_resolve(text) TO service_role;

COMMIT;
