-- 연락처 동기화 §5-5 「요청 → 거절 → 빠짐」 (2026-11-10 · 최종 점검 누락분 · Owner 「결함 부분을 확인 해라」)
-- 근거: docs/design/messenger-contacts-sync-plan.md v5 §5-5 전환표 「요청 → 거절 | 거절됨 | 정상 | — | 빠짐」
-- 바꾸는 것: cm_contacts_list 본문만 (F1 본문 + 거절된 요청 쌍 제외 · known_refs 에도 포함). 표·권한·시그니처 불변.
--   토큰은 이미 친구 요청 변화(responded_at)를 포함하므로 거절·해제 시 목록이 다시 내려간다.
-- 롤백: 20271111120000_messenger_contacts_sync_audit_f1.sql 의 cm_contacts_list 본문을 다시 실행.
-- 운영 적용: Owner 승인 후.

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
        -- §5-5 「요청 → 거절 → 빠짐」: 어느 쪽이든 거절된 요청이 남아 있으면 빠짐 (거절한 쪽이 「해제」하면 cancelled → 다시 나타남)
        AND NOT EXISTS (SELECT 1 FROM public.community_friend_requests rj
                        WHERE rj.status = 'rejected'
                          AND ((rj.requester_id = p_user AND rj.addressee_id = ok.user_id)
                            OR (rj.requester_id = ok.user_id AND rj.addressee_id = p_user)))
    ), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(ok.user_id)) FILTER (WHERE ok.is_friend), '[]'::jsonb)
  INTO v_rows, v_friends
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

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'members', v_rows, 'friend_ids', v_friends, 'known_refs', v_matched);
END;
$function$;
