-- 메신저 연락처 동기화 1a (Owner 「1a 진행」 2026-11-10) — SSOT docs/design/messenger-contacts-sync-plan.md v5 §6·§7·§8.
-- 범위: 표·서버 함수·어드민 설정(기능 꺼짐). 트리거(1b)·화면(2)·가입 안내 발송(3)·통화(4) 없음.
-- 이 마이그레이션만으로 회원 화면·기존 메신저·친구·거래·주문·알림·통화 동작은 바뀌지 않는다:
--   · 기존 표·함수·트리거를 고치지 않는다 (신규 객체만).
--   · messenger_contacts_admin_settings.enabled 기본 false → 모든 연락처 API 가 「사용 안 함」.
-- 접근: 전부 service_role 전용 (RLS 켬 · 정책 없음 · anon/authenticated 권한 회수).
-- 번호: 원 번호는 저장하지 않는다. phone_hmac = HMAC-SHA256(E.164, CONTACTS_PHONE_HMAC_KEY) 32바이트 (서버 TS 가 계산).
-- 운영 적용: Owner 별도 승인 후. 롤백: 파일 끝 「롤백」 블록.

-- ───────────────────────── 어드민 설정 (1행 · revision 저장)
CREATE TABLE IF NOT EXISTS public.messenger_contacts_admin_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  join_notice_enabled boolean NOT NULL DEFAULT false,
  join_notice_cap integer NOT NULL DEFAULT 200 CHECK (join_notice_cap BETWEEN 0 AND 1000),
  daily_new_number_limit integer NOT NULL DEFAULT 3000 CHECK (daily_new_number_limit BETWEEN 100 AND 20000),
  request_number_limit integer NOT NULL DEFAULT 1000 CHECK (request_number_limit BETWEEN 100 AND 2000),
  idle_source_days integer NOT NULL DEFAULT 180 CHECK (idle_source_days BETWEEN 30 AND 730),
  default_discovery_policy text NOT NULL DEFAULT 'everyone' CHECK (default_discovery_policy IN ('everyone', 'mutual', 'nobody')),
  consent_version text NOT NULL DEFAULT 'v1' CHECK (char_length(consent_version) BETWEEN 1 AND 32),
  revision bigint NOT NULL DEFAULT 0,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.messenger_contacts_admin_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.messenger_contacts_admin_settings_logs (
  id bigserial PRIMARY KEY,
  revision bigint NOT NULL,
  actor_id uuid NULL,
  before_json jsonb NOT NULL,
  after_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── 계정 공통
CREATE TABLE IF NOT EXISTS public.member_phone_lookup (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  phone_hmac bytea NOT NULL UNIQUE CHECK (octet_length(phone_hmac) = 32),
  key_version smallint NOT NULL DEFAULT 1,
  phone_verified_at_snapshot timestamptz NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messenger_contact_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  consented_at timestamptz NULL,
  consent_version text NULL,
  withdrawn_at timestamptz NULL,
  account_sync_enabled boolean NOT NULL DEFAULT true,
  -- NULL = 어드민 기본값
  discovery_policy text NULL CHECK (discovery_policy IS NULL OR discovery_policy IN ('everyone', 'mutual', 'nobody')),
  join_notify_enabled boolean NOT NULL DEFAULT true,
  call_default text NOT NULL DEFAULT 'ask' CHECK (call_default IN ('ask', 'dibay', 'phone')),
  account_list_version bigint NOT NULL DEFAULT 0,
  new_numbers_day date NULL,
  new_numbers_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 재추천 제한 — 외래키 없음 (1b 트리거가 계정 연쇄 삭제 중에도 실패하지 않게). 고아는 매일 정리.
CREATE TABLE IF NOT EXISTS public.contact_suppressions (
  owner_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('hidden', 'former_friend')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, target_user_id)
);

-- 재추천 제한 기록 실패분 (1b 트리거 2차 기록) — 제약 최소. 미복구 행도 목록에서 제외한다.
CREATE TABLE IF NOT EXISTS public.contact_suppression_failures (
  id bigserial PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  reason text NOT NULL,
  sqlstate text NULL,
  message text NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS contact_suppression_failures_open_idx
  ON public.contact_suppression_failures (owner_user_id, target_user_id) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS public.contact_join_notices (
  owner_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  joined_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, joined_user_id)
);

-- ───────────────────────── 기기별 출처
CREATE TABLE IF NOT EXISTS public.contact_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- sha256(user_id ‖ ':' ‖ client_instance_id) — 계정에 묶인 불투명 값, 하드웨어 ID 아님
  install_ref bytea NOT NULL CHECK (octet_length(install_ref) = 32),
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  sync_enabled boolean NOT NULL DEFAULT true,
  permission_state text NOT NULL DEFAULT 'unknown' CHECK (permission_state IN ('granted', 'limited', 'denied', 'unknown')),
  -- OS 권한 철회 안내 답 (#19): delete = 이 기기 연락처 삭제, keep = 업로드 중단만
  revoke_choice text NULL CHECK (revoke_choice IS NULL OR revoke_choice IN ('delete', 'keep')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  device_version bigint NOT NULL DEFAULT 0,
  generation integer NOT NULL DEFAULT 0,
  pending_generation integer NULL,
  pending_started_at timestamptz NULL,
  recent_batches jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recent_batches) = 'array'),
  resync_day date NULL,
  resync_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz NULL,
  CONSTRAINT contact_sources_user_install_key UNIQUE (user_id, install_ref)
);
CREATE INDEX IF NOT EXISTS contact_sources_active_last_used_idx
  ON public.contact_sources (last_used_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.contact_source_entries (
  source_id uuid NOT NULL REFERENCES public.contact_sources (id) ON DELETE CASCADE,
  phone_hmac bytea NOT NULL CHECK (octet_length(phone_hmac) = 32),
  client_ref text NOT NULL CHECK (char_length(client_ref) BETWEEN 1 AND 128),
  -- 이 행이 처음 확정된 세대 (source.generation 이하만 보임) / 마지막으로 다시 올라온 세대 (스냅숏 확정 판정용)
  generation integer NOT NULL,
  seen_generation integer NOT NULL,
  PRIMARY KEY (source_id, phone_hmac)
);
CREATE INDEX IF NOT EXISTS contact_source_entries_phone_hmac_idx ON public.contact_source_entries (phone_hmac);

-- ───────────────────────── 권한
ALTER TABLE public.messenger_contacts_admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_contacts_admin_settings_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_phone_lookup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_contact_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_suppression_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_join_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_source_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.messenger_contacts_admin_settings, public.messenger_contacts_admin_settings_logs,
  public.member_phone_lookup, public.messenger_contact_settings, public.contact_suppressions,
  public.contact_suppression_failures, public.contact_join_notices, public.contact_sources,
  public.contact_source_entries FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.messenger_contacts_admin_settings_logs_id_seq,
  public.contact_suppression_failures_id_seq FROM anon, authenticated;

-- ───────────────────────── 내부 도우미
-- 회원 연락처 목록 버전 +1 (회원 단위 행이 없으면 만들지 않는다 — 동의 전 회원은 목록이 없음)
CREATE OR REPLACE FUNCTION public.cm_contacts_bump_owner_versions(p_owner_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH u AS (
    UPDATE public.messenger_contact_settings
    SET account_list_version = account_list_version + 1, updated_at = now()
    WHERE user_id = ANY (coalesce(p_owner_ids, '{}'::uuid[]))
    RETURNING 1
  )
  SELECT count(*)::integer FROM u;
$function$;

-- 이 번호(변환값)를 연락처에 가진 「포함 출처」 회원들
CREATE OR REPLACE FUNCTION public.cm_contacts_owner_ids_for_hmac(p_hmac bytea, p_exclude uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(DISTINCT s.user_id), '{}'::uuid[])
  FROM public.contact_source_entries e
  JOIN public.contact_sources s ON s.id = e.source_id
  JOIN public.messenger_contact_settings st ON st.user_id = s.user_id
  WHERE e.phone_hmac = p_hmac
    AND e.generation <= s.generation
    AND s.status = 'active'
    AND st.consented_at IS NOT NULL AND st.withdrawn_at IS NULL AND st.account_sync_enabled
    AND s.user_id IS DISTINCT FROM p_exclude;
$function$;

-- ───────────────────────── 어드민 설정 저장 (읽은 revision 일 때만)
CREATE OR REPLACE FUNCTION public.save_messenger_contacts_admin_settings_cas(
  p_expected_revision bigint,
  p_enabled boolean,
  p_join_notice_enabled boolean,
  p_join_notice_cap integer,
  p_daily_new_number_limit integer,
  p_request_number_limit integer,
  p_idle_source_days integer,
  p_default_discovery_policy text,
  p_consent_version text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.messenger_contacts_admin_settings%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_rev bigint;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_expected_revision');
  END IF;
  INSERT INTO public.messenger_contacts_admin_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_row FROM public.messenger_contacts_admin_settings WHERE id = 1 FOR UPDATE;
  IF v_row.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_revision', 'current_revision', v_row.revision);
  END IF;
  v_before := to_jsonb(v_row) - 'id' - 'revision' - 'updated_by' - 'updated_at';
  v_rev := v_row.revision + 1;
  BEGIN
    UPDATE public.messenger_contacts_admin_settings
    SET enabled = coalesce(p_enabled, v_row.enabled),
        join_notice_enabled = coalesce(p_join_notice_enabled, v_row.join_notice_enabled),
        join_notice_cap = coalesce(p_join_notice_cap, v_row.join_notice_cap),
        daily_new_number_limit = coalesce(p_daily_new_number_limit, v_row.daily_new_number_limit),
        request_number_limit = coalesce(p_request_number_limit, v_row.request_number_limit),
        idle_source_days = coalesce(p_idle_source_days, v_row.idle_source_days),
        default_discovery_policy = coalesce(p_default_discovery_policy, v_row.default_discovery_policy),
        consent_version = coalesce(p_consent_version, v_row.consent_version),
        revision = v_rev,
        updated_by = p_actor_id,
        updated_at = now()
    WHERE id = 1
    RETURNING * INTO v_row;
  EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_value');
  END;
  v_after := to_jsonb(v_row) - 'id' - 'revision' - 'updated_by' - 'updated_at';
  INSERT INTO public.messenger_contacts_admin_settings_logs (revision, actor_id, before_json, after_json)
  VALUES (v_rev, p_actor_id, v_before, v_after);
  RETURN jsonb_build_object('ok', true, 'revision', v_rev);
END;
$function$;

-- ───────────────────────── 동의 (기존·신규 회원 공통 · 동의한 순간 번호 등록)
-- p_phone_hmac NULL = 인증 번호 없는 회원 (등록 없이 동의만 — 다른 회원에게는 보이지 않음)
CREATE OR REPLACE FUNCTION public.cm_contacts_consent(
  p_user uuid,
  p_consent_version text,
  p_phone_hmac bytea,
  p_key_version smallint,
  p_phone_verified_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_had_lookup boolean;
  v_old_hmac bytea;
  v_owners uuid[] := '{}'::uuid[];
  v_profile_created timestamptz;
BEGIN
  IF p_user IS NULL OR p_consent_version IS NULL OR char_length(p_consent_version) NOT BETWEEN 1 AND 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;
  SELECT created_at INTO v_profile_created FROM public.profiles WHERE id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  INSERT INTO public.messenger_contact_settings (user_id, consented_at, consent_version)
  VALUES (p_user, now(), p_consent_version)
  ON CONFLICT (user_id) DO UPDATE
    SET consented_at = now(), consent_version = excluded.consent_version, withdrawn_at = NULL,
        account_sync_enabled = true, account_list_version = messenger_contact_settings.account_list_version + 1,
        updated_at = now();

  SELECT phone_hmac INTO v_old_hmac FROM public.member_phone_lookup WHERE user_id = p_user;
  v_had_lookup := FOUND;

  IF p_phone_hmac IS NOT NULL THEN
    IF octet_length(p_phone_hmac) <> 32 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'bad_hash');
    END IF;
    -- 같은 번호의 낡은 등록(번호를 바꾼 다른 회원)은 지운다 — profiles 번호는 유일하므로 현재 소유자는 p_user
    DELETE FROM public.member_phone_lookup WHERE phone_hmac = p_phone_hmac AND user_id <> p_user;
    INSERT INTO public.member_phone_lookup (user_id, phone_hmac, key_version, phone_verified_at_snapshot)
    VALUES (p_user, p_phone_hmac, coalesce(p_key_version, 1), p_phone_verified_at)
    ON CONFLICT (user_id) DO UPDATE
      SET phone_hmac = excluded.phone_hmac, key_version = excluded.key_version,
          phone_verified_at_snapshot = excluded.phone_verified_at_snapshot, updated_at = now();
    v_owners := public.cm_contacts_owner_ids_for_hmac(p_phone_hmac, p_user);
  END IF;
  IF v_old_hmac IS NOT NULL AND v_old_hmac IS DISTINCT FROM p_phone_hmac THEN
    v_owners := v_owners || public.cm_contacts_owner_ids_for_hmac(v_old_hmac, p_user);
    IF p_phone_hmac IS NULL THEN
      DELETE FROM public.member_phone_lookup WHERE user_id = p_user;
    END IF;
  END IF;
  PERFORM public.cm_contacts_bump_owner_versions(v_owners);

  RETURN jsonb_build_object(
    'ok', true,
    'registered_phone', p_phone_hmac IS NOT NULL,
    'first_registration', p_phone_hmac IS NOT NULL AND NOT v_had_lookup,
    -- 가입 안내 대상 판정 (3단계 발송용): 가입 7일 안 + 처음 등록
    'join_notice_eligible', p_phone_hmac IS NOT NULL AND NOT v_had_lookup AND v_profile_created > now() - interval '7 days',
    'owners_bumped', coalesce(array_length(v_owners, 1), 0)
  );
END;
$function$;

-- ───────────────────────── 동의 철회 (올린 연락처 + 번호 등록 삭제, 동의 기록은 남김)
CREATE OR REPLACE FUNCTION public.cm_contacts_withdraw(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hmac bytea;
  v_sources integer;
BEGIN
  SELECT phone_hmac INTO v_hmac FROM public.member_phone_lookup WHERE user_id = p_user;
  IF v_hmac IS NOT NULL THEN
    PERFORM public.cm_contacts_bump_owner_versions(public.cm_contacts_owner_ids_for_hmac(v_hmac, p_user));
  END IF;
  DELETE FROM public.member_phone_lookup WHERE user_id = p_user;
  DELETE FROM public.contact_source_entries e USING public.contact_sources s
  WHERE e.source_id = s.id AND s.user_id = p_user;
  UPDATE public.contact_sources SET status = 'removed', removed_at = now(), pending_generation = NULL
  WHERE user_id = p_user AND status = 'active';
  GET DIAGNOSTICS v_sources = ROW_COUNT;
  UPDATE public.messenger_contact_settings
  SET withdrawn_at = now(), account_sync_enabled = false, account_list_version = account_list_version + 1, updated_at = now()
  WHERE user_id = p_user;
  RETURN jsonb_build_object('ok', true, 'sources_removed', v_sources);
END;
$function$;

-- ───────────────────────── 계정 전체 연락처 삭제 (출처 전부 · 친구·숨김·차단·재추천 제한 유지)
CREATE OR REPLACE FUNCTION public.cm_contacts_delete_all(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sources integer;
BEGIN
  DELETE FROM public.contact_source_entries e USING public.contact_sources s
  WHERE e.source_id = s.id AND s.user_id = p_user;
  UPDATE public.contact_sources SET status = 'removed', removed_at = now(), pending_generation = NULL
  WHERE user_id = p_user AND status = 'active';
  GET DIAGNOSTICS v_sources = ROW_COUNT;
  PERFORM public.cm_contacts_bump_owner_versions(ARRAY[p_user]);
  RETURN jsonb_build_object('ok', true, 'sources_removed', v_sources);
END;
$function$;

-- ───────────────────────── 출처 등록·재사용 (+ 하루 1회 사용 갱신)
CREATE OR REPLACE FUNCTION public.cm_contacts_register_source(p_user uuid, p_install_ref bytea, p_platform text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_set public.messenger_contact_settings%ROWTYPE;
  v_src public.contact_sources%ROWTYPE;
  v_reactivated boolean := false;
  v_created boolean := false;
BEGIN
  IF p_install_ref IS NULL OR octet_length(p_install_ref) <> 32 OR p_platform NOT IN ('android', 'ios') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;
  SELECT * INTO v_set FROM public.messenger_contact_settings WHERE user_id = p_user;
  IF NOT FOUND OR v_set.consented_at IS NULL OR v_set.withdrawn_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consent_required');
  END IF;

  SELECT * INTO v_src FROM public.contact_sources WHERE user_id = p_user AND install_ref = p_install_ref FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.contact_sources (user_id, install_ref, platform)
    VALUES (p_user, p_install_ref, p_platform)
    ON CONFLICT ON CONSTRAINT contact_sources_user_install_key DO NOTHING
    RETURNING * INTO v_src;
    IF v_src.id IS NULL THEN
      SELECT * INTO v_src FROM public.contact_sources WHERE user_id = p_user AND install_ref = p_install_ref FOR UPDATE;
    ELSE
      v_created := true;
    END IF;
  END IF;

  IF v_src.status = 'removed' THEN
    -- 삭제된 출처를 같은 설치가 다시 씀 → 버전을 올려 낡은 기기 상태(base_version)는 409 로 전체 스냅숏
    UPDATE public.contact_sources
    SET status = 'active', removed_at = NULL, sync_enabled = true, permission_state = 'unknown', revoke_choice = NULL,
        device_version = device_version + 1, generation = generation + 1, pending_generation = NULL,
        pending_started_at = NULL, recent_batches = '[]'::jsonb, platform = p_platform, last_used_at = now()
    WHERE id = v_src.id
    RETURNING * INTO v_src;
    v_reactivated := true;
  ELSIF NOT v_created AND v_src.last_used_at < now() - interval '1 hour' THEN
    UPDATE public.contact_sources SET last_used_at = now(), platform = p_platform WHERE id = v_src.id
    RETURNING * INTO v_src;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'source_id', v_src.id,
    'created', v_created,
    'reactivated', v_reactivated,
    'device_version', v_src.device_version,
    'generation', v_src.generation,
    'sync_enabled', v_src.sync_enabled,
    'permission_state', v_src.permission_state,
    'revoke_choice', v_src.revoke_choice,
    'account_sync_enabled', v_set.account_sync_enabled
  );
END;
$function$;

-- ───────────────────────── 이 기기 상태 변경 (동기화 켜기/끄기 · 권한 상태 · #19 철회 답)
CREATE OR REPLACE FUNCTION public.cm_contacts_patch_source(
  p_user uuid,
  p_source uuid,
  p_install_ref bytea,
  p_sync_enabled boolean,
  p_permission_state text,
  p_revoke_choice text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_src public.contact_sources%ROWTYPE;
  v_removed boolean := false;
BEGIN
  SELECT * INTO v_src FROM public.contact_sources WHERE id = p_source AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_src.install_ref IS DISTINCT FROM p_install_ref THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_mismatch');
  END IF;
  IF v_src.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_inactive');
  END IF;
  IF p_permission_state IS NOT NULL AND p_permission_state NOT IN ('granted', 'limited', 'denied', 'unknown') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;
  IF p_revoke_choice IS NOT NULL AND p_revoke_choice NOT IN ('delete', 'keep') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;

  IF p_revoke_choice = 'delete' THEN
    DELETE FROM public.contact_source_entries WHERE source_id = v_src.id;
    UPDATE public.contact_sources
    SET status = 'removed', removed_at = now(), revoke_choice = 'delete', permission_state = 'denied',
        pending_generation = NULL, last_used_at = now()
    WHERE id = v_src.id;
    PERFORM public.cm_contacts_bump_owner_versions(ARRAY[p_user]);
    v_removed := true;
  ELSE
    UPDATE public.contact_sources
    SET sync_enabled = coalesce(p_sync_enabled, sync_enabled),
        permission_state = coalesce(p_permission_state, permission_state),
        -- 권한을 다시 허용하면 철회 답은 비운다
        revoke_choice = CASE
          WHEN p_revoke_choice IS NOT NULL THEN p_revoke_choice
          WHEN p_permission_state IN ('granted', 'limited') THEN NULL
          ELSE revoke_choice END,
        last_used_at = now()
    WHERE id = v_src.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'removed', v_removed);
END;
$function$;

-- ───────────────────────── 그 기기 연락처 삭제 (다른 기기 목록에서도 호출 — 설치 확인 없음, 계정 소유만)
CREATE OR REPLACE FUNCTION public.cm_contacts_delete_source(p_user uuid, p_source uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.contact_sources WHERE id = p_source AND user_id = p_user FOR UPDATE;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  DELETE FROM public.contact_source_entries WHERE source_id = v_id;
  UPDATE public.contact_sources SET status = 'removed', removed_at = now(), pending_generation = NULL
  WHERE id = v_id AND status = 'active';
  PERFORM public.cm_contacts_bump_owner_versions(ARRAY[p_user]);
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ───────────────────────── 업로드 (변경분 · 스냅숏 조각) — §7 규약 전체를 한 트랜잭션에서
-- p_add: [{"h":"<64 hex>","r":"<client_ref>"}] · p_remove: ["<64 hex>"]
-- 실패 코드: not_found · source_mismatch · consent_required · account_sync_off · source_inactive · device_sync_off ·
--           permission_denied · resync_required(409) · snapshot_in_progress(409) · snapshot_generation_mismatch(409) ·
--           resync_limit · daily_limit · too_many · bad_hash · bad_request
CREATE OR REPLACE FUNCTION public.cm_contacts_apply(
  p_user uuid,
  p_source uuid,
  p_install_ref bytea,
  p_batch_id text,
  p_kind text,
  p_base_version bigint,
  p_add jsonb,
  p_remove jsonb,
  p_generation integer,
  p_chunk_index integer,
  p_chunk_total integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_src public.contact_sources%ROWTYPE;
  v_set public.messenger_contact_settings%ROWTYPE;
  v_adm public.messenger_contacts_admin_settings%ROWTYPE;
  v_prev jsonb;
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_add_count integer := 0;
  v_rem_count integer := 0;
  v_new_numbers integer := 0;
  v_target_gen integer;
  v_committed boolean := false;
  v_result jsonb;
  v_member_touched boolean := false;
BEGIN
  IF p_batch_id IS NULL OR char_length(p_batch_id) NOT BETWEEN 8 AND 80 OR p_kind NOT IN ('delta', 'snapshot_chunk') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;
  IF p_add IS NOT NULL AND jsonb_typeof(p_add) <> 'array' OR p_remove IS NOT NULL AND jsonb_typeof(p_remove) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;
  v_add_count := coalesce(jsonb_array_length(p_add), 0);
  v_rem_count := coalesce(jsonb_array_length(p_remove), 0);

  SELECT * INTO v_adm FROM public.messenger_contacts_admin_settings WHERE id = 1;
  IF v_add_count + v_rem_count > coalesce(v_adm.request_number_limit, 1000) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;

  SELECT * INTO v_src FROM public.contact_sources WHERE id = p_source AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_src.install_ref IS DISTINCT FROM p_install_ref THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_mismatch');
  END IF;

  -- 중복 요청: 저장된 결과 그대로 (쓰기 없음)
  SELECT x->'r' INTO v_prev FROM jsonb_array_elements(v_src.recent_batches) x WHERE x->>'id' = p_batch_id LIMIT 1;
  IF v_prev IS NOT NULL THEN
    RETURN v_prev || jsonb_build_object('duplicate', true);
  END IF;

  SELECT * INTO v_set FROM public.messenger_contact_settings WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND OR v_set.consented_at IS NULL OR v_set.withdrawn_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consent_required');
  END IF;
  IF NOT v_set.account_sync_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_sync_off');
  END IF;
  IF v_src.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_inactive');
  END IF;
  IF NOT v_src.sync_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_sync_off');
  END IF;
  IF v_src.permission_state = 'denied' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  -- 해시 형식 (64자리 16진수)
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_add, '[]'::jsonb)) a
             WHERE coalesce(a->>'h', '') !~ '^[0-9a-f]{64}$' OR char_length(coalesce(a->>'r', '')) NOT BETWEEN 1 AND 128)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_remove, '[]'::jsonb)) h WHERE h !~ '^[0-9a-f]{64}$') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_hash');
  END IF;

  -- 하루 신규 번호 한도 (계정 단위, 필리핀 날짜)
  IF v_add_count > 0 THEN
    SELECT count(*)::integer INTO v_new_numbers
    FROM jsonb_array_elements(p_add) a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contact_source_entries e JOIN public.contact_sources s ON s.id = e.source_id
      WHERE s.user_id = p_user AND e.phone_hmac = decode(a->>'h', 'hex')
    );
    IF (CASE WHEN v_set.new_numbers_day = v_today THEN v_set.new_numbers_count ELSE 0 END) + v_new_numbers
       > coalesce(v_adm.daily_new_number_limit, 3000) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'daily_limit');
    END IF;
  END IF;

  IF p_kind = 'delta' THEN
    IF v_src.pending_generation IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'snapshot_in_progress', 'device_version', v_src.device_version);
    END IF;
    IF p_base_version IS DISTINCT FROM v_src.device_version THEN
      RETURN jsonb_build_object('ok', false, 'error', 'resync_required', 'device_version', v_src.device_version);
    END IF;
    IF v_rem_count > 0 THEN
      WITH d AS (
        DELETE FROM public.contact_source_entries e
        WHERE e.source_id = v_src.id
          AND e.phone_hmac IN (SELECT decode(h, 'hex') FROM jsonb_array_elements_text(p_remove) h)
        RETURNING e.phone_hmac
      )
      SELECT EXISTS (SELECT 1 FROM d JOIN public.member_phone_lookup l ON l.phone_hmac = d.phone_hmac) INTO v_member_touched;
    END IF;
    IF v_add_count > 0 THEN
      INSERT INTO public.contact_source_entries (source_id, phone_hmac, client_ref, generation, seen_generation)
      SELECT DISTINCT ON (decode(a->>'h', 'hex')) v_src.id, decode(a->>'h', 'hex'), a->>'r', v_src.generation, v_src.generation
      FROM jsonb_array_elements(p_add) a
      ORDER BY decode(a->>'h', 'hex')
      ON CONFLICT (source_id, phone_hmac) DO UPDATE SET client_ref = excluded.client_ref;
      v_member_touched := v_member_touched OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_add) a JOIN public.member_phone_lookup l ON l.phone_hmac = decode(a->>'h', 'hex')
      );
    END IF;
    v_committed := true;
  ELSE
    IF p_chunk_index IS NULL OR p_chunk_total IS NULL OR p_chunk_total < 1 OR p_chunk_total > 100
       OR p_chunk_index < 0 OR p_chunk_index >= p_chunk_total OR v_rem_count > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
    END IF;
    IF p_chunk_index = 0 THEN
      -- 재정렬 하루 3회 (첫 스냅숏 제외)
      IF v_src.generation > 0 THEN
        IF v_src.resync_day = v_today AND v_src.resync_count >= 3 THEN
          RETURN jsonb_build_object('ok', false, 'error', 'resync_limit');
        END IF;
        UPDATE public.contact_sources
        SET resync_count = CASE WHEN resync_day = v_today THEN resync_count + 1 ELSE 1 END, resync_day = v_today
        WHERE id = v_src.id;
      END IF;
      -- 버려진 세대 정리 후 새 세대 시작
      DELETE FROM public.contact_source_entries WHERE source_id = v_src.id AND generation > v_src.generation;
      v_target_gen := v_src.generation + 1;
      UPDATE public.contact_sources SET pending_generation = v_target_gen, pending_started_at = now()
      WHERE id = v_src.id;
    ELSE
      IF v_src.pending_generation IS NULL OR p_generation IS DISTINCT FROM v_src.pending_generation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'snapshot_generation_mismatch', 'device_version', v_src.device_version);
      END IF;
      v_target_gen := v_src.pending_generation;
    END IF;

    IF v_add_count > 0 THEN
      -- 새 번호는 generation = 새 세대(확정 전 안 보임), 이미 있는 번호는 seen_generation 만 갱신(계속 보임)
      INSERT INTO public.contact_source_entries (source_id, phone_hmac, client_ref, generation, seen_generation)
      SELECT DISTINCT ON (decode(a->>'h', 'hex')) v_src.id, decode(a->>'h', 'hex'), a->>'r', v_target_gen, v_target_gen
      FROM jsonb_array_elements(p_add) a
      ORDER BY decode(a->>'h', 'hex')
      ON CONFLICT (source_id, phone_hmac) DO UPDATE
        SET seen_generation = excluded.seen_generation, client_ref = excluded.client_ref;
    END IF;

    IF p_chunk_index = p_chunk_total - 1 THEN
      -- 확정: 이번 세대에 다시 오지 않은 번호 삭제 → 남은 행을 새 세대로
      DELETE FROM public.contact_source_entries WHERE source_id = v_src.id AND seen_generation < v_target_gen;
      UPDATE public.contact_source_entries SET generation = v_target_gen
      WHERE source_id = v_src.id AND generation <> v_target_gen;
      UPDATE public.contact_sources SET generation = v_target_gen, pending_generation = NULL, pending_started_at = NULL
      WHERE id = v_src.id;
      v_committed := true;
      v_member_touched := true;
    END IF;
  END IF;

  IF v_new_numbers > 0 THEN
    UPDATE public.messenger_contact_settings
    SET new_numbers_count = CASE WHEN new_numbers_day = v_today THEN new_numbers_count + v_new_numbers ELSE v_new_numbers END,
        new_numbers_day = v_today
    WHERE user_id = p_user;
  END IF;
  IF v_committed THEN
    UPDATE public.contact_sources
    SET device_version = device_version + 1, last_sync_at = now(), last_used_at = now()
    WHERE id = v_src.id
    RETURNING * INTO v_src;
    IF v_member_touched THEN
      PERFORM public.cm_contacts_bump_owner_versions(ARRAY[p_user]);
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'committed', v_committed,
    'device_version', v_src.device_version,
    'generation', coalesce(v_target_gen, v_src.generation)
  );
  UPDATE public.contact_sources
  SET recent_batches = (
    SELECT coalesce(jsonb_agg(x ORDER BY ord), '[]'::jsonb) FROM (
      SELECT x, ord FROM jsonb_array_elements(recent_batches) WITH ORDINALITY t(x, ord)
      ORDER BY ord DESC LIMIT 19
    ) k
  ) || jsonb_build_array(jsonb_build_object('id', p_batch_id, 'r', v_result))
  WHERE id = v_src.id;
  RETURN v_result;
