-- 연락처 동기화 F3 — 남은 결함 근본 수정 (2026-11-10 · Owner 「남은 결함이 없게 해라」)
-- 근거: docs/audit/messenger-contacts-sync-audit-2026-11-10.md §9 · 계획 v5 §5-3·§8·§10 #8·S9
--  1) 회원이 지운 기기 출처는 그 기기에서 다시 켤 때만 재개 (removed_by · register_source p_reactivate) — A9
--  2) 상대 쪽 변화(프로필·공개 범위·동의·번호 등록·「서로 저장」 상대의 번호 추가/삭제)도 목록 버전에 반영 — P2
--  3) 동의 철회 시 내 재추천 제한도 삭제 (§8 「철회·탈퇴 제외」)
--  4) 실패분 복구 = 행마다 따로 · 실패 횟수·마지막 오류 기록 · 3회 이상 경고 · 어드민 「지금 복구」 함수 · 트리거 켜짐 여부 기록 — §5-3
--  6) 번호 등록 갱신 일괄·등록 불가 번호 표시(밀림 방지) · 가입 안내 일괄 기록 · 출처별 개수 한 번에 — M9·P9·P3
--  5) 이어 올리는 조각도 진행 시각 갱신 (여러 날 이어 올리기) · 「서로 저장」 판정 = 상대 동의·계정 동기화 켬 (L2) · 친구 이 기기 연락처 표시값(friend_refs)
-- 롤백: 트리거 3개 DROP · 새 함수 DROP · 1a/F1/20271111130000 의 해당 함수 본문 재실행 · register_source 는 3인자 원본 재생성. 새 열은 남겨도 무해.
-- 운영 적용: Owner 승인 후.

ALTER TABLE public.contact_sources ADD COLUMN IF NOT EXISTS removed_by text NULL;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_sources_removed_by_check') THEN
    ALTER TABLE public.contact_sources ADD CONSTRAINT contact_sources_removed_by_check
      CHECK (removed_by IS NULL OR removed_by IN ('user', 'revoke', 'withdraw', 'idle'));
  END IF;
END $c$;
ALTER TABLE public.contact_suppression_failures ADD COLUMN IF NOT EXISTS last_error text NULL;
ALTER TABLE public.contact_suppression_failures ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz NULL;

-- register_source 인자 추가 → 예전 3인자 함수를 지우고 다시 만든다 (같은 이름 두 개면 3인자 호출이 모호)
DROP FUNCTION IF EXISTS public.cm_contacts_register_source(uuid, bytea, text);


CREATE OR REPLACE FUNCTION public.cm_contacts_register_source(p_user uuid, p_install_ref bytea, p_platform text, p_reactivate boolean DEFAULT false)
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

  -- 회원이 지운 출처(user·revoke·withdraw)는 그 기기에서 회원이 다시 켤 때(p_reactivate)만 재개 — 하루 1회 갱신으로 되살리지 않음 (감사 A9).
  -- 180일 미사용 정리(idle)·예전 행(NULL)은 계획 §8 대로 다시 실행하면 자동 재개.
  IF v_src.status = 'removed' AND coalesce(v_src.removed_by, 'idle') <> 'idle' AND NOT coalesce(p_reactivate, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'source_id', v_src.id,
      'created', false,
      'reactivated', false,
      'removed', true,
      'removed_by', v_src.removed_by,
      'device_version', v_src.device_version,
      'generation', v_src.generation,
      'sync_enabled', v_src.sync_enabled,
      'permission_state', v_src.permission_state,
      'revoke_choice', v_src.revoke_choice,
      'account_sync_enabled', v_set.account_sync_enabled
    );
  END IF;

  IF v_src.status = 'removed' THEN
    -- 삭제된 출처를 같은 설치가 다시 씀 → 버전을 올려 낡은 기기 상태(base_version)는 409 로 전체 스냅숏
    UPDATE public.contact_sources
    SET status = 'active', removed_at = NULL, removed_by = NULL, sync_enabled = true, permission_state = 'unknown', revoke_choice = NULL,
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
    'removed', false,
    'device_version', v_src.device_version,
    'generation', v_src.generation,
    'sync_enabled', v_src.sync_enabled,
    'permission_state', v_src.permission_state,
    'revoke_choice', v_src.revoke_choice,
    'account_sync_enabled', v_set.account_sync_enabled
  );
