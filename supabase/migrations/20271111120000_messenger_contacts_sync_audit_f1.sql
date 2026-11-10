-- 연락처 동기화 감사 수정 F1 (2026-11-10 · Owner 「F1~F3 진행」)
-- 근거: docs/audit/messenger-contacts-sync-audit-2026-11-10.md §1 A2·A3·A7 · §2 §5-1 · §4 P2
-- 바꾸는 것 (함수 3개 본문만 · 표·권한·시그니처 불변 · CREATE OR REPLACE):
--  1) cm_contacts_apply — 스냅숏 0번 조각: 이전 시도 미확정 행 유지 + seen 표시 초기화 (A2 하루 한도 초과 연락처 확정 · A3 지운 번호 잔류)
--  2) cm_contacts_list — 정지 계정 제외(§5-1) · 토큰에 어드민 revision·내 번호 등록 포함(P2) · known_refs 추가(A7 초대 목록)
--  3) cm_contacts_daily_maintenance — 버려진 스냅숏 3일 기준 + seen 초기화 · 결과에 open_failures
-- 롤백: 20271111090000_messenger_contacts_sync_1a.sql 의 같은 함수 3개 본문을 다시 실행.
-- 운영 적용: Owner 별도 승인 후.

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

  -- 이 기기 연락처 중 「초대」에서 뺄 항목 (감사 A7): 내가 이미 아는 관계만 — 친구 · 내가 숨김/재추천 제한 · 내가 차단.
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
                 WHERE cs.owner_user_id = p_user AND cs.target_user_id = l.user_id));

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'members', v_rows, 'friend_ids', v_friends, 'known_refs', v_matched);
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

  SELECT count(*)::integer INTO v_open_failures FROM public.contact_suppression_failures WHERE resolved_at IS NULL;
  RETURN jsonb_build_object('ok', true, 'dry_run', false, 'idle_sources', v_idle, 'stale_lookups', v_stale_lookup,
    'orphan_suppressions', v_orphan_supp, 'recovered_failures', v_recovered, 'open_failures', v_open_failures,
    'abandoned_snapshots', v_abandoned);
END;
$function$;