END;
$function$;

-- ───────────────────────── 목록 (계정 기준 · 버전 토큰 같으면 not_modified)
-- 토큰 = 계정 목록 버전 + 내 친구·차단·요청 변화 표식 → 친구 코드 수정 없이 친구 변화도 반영
CREATE OR REPLACE FUNCTION public.cm_contacts_list(p_user uuid, p_source uuid, p_since_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_set public.messenger_contact_settings%ROWTYPE;
  v_default_policy text;
  v_my_hmac bytea;
  v_token text;
  v_rows jsonb;
  v_friends jsonb;
BEGIN
  SELECT * INTO v_set FROM public.messenger_contact_settings WHERE user_id = p_user;
  IF NOT FOUND OR v_set.consented_at IS NULL OR v_set.withdrawn_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consent_required');
  END IF;
  IF NOT v_set.account_sync_enabled THEN
    RETURN jsonb_build_object('ok', true, 'account_sync_off', true, 'token', NULL, 'members', '[]'::jsonb, 'friend_ids', '[]'::jsonb);
  END IF;

  SELECT md5(concat_ws('|',
    v_set.account_list_version,
    coalesce(p_source::text, '-'),
    (SELECT concat(count(*), ':', coalesce(max(updated_at)::text, '-')) FROM public.user_social_relations WHERE owner_user_id = p_user),
    (SELECT concat(count(*), ':', coalesce(max(updated_at)::text, '-')) FROM public.user_social_relations
       WHERE target_user_id = p_user AND relation_type = 'blocked'),
    (SELECT concat(count(*), ':', coalesce(max(coalesce(responded_at, created_at))::text, '-')) FROM public.community_friend_requests
       WHERE requester_id = p_user OR addressee_id = p_user)
  )) INTO v_token;
  IF p_since_token IS NOT NULL AND p_since_token = v_token THEN
    RETURN jsonb_build_object('ok', true, 'not_modified', true, 'token', v_token);
  END IF;

  SELECT default_discovery_policy INTO v_default_policy FROM public.messenger_contacts_admin_settings WHERE id = 1;
  v_default_policy := coalesce(v_default_policy, 'everyone');
  SELECT phone_hmac INTO v_my_hmac FROM public.member_phone_lookup WHERE user_id = p_user;

  WITH hm AS (
    SELECT e.phone_hmac,
           bool_or(e.source_id = p_source) AS on_this_device,
           max(CASE WHEN e.source_id = p_source THEN e.client_ref END) AS client_ref
    FROM public.contact_source_entries e
    JOIN public.contact_sources s ON s.id = e.source_id
    WHERE s.user_id = p_user AND s.status = 'active' AND e.generation <= s.generation
    GROUP BY e.phone_hmac
  ),
  m AS (
    SELECT l.user_id, l.registered_at, hm.on_this_device, hm.client_ref
    FROM hm JOIN public.member_phone_lookup l ON l.phone_hmac = hm.phone_hmac
    WHERE l.user_id <> p_user
  ),
  ok AS (
    SELECT m.*, p.nickname, p.username, p.dibay_id, p.avatar_url,
           EXISTS (SELECT 1 FROM public.user_social_relations f
                   WHERE f.owner_user_id = p_user AND f.target_user_id = m.user_id AND f.relation_type = 'friend') AS is_friend
    FROM m
    JOIN public.profiles p ON p.id = m.user_id
    LEFT JOIN public.messenger_contact_settings ts ON ts.user_id = m.user_id
    WHERE p.deleted_at IS NULL AND p.deletion_requested_at IS NULL AND coalesce(p.status, '') <> 'deleted'
      AND NOT EXISTS (SELECT 1 FROM public.user_social_relations b
                      WHERE b.relation_type = 'blocked'
                        AND ((b.owner_user_id = p_user AND b.target_user_id = m.user_id)
                          OR (b.owner_user_id = m.user_id AND b.target_user_id = p_user)))
      AND coalesce(ts.discovery_policy, v_default_policy) <> 'nobody'
      AND (coalesce(ts.discovery_policy, v_default_policy) <> 'mutual'
           OR (v_my_hmac IS NOT NULL AND EXISTS (
                 SELECT 1 FROM public.contact_source_entries e2 JOIN public.contact_sources s2 ON s2.id = e2.source_id
                 WHERE s2.user_id = m.user_id AND s2.status = 'active' AND e2.generation <= s2.generation
                   AND e2.phone_hmac = v_my_hmac)))
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'user_id', ok.user_id,
      'nickname', ok.nickname,
      'username', ok.username,
      'dibay_id', ok.dibay_id,
      'avatar_url', ok.avatar_url,
      'on_this_device', ok.on_this_device,
      'client_ref', ok.client_ref,
      'recently_joined', ok.registered_at > now() - interval '7 days',
      'request_state', CASE
        WHEN EXISTS (SELECT 1 FROM public.community_friend_requests r
                     WHERE r.requester_id = p_user AND r.addressee_id = ok.user_id AND r.status = 'pending') THEN 'sent'
        WHEN EXISTS (SELECT 1 FROM public.community_friend_requests r
                     WHERE r.requester_id = ok.user_id AND r.addressee_id = p_user AND r.status = 'pending') THEN 'received'
        ELSE 'none' END
    ) ORDER BY ok.registered_at DESC) FILTER (
      WHERE NOT ok.is_friend
        AND NOT EXISTS (SELECT 1 FROM public.contact_suppressions cs
                        WHERE cs.owner_user_id = p_user AND cs.target_user_id = ok.user_id)
        AND NOT EXISTS (SELECT 1 FROM public.contact_suppression_failures cf
                        WHERE cf.owner_user_id = p_user AND cf.target_user_id = ok.user_id AND cf.resolved_at IS NULL)
    ), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(ok.user_id)) FILTER (WHERE ok.is_friend), '[]'::jsonb)
  INTO v_rows, v_friends
  FROM ok;

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'members', v_rows, 'friend_ids', v_friends);
END;
$function$;