END;
$function$;

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
    SET status = 'removed', removed_at = now(), removed_by = 'revoke', revoke_choice = 'delete', permission_state = 'denied',
        pending_generation = NULL, last_used_at = now()
    WHERE id = v_src.id;
    PERFORM public.cm_contacts_bump_owner_versions(ARRAY[p_user]);
    PERFORM public.cm_contacts_bump_holders_if_mutual(p_user);
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
  -- 회원이 지움(이 기기·다른 기기·어드민) → 그 기기가 스스로 다시 켜지 않는다 (감사 A9 · 분실 기기 §10 #8)
  UPDATE public.contact_sources SET status = 'removed', removed_at = now(), removed_by = 'user', pending_generation = NULL
  WHERE id = v_id AND status = 'active';
  PERFORM public.cm_contacts_bump_owner_versions(ARRAY[p_user]);
  PERFORM public.cm_contacts_bump_holders_if_mutual(p_user);
  RETURN jsonb_build_object('ok', true);
END;
$function$;

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
  -- 회원이 지움 → 각 기기가 스스로 다시 켜지 않는다 (removed_by='user', 그 기기에서 다시 켜야 재개 · 감사 A9)
  UPDATE public.contact_sources SET status = 'removed', removed_at = now(), removed_by = 'user', pending_generation = NULL
  WHERE user_id = p_user AND status = 'active';
  GET DIAGNOSTICS v_sources = ROW_COUNT;
  PERFORM public.cm_contacts_bump_owner_versions(ARRAY[p_user]);
  PERFORM public.cm_contacts_bump_holders_if_mutual(p_user);
  RETURN jsonb_build_object('ok', true, 'sources_removed', v_sources);
END;
$function$;

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
  UPDATE public.contact_sources SET status = 'removed', removed_at = now(), removed_by = 'withdraw', pending_generation = NULL
  WHERE user_id = p_user AND status = 'active';
  GET DIAGNOSTICS v_sources = ROW_COUNT;
  -- §8 「재추천 제한·숨김 … 유지 (철회·탈퇴 제외)」: 동의 철회 = 내 숨긴 추천·이전 친구 제한도 지운다
  DELETE FROM public.contact_suppressions WHERE owner_user_id = p_user;
  DELETE FROM public.contact_suppression_failures WHERE owner_user_id = p_user;
  UPDATE public.messenger_contact_settings
  SET withdrawn_at = now(), account_sync_enabled = false, account_list_version = account_list_version + 1, updated_at = now()
  WHERE user_id = p_user;
  RETURN jsonb_build_object('ok', true, 'sources_removed', v_sources);
END;
$function$;


-- ───────────────────────── 재추천 제한 기록 실패분 복구 (§5-3 「매일 정리 작업·어드민 지금 복구」)
-- 행마다 하위 트랜잭션: 성공 = 제한 표에 넣고 resolved_at · 실패 = attempts+1·마지막 오류 기록(남음) · 3회 이상 = 어드민 경고
CREATE OR REPLACE FUNCTION public.cm_contacts_recover_failures()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
  v_ok integer := 0;
  v_fail integer := 0;
  v_err text;
BEGIN
  FOR r IN SELECT id, owner_user_id, target_user_id, reason FROM public.contact_suppression_failures
           WHERE resolved_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO public.contact_suppressions (owner_user_id, target_user_id, reason)
      VALUES (r.owner_user_id, r.target_user_id, CASE WHEN r.reason IN ('hidden', 'former_friend') THEN r.reason ELSE 'former_friend' END)
      ON CONFLICT (owner_user_id, target_user_id) DO NOTHING;
      UPDATE public.contact_suppression_failures
      SET resolved_at = now(), attempts = attempts + 1, last_attempt_at = now(), last_error = NULL
      WHERE id = r.id;
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      -- 표에 sqlstate 열이 있어 변수로 먼저 받는다
      v_err := left(SQLSTATE || ' ' || SQLERRM, 300);
      UPDATE public.contact_suppression_failures f
      SET attempts = f.attempts + 1, last_attempt_at = now(), last_error = v_err
      WHERE f.id = r.id;
      v_fail := v_fail + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object(
    'ok', true,
    'recovered', v_ok,
    'failed', v_fail,
    'open', (SELECT count(*) FROM public.contact_suppression_failures WHERE resolved_at IS NULL),
    'warn', (SELECT count(*) FROM public.contact_suppression_failures WHERE resolved_at IS NULL AND attempts >= 3)
  );
END;
$function$;

-- 「서로 저장」 회원의 연락처가 통째로 빠지면(기기·전체 삭제·권한 철회 지우기·미사용 정리) 그 회원 번호를 가진 회원 목록도 바뀜 (감사 P2)
CREATE OR REPLACE FUNCTION public.cm_contacts_bump_holders_if_mutual(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(
       (SELECT st.discovery_policy FROM public.messenger_contact_settings st WHERE st.user_id = p_user),
       (SELECT a.default_discovery_policy FROM public.messenger_contacts_admin_settings a WHERE a.id = 1),
       'everyone') = 'mutual' THEN
    PERFORM public.cm_contacts_bump_holders_of_user(p_user);
  END IF;
END;
$function$;

-- 친구 삭제 트리거가 켜져 있는가 (§5-3 「어드민에 꺼진 기간 표시」 — 매일 정리 결과에 함께 기록)
CREATE OR REPLACE FUNCTION public.cm_contacts_trigger_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce((SELECT tgenabled <> 'D' FROM pg_trigger WHERE tgname = 'trg_usr_friend_delete_contact_suppress' AND NOT tgisinternal LIMIT 1), false);
$function$;

-- ───────────────────────── 상대 쪽 변화 → 그 회원 번호를 가진 목록 버전 올리기 (감사 P2)
-- 실패해도 원래 작업(프로필 수정·설정 저장·번호 등록 정리)을 막지 않는다 (WARNING 만).
CREATE OR REPLACE FUNCTION public.cm_contacts_bump_holders_of_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hmac bytea;
BEGIN
  SELECT phone_hmac INTO v_hmac FROM public.member_phone_lookup WHERE user_id = p_user;
  IF v_hmac IS NOT NULL THEN
    PERFORM public.cm_contacts_bump_owner_versions(public.cm_contacts_owner_ids_for_hmac(v_hmac, p_user));
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cm_contacts_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    PERFORM public.cm_contacts_bump_holders_of_user(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cm_contacts_on_profile_change % %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cm_contacts_on_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    PERFORM public.cm_contacts_bump_holders_of_user(NEW.user_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cm_contacts_on_settings_change % %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cm_contacts_on_lookup_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    PERFORM public.cm_contacts_bump_owner_versions(public.cm_contacts_owner_ids_for_hmac(OLD.phone_hmac, OLD.user_id));
    IF TG_OP = 'UPDATE' THEN
      PERFORM public.cm_contacts_bump_owner_versions(public.cm_contacts_owner_ids_for_hmac(NEW.phone_hmac, NEW.user_id));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cm_contacts_on_lookup_change % %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_profiles_contacts_list_bump ON public.profiles;
CREATE TRIGGER trg_profiles_contacts_list_bump
  AFTER UPDATE OF nickname, username, dibay_id, avatar_url, status, deleted_at, deletion_requested_at ON public.profiles
  FOR EACH ROW
  WHEN (OLD.nickname IS DISTINCT FROM NEW.nickname OR OLD.username IS DISTINCT FROM NEW.username
        OR OLD.dibay_id IS DISTINCT FROM NEW.dibay_id OR OLD.avatar_url IS DISTINCT FROM NEW.avatar_url
        OR OLD.status IS DISTINCT FROM NEW.status OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
        OR OLD.deletion_requested_at IS DISTINCT FROM NEW.deletion_requested_at)
  EXECUTE FUNCTION public.cm_contacts_on_profile_change();

DROP TRIGGER IF EXISTS trg_contact_settings_list_bump ON public.messenger_contact_settings;
CREATE TRIGGER trg_contact_settings_list_bump
  AFTER UPDATE OF discovery_policy, account_sync_enabled, consented_at, withdrawn_at ON public.messenger_contact_settings
  FOR EACH ROW
  WHEN (OLD.discovery_policy IS DISTINCT FROM NEW.discovery_policy OR OLD.account_sync_enabled IS DISTINCT FROM NEW.account_sync_enabled
        OR OLD.consented_at IS DISTINCT FROM NEW.consented_at OR OLD.withdrawn_at IS DISTINCT FROM NEW.withdrawn_at)
  EXECUTE FUNCTION public.cm_contacts_on_settings_change();

DROP TRIGGER IF EXISTS trg_member_phone_lookup_list_bump ON public.member_phone_lookup;
CREATE TRIGGER trg_member_phone_lookup_list_bump
  AFTER DELETE ON public.member_phone_lookup
  FOR EACH ROW
  EXECUTE FUNCTION public.cm_contacts_on_lookup_change();
-- 같은 번호로 다시 등록(갱신)은 목록이 안 바뀜 → 번호가 실제로 바뀐 때만
DROP TRIGGER IF EXISTS trg_member_phone_lookup_list_bump_update ON public.member_phone_lookup;
CREATE TRIGGER trg_member_phone_lookup_list_bump_update
  AFTER UPDATE OF phone_hmac ON public.member_phone_lookup
  FOR EACH ROW
  WHEN (OLD.phone_hmac IS DISTINCT FROM NEW.phone_hmac)
  EXECUTE FUNCTION public.cm_contacts_on_lookup_change();


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
  -- 올린 사람이 「서로 저장한 사람만」이면 상대 목록도 바뀐다 → 영향받은 회원 목록 버전도 올린다 (감사 P2)
  v_mutual boolean := false;
  v_touched bytea[] := '{}'::bytea[];
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
  v_mutual := coalesce(v_set.discovery_policy, v_adm.default_discovery_policy, 'everyone') = 'mutual';
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
      SELECT coalesce(array_agg(d.phone_hmac) FILTER (WHERE l.user_id IS NOT NULL), '{}'::bytea[])
      INTO v_touched
      FROM d LEFT JOIN public.member_phone_lookup l ON l.phone_hmac = d.phone_hmac;
      v_member_touched := cardinality(v_touched) > 0;
    END IF;
    IF v_add_count > 0 THEN
      INSERT INTO public.contact_source_entries (source_id, phone_hmac, client_ref, generation, seen_generation)
      SELECT DISTINCT ON (decode(a->>'h', 'hex')) v_src.id, decode(a->>'h', 'hex'), a->>'r', v_src.generation, v_src.generation
      FROM jsonb_array_elements(p_add) a
      ORDER BY decode(a->>'h', 'hex')
      ON CONFLICT (source_id, phone_hmac) DO UPDATE SET client_ref = excluded.client_ref;
      v_touched := v_touched || coalesce((
        SELECT array_agg(l.phone_hmac) FROM jsonb_array_elements(p_add) a
        JOIN public.member_phone_lookup l ON l.phone_hmac = decode(a->>'h', 'hex')), '{}'::bytea[]);
      v_member_touched := cardinality(v_touched) > 0;
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
      -- 새 시도 시작 (감사 A2·A3 2026-11-10):
      --  · 이전 시도의 미확정 행은 지우지 않는다 → 다시 보낸 번호는 「새 번호」로 다시 세지 않음 (하루 한도를 넘는 연락처도 며칠에 걸쳐 확정)
      --  · 이번 시도 표시(seen_generation)를 확정 세대로 되돌린다 → 이번 시도에 다시 오지 않은 번호(폰에서 지운 번호)는 확정 때 삭제
      UPDATE public.contact_source_entries SET seen_generation = v_src.generation
      WHERE source_id = v_src.id AND seen_generation <> v_src.generation;
      v_target_gen := v_src.generation + 1;
      UPDATE public.contact_sources SET pending_generation = v_target_gen, pending_started_at = now()
      WHERE id = v_src.id;
    ELSE
      IF v_src.pending_generation IS NULL OR p_generation IS DISTINCT FROM v_src.pending_generation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'snapshot_generation_mismatch', 'device_version', v_src.device_version);
      END IF;
      v_target_gen := v_src.pending_generation;
      -- 이어 올리는 조각도 「진행 중」 시각을 갱신 → 여러 날 이어 올려도 3일 정리 대상이 아님
      UPDATE public.contact_sources SET pending_started_at = now() WHERE id = v_src.id;
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
      IF v_mutual THEN
        -- 확정으로 보이기 시작·사라지는 번호 = 상대 「서로 저장」 판정이 바뀌는 번호
        SELECT coalesce(array_agg(e.phone_hmac), '{}'::bytea[]) INTO v_touched
        FROM public.contact_source_entries e JOIN public.member_phone_lookup l ON l.phone_hmac = e.phone_hmac
        -- 사라지는 번호(이번에 다시 안 옴) ∪ 새로 보이는 번호(이번 세대에 들어옴)
        WHERE e.source_id = v_src.id AND (e.seen_generation < v_target_gen OR e.generation = v_target_gen);
      END IF;
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
    IF v_mutual AND cardinality(v_touched) > 0 THEN
      PERFORM public.cm_contacts_bump_owner_versions(
        ARRAY(SELECT DISTINCT l.user_id FROM public.member_phone_lookup l WHERE l.phone_hmac = ANY (v_touched) AND l.user_id <> p_user));
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
  v_matched jsonb;
  v_friend_refs jsonb;
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
    (SELECT revision FROM public.messenger_contacts_admin_settings WHERE id = 1),
    (SELECT encode(phone_hmac, 'hex') FROM public.member_phone_lookup WHERE user_id = p_user),
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
    WHERE p.deleted_at IS NULL AND p.deletion_requested_at IS NULL AND coalesce(p.status, '') NOT IN ('deleted', 'suspended')
      AND NOT EXISTS (SELECT 1 FROM public.user_social_relations b
                      WHERE b.relation_type = 'blocked'
                        AND ((b.owner_user_id = p_user AND b.target_user_id = m.user_id)
                          OR (b.owner_user_id = m.user_id AND b.target_user_id = p_user)))
      AND coalesce(ts.discovery_policy, v_default_policy) <> 'nobody'
      AND (coalesce(ts.discovery_policy, v_default_policy) <> 'mutual'
           -- 「서로 저장」 = 상대가 동의·계정 동기화 켠 상태로 내 번호를 가짐 (가입 매칭 규칙 owner_ids_for_hmac 과 같음 · 감사 L2)
           OR (v_my_hmac IS NOT NULL AND ts.consented_at IS NOT NULL AND ts.withdrawn_at IS NULL AND ts.account_sync_enabled
               AND EXISTS (
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
        -- §5-5 「요청 → 거절 → 빠짐」: 어느 쪽이든 거절된 요청이 남아 있으면 빠짐 (거절한 쪽이 「해제」하면 cancelled → 다시 나타남)
        AND NOT EXISTS (SELECT 1 FROM public.community_friend_requests rj
                        WHERE rj.status = 'rejected'
                          AND ((rj.requester_id = p_user AND rj.addressee_id = ok.user_id)
                            OR (rj.requester_id = ok.user_id AND rj.addressee_id = p_user)))
    ), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(ok.user_id)) FILTER (WHERE ok.is_friend), '[]'::jsonb),
    -- 친구 중 이 기기 연락처에 있는 회원 → 기기 안 번호 찾기용 (친구 행 「내 연락처」 · 친구 프로필 휴대폰 전화)
    coalesce(jsonb_object_agg(ok.user_id::text, ok.client_ref) FILTER (WHERE ok.is_friend AND ok.on_this_device AND ok.client_ref IS NOT NULL), '{}'::jsonb)
  INTO v_rows, v_friends, v_friend_refs
  FROM ok;

  -- 이 기기 연락처 중 「초대」에서 뺄 항목 (감사 A7): 내가 이미 아는 관계만 — 친구 · 내가 숨김/재추천 제한 · 내가 차단 · 거절된 요청.
  -- 상대 설정(nobody·mutual)·상대가 나를 차단한 경우는 넣지 않는다 (가입 여부·차단 여부 비노출 #7).
  SELECT coalesce(jsonb_agg(DISTINCT e.client_ref), '[]'::jsonb) INTO v_matched
  FROM public.contact_source_entries e
  JOIN public.contact_sources s ON s.id = e.source_id
  JOIN public.member_phone_lookup l ON l.phone_hmac = e.phone_hmac
  WHERE p_source IS NOT NULL AND e.source_id = p_source AND s.user_id = p_user AND s.status = 'active'
    AND e.generation <= s.generation AND e.client_ref IS NOT NULL AND l.user_id <> p_user
    AND (EXISTS (SELECT 1 FROM public.user_social_relations r
                 WHERE r.owner_user_id = p_user AND r.target_user_id = l.user_id AND r.relation_type IN ('friend', 'blocked'))
      OR EXISTS (SELECT 1 FROM public.contact_suppressions cs
                 WHERE cs.owner_user_id = p_user AND cs.target_user_id = l.user_id)
      -- 거절로 빠진 회원도 초대에 넣지 않는다 (내가 이미 아는 관계 — 요청을 주고받음)
      OR EXISTS (SELECT 1 FROM public.community_friend_requests rj
                 WHERE rj.status = 'rejected'
                   AND ((rj.requester_id = p_user AND rj.addressee_id = l.user_id)
                     OR (rj.requester_id = l.user_id AND rj.addressee_id = p_user))));

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'members', v_rows, 'friend_ids', v_friends,
    'known_refs', v_matched, 'friend_refs', v_friend_refs);
END;
$function$;

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
  v_rec jsonb;
  v_o uuid;
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
  WHERE pending_generation IS NOT NULL AND pending_started_at < now() - interval '3 days';

  IF coalesce(p_dry_run, true) THEN
    RETURN jsonb_build_object('ok', true, 'dry_run', true, 'idle_sources', v_idle, 'stale_lookups', v_stale_lookup,
      'orphan_suppressions', v_orphan_supp, 'open_failures', v_open_failures, 'abandoned_snapshots', v_abandoned,
      'trigger_enabled', public.cm_contacts_trigger_enabled());
  END IF;

  -- 미사용 출처
  SELECT coalesce(array_agg(DISTINCT user_id), '{}'::uuid[]) INTO v_owner_ids FROM public.contact_sources
  WHERE status = 'active' AND last_used_at < now() - make_interval(days => v_idle_days);
  DELETE FROM public.contact_source_entries e USING public.contact_sources s
  WHERE e.source_id = s.id AND s.status = 'active' AND s.last_used_at < now() - make_interval(days => v_idle_days);
  UPDATE public.contact_sources SET status = 'removed', removed_at = now(), removed_by = 'idle', pending_generation = NULL
  WHERE status = 'active' AND last_used_at < now() - make_interval(days => v_idle_days);
  PERFORM public.cm_contacts_bump_owner_versions(v_owner_ids);
  FOR v_o IN SELECT unnest(v_owner_ids) LOOP
    PERFORM public.cm_contacts_bump_holders_if_mutual(v_o);
  END LOOP;

  -- 인증이 풀렸거나 번호가 없어진 회원의 등록
  DELETE FROM public.member_phone_lookup l USING public.profiles p
  WHERE p.id = l.user_id AND (NOT p.phone_verified OR coalesce(p.phone, '') = '');

  -- 버려진 스냅숏 (3일 동안 이어지지 않음 — 하루 한도로 며칠에 걸친 첫 업로드는 매일 다시 시작해 유지됨)
  DELETE FROM public.contact_source_entries e USING public.contact_sources s
  WHERE e.source_id = s.id AND s.pending_generation IS NOT NULL AND s.pending_started_at < now() - interval '3 days'
    AND e.generation > s.generation;
  UPDATE public.contact_source_entries e SET seen_generation = s.generation
  FROM public.contact_sources s
  WHERE e.source_id = s.id AND s.pending_generation IS NOT NULL AND s.pending_started_at < now() - interval '3 days'
    AND e.seen_generation <> s.generation;
  UPDATE public.contact_sources SET pending_generation = NULL, pending_started_at = NULL
  WHERE pending_generation IS NOT NULL AND pending_started_at < now() - interval '3 days';

  -- 고아 재추천 제한
  DELETE FROM public.contact_suppressions cs
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cs.owner_user_id)
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cs.target_user_id);

  -- 기록 실패분 복구 (§5-3) — 행마다 따로(한 행 실패가 다른 정리를 되돌리지 않음) · 실패 횟수 기록
  v_rec := public.cm_contacts_recover_failures();
  v_recovered := coalesce((v_rec->>'recovered')::integer, 0);

  SELECT count(*)::integer INTO v_open_failures FROM public.contact_suppression_failures WHERE resolved_at IS NULL;
  RETURN jsonb_build_object('ok', true, 'dry_run', false, 'idle_sources', v_idle, 'stale_lookups', v_stale_lookup,
    'orphan_suppressions', v_orphan_supp, 'recovered_failures', v_recovered, 'open_failures', v_open_failures,
    'warn_failures', coalesce((v_rec->>'warn')::integer, 0),
    'abandoned_snapshots', v_abandoned, 'trigger_enabled', public.cm_contacts_trigger_enabled());
END;
$function$;


ALTER TABLE public.messenger_contact_settings ADD COLUMN IF NOT EXISTS phone_unusable_verified_at timestamptz NULL;

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
      -- 형식이 맞지 않아 등록할 수 없던 번호(같은 인증 시각)는 다시 고르지 않는다 → 뒤 회원이 밀리지 않음 (감사 M9)
      AND st.phone_unusable_verified_at IS DISTINCT FROM p.phone_verified_at
    ORDER BY st.user_id
    LIMIT greatest(coalesce(p_limit, 500), 0)
  ) p;
