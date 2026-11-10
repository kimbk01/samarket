-- 연락처 목록 「최근 가입」 표시 기준 정정 (실기 2026-11-11 결함 2)
-- 원인: cm_contacts_list 가 번호 등록 시각(member_phone_lookup.registered_at = 처음 동의한 때)으로 7일을 판정 →
--       오래된 회원도 처음 동의하면 「최근 가입」이 붙음 (zxzx11: 2026-04-12 가입인데 표시됨).
-- 수정: 가입 안내 대상(#3 「가입 7일 안」 · cm_contacts_register_source 의 profiles.created_at)과 같은 기준으로 판정.
-- 바뀌는 것: ① recently_joined 계산 ② 목록 토큰에 「rj1:필리핀 날짜」 추가 — 7일이 지나면 표시가 바뀌므로 하루 1번 다시 받음,
--            기준이 바뀐 날 기기에 저장된 옛 토큰도 다시 받게 함. 목록 순서·제외 규칙·응답 모양·권한은 그대로.
BEGIN;

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
       WHERE requester_id = p_user OR addressee_id = p_user),
    -- 「최근 가입」(가입 7일)은 날짜가 지나면 바뀐다 → 필리핀 날짜를 넣어 하루 1번은 목록을 다시 받게 한다.
    -- 'rj1' = 이 판정 기준 버전 (기준이 바뀐 날 기기에 남은 옛 목록도 다시 받게 함)
    'rj1:' || (now() AT TIME ZONE 'Asia/Manila')::date::text
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
    SELECT m.*, p.nickname, p.username, p.dibay_id, p.avatar_url, p.created_at AS joined_at,
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
      'recently_joined', ok.joined_at > now() - interval '7 days',
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

REVOKE ALL ON FUNCTION public.cm_contacts_list(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cm_contacts_list(uuid, uuid, text) TO service_role;

COMMIT;