-- ───────────────────────── 가입 안내 대상 (3단계 발송이 사용 · 1a 는 계산만)
CREATE OR REPLACE FUNCTION public.cm_contacts_match_new_member(p_user uuid, p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hmac bytea;
  v_default_policy text;
  v_policy text;
  v_owners jsonb;
BEGIN
  SELECT phone_hmac INTO v_hmac FROM public.member_phone_lookup WHERE user_id = p_user;
  IF v_hmac IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'owner_ids', '[]'::jsonb);
  END IF;
  SELECT default_discovery_policy INTO v_default_policy FROM public.messenger_contacts_admin_settings WHERE id = 1;
  SELECT coalesce(discovery_policy, v_default_policy, 'everyone') INTO v_policy
  FROM public.messenger_contact_settings WHERE user_id = p_user;
  IF coalesce(v_policy, v_default_policy, 'everyone') <> 'everyone' THEN
    -- mutual·nobody 는 가입 안내 대상 아님 (상대가 나를 저장했는지만으로 알리지 않음)
    RETURN jsonb_build_object('ok', true, 'owner_ids', '[]'::jsonb);
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(o.uid)), '[]'::jsonb) INTO v_owners
  FROM (
    SELECT u AS uid FROM unnest(public.cm_contacts_owner_ids_for_hmac(v_hmac, p_user)) u
    JOIN public.messenger_contact_settings st ON st.user_id = u AND st.join_notify_enabled
    WHERE NOT EXISTS (SELECT 1 FROM public.contact_join_notices n WHERE n.owner_user_id = u AND n.joined_user_id = p_user)
      AND NOT EXISTS (SELECT 1 FROM public.user_social_relations b WHERE b.relation_type = 'blocked'
                      AND ((b.owner_user_id = u AND b.target_user_id = p_user) OR (b.owner_user_id = p_user AND b.target_user_id = u)))
      AND NOT EXISTS (SELECT 1 FROM public.contact_suppressions cs WHERE cs.owner_user_id = u AND cs.target_user_id = p_user)
    LIMIT greatest(coalesce(p_limit, 200), 0)
  ) o;
  RETURN jsonb_build_object('ok', true, 'owner_ids', v_owners);