$function$;

-- 번호 등록 갱신 일괄 (매일 정리 · 500명을 RPC 1번으로 — 감사 M9) — p_rows: [{"u":uuid,"h":"<64hex>"|null,"v":timestamptz}]
-- h 가 null 이면 등록할 수 없는 번호 → 등록 삭제 + 같은 인증 시각이면 다시 고르지 않게 표시
CREATE OR REPLACE FUNCTION public.cm_contacts_lookup_upsert_many(p_rows jsonb, p_key_version smallint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r jsonb;
  v_ok integer := 0;
  v_unusable integer := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  LOOP
    IF coalesce(r->>'h', '') ~ '^[0-9a-f]{64}$' THEN
      PERFORM public.cm_contacts_lookup_upsert((r->>'u')::uuid, decode(r->>'h', 'hex'), p_key_version, (r->>'v')::timestamptz);
      v_ok := v_ok + 1;
    ELSE
      DELETE FROM public.member_phone_lookup WHERE user_id = (r->>'u')::uuid;
      UPDATE public.messenger_contact_settings SET phone_unusable_verified_at = (r->>'v')::timestamptz WHERE user_id = (r->>'u')::uuid;
      v_unusable := v_unusable + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'refreshed', v_ok, 'unusable', v_unusable);
END;
$function$;

-- 가입 안내 대상 일괄 기록 (1회 보장) — 새로 기록된 회원만 돌려준다 (회원마다 왕복 금지 — 감사 P9)
CREATE OR REPLACE FUNCTION public.cm_contacts_record_join_notices(p_joined uuid, p_owner_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH ins AS (
    INSERT INTO public.contact_join_notices (owner_user_id, joined_user_id)
    SELECT DISTINCT o, p_joined FROM unnest(coalesce(p_owner_ids, '{}'::uuid[])) o
    ON CONFLICT (owner_user_id, joined_user_id) DO NOTHING
    RETURNING owner_user_id
  )
  SELECT coalesce(array_agg(owner_user_id), '{}'::uuid[]) FROM ins;
$function$;

-- 출처별 연락처 개수 한 번에 (기기 목록·어드민 회원 상세 — 출처마다 개수 조회 금지 · 감사 P3)
CREATE OR REPLACE FUNCTION public.cm_contacts_source_entry_counts(p_source_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(jsonb_object_agg(source_id::text, n), '{}'::jsonb)
  FROM (SELECT source_id, count(*) AS n FROM public.contact_source_entries
        WHERE source_id = ANY (coalesce(p_source_ids, '{}'::uuid[])) GROUP BY source_id) c;
$function$;

DO $grants$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cm_contacts_register_source(uuid, bytea, text, boolean)',
    'public.cm_contacts_recover_failures()',
    'public.cm_contacts_trigger_enabled()',
    'public.cm_contacts_bump_holders_of_user(uuid)',
    'public.cm_contacts_bump_holders_if_mutual(uuid)',
    'public.cm_contacts_on_profile_change()',
    'public.cm_contacts_on_settings_change()',
    'public.cm_contacts_on_lookup_change()',
    'public.cm_contacts_lookup_refresh_candidates(integer)',
    'public.cm_contacts_lookup_upsert_many(jsonb, smallint)',
    'public.cm_contacts_record_join_notices(uuid, uuid[])',
    'public.cm_contacts_source_entry_counts(uuid[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END
$grants$;