END;
$function$;

-- ───────────────────────── 번호 등록 갱신 (매일 정리 작업 · 번호 변경 반영) — 변환값은 서버 TS 가 계산
CREATE OR REPLACE FUNCTION public.cm_contacts_lookup_refresh_candidates(p_limit integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', p.id, 'phone', p.phone, 'phone_country_code', p.phone_country_code, 'phone_verified_at', p.phone_verified_at
  )), '[]'::jsonb)
  FROM (
    SELECT p.id, p.phone, p.phone_country_code, p.phone_verified_at
    FROM public.messenger_contact_settings st
    JOIN public.profiles p ON p.id = st.user_id
    LEFT JOIN public.member_phone_lookup l ON l.user_id = st.user_id
    WHERE st.consented_at IS NOT NULL AND st.withdrawn_at IS NULL
      AND p.phone_verified AND coalesce(p.phone, '') <> ''
      AND (l.user_id IS NULL OR l.phone_verified_at_snapshot IS DISTINCT FROM p.phone_verified_at)
    ORDER BY st.user_id
    LIMIT greatest(coalesce(p_limit, 500), 0)
  ) p;
$function$;

CREATE OR REPLACE FUNCTION public.cm_contacts_lookup_upsert(
  p_user uuid, p_phone_hmac bytea, p_key_version smallint, p_phone_verified_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old bytea;
  v_owners uuid[] := '{}'::uuid[];
BEGIN
  IF p_phone_hmac IS NULL OR octet_length(p_phone_hmac) <> 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_hash');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.messenger_contact_settings
                 WHERE user_id = p_user AND consented_at IS NOT NULL AND withdrawn_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consent_required');
  END IF;
  SELECT phone_hmac INTO v_old FROM public.member_phone_lookup WHERE user_id = p_user;
  DELETE FROM public.member_phone_lookup WHERE phone_hmac = p_phone_hmac AND user_id <> p_user;
  INSERT INTO public.member_phone_lookup (user_id, phone_hmac, key_version, phone_verified_at_snapshot)
  VALUES (p_user, p_phone_hmac, coalesce(p_key_version, 1), p_phone_verified_at)
  ON CONFLICT (user_id) DO UPDATE
    SET phone_hmac = excluded.phone_hmac, key_version = excluded.key_version,
        phone_verified_at_snapshot = excluded.phone_verified_at_snapshot, updated_at = now();
  IF v_old IS DISTINCT FROM p_phone_hmac THEN
    v_owners := public.cm_contacts_owner_ids_for_hmac(p_phone_hmac, p_user);
    IF v_old IS NOT NULL THEN
      v_owners := v_owners || public.cm_contacts_owner_ids_for_hmac(v_old, p_user);
    END IF;
    PERFORM public.cm_contacts_bump_owner_versions(v_owners);
  END IF;
  RETURN jsonb_build_object('ok', true, 'changed', v_old IS DISTINCT FROM p_phone_hmac);
END;
$function$;

-- ───────────────────────── 매일 정리 (§8 · §5-3 복구) — p_dry_run 이면 건수만
CREATE OR REPLACE FUNCTION public.cm_contacts_daily_maintenance(p_dry_run boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_idle_days integer;
  v_idle integer := 0;
  v_stale_lookup integer := 0;
  v_orphan_supp integer := 0;
  v_recovered integer := 0;
  v_open_failures integer := 0;
  v_abandoned integer := 0;
  v_owner_ids uuid[];
BEGIN
  SELECT idle_source_days INTO v_idle_days FROM public.messenger_contacts_admin_settings WHERE id = 1;
  v_idle_days := coalesce(v_idle_days, 180);

  SELECT count(*)::integer INTO v_idle FROM public.contact_sources
  WHERE status = 'active' AND last_used_at < now() - make_interval(days => v_idle_days);
  SELECT count(*)::integer INTO v_stale_lookup FROM public.member_phone_lookup l JOIN public.profiles p ON p.id = l.user_id
  WHERE NOT p.phone_verified OR coalesce(p.phone, '') = '';
  SELECT count(*)::integer INTO v_orphan_supp FROM public.contact_suppressions cs
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cs.owner_user_id)
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cs.target_user_id);
  SELECT count(*)::integer INTO v_open_failures FROM public.contact_suppression_failures WHERE resolved_at IS NULL;
  SELECT count(*)::integer INTO v_abandoned FROM public.contact_sources
  WHERE pending_generation IS NOT NULL AND pending_started_at < now() - interval '1 day';

  IF coalesce(p_dry_run, true) THEN
    RETURN jsonb_build_object('ok', true, 'dry_run', true, 'idle_sources', v_idle, 'stale_lookups', v_stale_lookup,
      'orphan_suppressions', v_orphan_supp, 'open_failures', v_open_failures, 'abandoned_snapshots', v_abandoned);
  END IF;

  -- 미사용 출처
  SELECT coalesce(array_agg(DISTINCT user_id), '{}'::uuid[]) INTO v_owner_ids FROM public.contact_sources
  WHERE status = 'active' AND last_used_at < now() - make_interval(days => v_idle_days);
  DELETE FROM public.contact_source_entries e USING public.contact_sources s
  WHERE e.source_id = s.id AND s.status = 'active' AND s.last_used_at < now() - make_interval(days => v_idle_days);
  UPDATE public.contact_sources SET status = 'removed', removed_at = now(), pending_generation = NULL
  WHERE status = 'active' AND last_used_at < now() - make_interval(days => v_idle_days);
  PERFORM public.cm_contacts_bump_owner_versions(v_owner_ids);

  -- 인증이 풀렸거나 번호가 없어진 회원의 등록
  DELETE FROM public.member_phone_lookup l USING public.profiles p
  WHERE p.id = l.user_id AND (NOT p.phone_verified OR coalesce(p.phone, '') = '');

  -- 버려진 스냅숏
  DELETE FROM public.contact_source_entries e USING public.contact_sources s
  WHERE e.source_id = s.id AND s.pending_generation IS NOT NULL AND s.pending_started_at < now() - interval '1 day'
    AND e.generation > s.generation;
  UPDATE public.contact_sources SET pending_generation = NULL, pending_started_at = NULL
  WHERE pending_generation IS NOT NULL AND pending_started_at < now() - interval '1 day';

  -- 고아 재추천 제한
  DELETE FROM public.contact_suppressions cs
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cs.owner_user_id)
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cs.target_user_id);

  -- 기록 실패분 복구 (§5-3) — 한 문장(옮기기 실패 시 전부 취소 · 미복구로 남음) · 멱등
  WITH f AS (
    UPDATE public.contact_suppression_failures SET attempts = attempts + 1, resolved_at = now()
    WHERE resolved_at IS NULL
    RETURNING owner_user_id, target_user_id, reason
  ), ins AS (
    INSERT INTO public.contact_suppressions (owner_user_id, target_user_id, reason)
    SELECT DISTINCT ON (owner_user_id, target_user_id) owner_user_id, target_user_id,
           CASE WHEN reason IN ('hidden', 'former_friend') THEN reason ELSE 'former_friend' END
    FROM f ORDER BY owner_user_id, target_user_id
    ON CONFLICT (owner_user_id, target_user_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_recovered FROM f;

  RETURN jsonb_build_object('ok', true, 'dry_run', false, 'idle_sources', v_idle, 'stale_lookups', v_stale_lookup,
    'orphan_suppressions', v_orphan_supp, 'recovered_failures', v_recovered, 'abandoned_snapshots', v_abandoned);
END;
$function$;

-- ───────────────────────── 함수 권한 (service_role 만)
DO $grants$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cm_contacts_bump_owner_versions(uuid[])',
    'public.cm_contacts_owner_ids_for_hmac(bytea, uuid)',
    'public.save_messenger_contacts_admin_settings_cas(bigint, boolean, boolean, integer, integer, integer, integer, text, text, uuid)',
    'public.cm_contacts_consent(uuid, text, bytea, smallint, timestamptz)',
    'public.cm_contacts_withdraw(uuid)',
    'public.cm_contacts_delete_all(uuid)',
    'public.cm_contacts_register_source(uuid, bytea, text)',
    'public.cm_contacts_patch_source(uuid, uuid, bytea, boolean, text, text)',
    'public.cm_contacts_delete_source(uuid, uuid)',
    'public.cm_contacts_apply(uuid, uuid, bytea, text, text, bigint, jsonb, jsonb, integer, integer, integer)',
    'public.cm_contacts_list(uuid, uuid, text)',
    'public.cm_contacts_match_new_member(uuid, integer)',
    'public.cm_contacts_lookup_refresh_candidates(integer)',
    'public.cm_contacts_lookup_upsert(uuid, bytea, smallint, timestamptz)',
    'public.cm_contacts_daily_maintenance(boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END
$grants$;

-- ───────────────────────── 롤백 (운영 적용 후 되돌릴 때 — 신규 객체만, 기존 데이터 영향 없음)
-- DROP FUNCTION IF EXISTS public.cm_contacts_daily_maintenance(boolean), public.cm_contacts_lookup_upsert(uuid, bytea, smallint, timestamptz),
--   public.cm_contacts_lookup_refresh_candidates(integer), public.cm_contacts_match_new_member(uuid, integer),
--   public.cm_contacts_list(uuid, uuid, text), public.cm_contacts_apply(uuid, uuid, bytea, text, text, bigint, jsonb, jsonb, integer, integer, integer),
--   public.cm_contacts_delete_source(uuid, uuid), public.cm_contacts_patch_source(uuid, uuid, bytea, boolean, text, text),
--   public.cm_contacts_register_source(uuid, bytea, text), public.cm_contacts_delete_all(uuid), public.cm_contacts_withdraw(uuid),
--   public.cm_contacts_consent(uuid, text, bytea, smallint, timestamptz),
--   public.save_messenger_contacts_admin_settings_cas(bigint, boolean, boolean, integer, integer, integer, integer, text, text, uuid),
--   public.cm_contacts_owner_ids_for_hmac(bytea, uuid), public.cm_contacts_bump_owner_versions(uuid[]);
-- DROP TABLE IF EXISTS public.contact_source_entries, public.contact_sources, public.contact_join_notices,
--   public.contact_suppression_failures, public.contact_suppressions, public.messenger_contact_settings,
--   public.member_phone_lookup, public.messenger_contacts_admin_settings_logs, public.messenger_contacts_admin_settings;
