-- A3 (통화 재감사 §4-14 · Owner 승인 2026-10-23): 옛 iPhone 설치의 apns 행 정리.
-- 재설치마다 apns 토큰·device_id 는 새로 생기지만 VoIP 토큰은 같아 VoIP 행만 새 설치로 옮겨 오고,
-- 옛 설치 apns 행은 활성으로 남아 통화·메시지 일반 알림이 계속 발송됐다(실기기 7637bd88·e048bba2).
-- register_user_device 본문 = 20261015140000 본문 + iOS VoIP 등록 시 VoIP 없는 같은 사용자 iOS apns 행 비활성화.
-- 서명·권한(service_role 전용)·반환값 불변. 데이터 직접 UPDATE 없음(다음 VoIP 등록 시 정리).
-- 롤백: 20261015140000 의 CREATE OR REPLACE 본문 재적용.

CREATE OR REPLACE FUNCTION public.register_user_device(
  p_auth_user_id uuid,
  p_device_id text,
  p_platform text,
  p_push_token text,
  p_push_provider text,
  p_environment text,
  p_app_version text,
  p_activate_row boolean,
  p_max_devices integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_now timestamptz := now();
  v_row_id uuid;
  v_is_active boolean;
  v_last_seen timestamptz;
  v_device_id text;
  v_environment text;
  v_provider text;
  v_active_count integer;
  v_oldest_id uuid;
  v_max integer;
BEGIN
  -- Service-role only: Next.js route validates session, then calls with that user id.
  -- Never callable as a generic client shortcut with an arbitrary user_id.
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  v_user_id := p_auth_user_id;
  v_device_id := nullif(btrim(p_device_id), '');
  v_environment := nullif(btrim(p_environment), '');
  v_provider := nullif(btrim(p_push_provider), '');

  IF v_device_id IS NULL OR length(v_device_id) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_device');
  END IF;
  IF nullif(btrim(p_push_token), '') IS NULL OR length(btrim(p_push_token)) > 4096 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_device');
  END IF;
  IF v_provider IS NULL OR v_provider NOT IN ('fcm', 'apns', 'voip_apns', 'web_push') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_provider');
  END IF;
  IF v_environment IS NULL OR v_environment NOT IN ('production', 'preview', 'development') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_environment');
  END IF;
  IF nullif(btrim(p_platform), '') IS NULL OR btrim(p_platform) NOT IN ('android', 'ios', 'web') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_platform');
  END IF;

  v_max := GREATEST(1, LEAST(COALESCE(p_max_devices, 20), 50));

  -- Serialize concurrent register for same token, then same physical device (lock order fixed).
  PERFORM pg_advisory_xact_lock(
    hashtext('ud_tok:' || v_provider || ':' || v_environment || ':' || btrim(p_push_token))
  );
  PERFORM pg_advisory_xact_lock(
    hashtext('ud_dev:' || v_environment || ':' || v_device_id)
  );

  INSERT INTO public.user_devices (
    user_id,
    platform,
    device_id,
    push_token,
    push_provider,
    environment,
    app_version,
    is_active,
    last_seen_at,
    updated_at
  ) VALUES (
    v_user_id,
    btrim(p_platform),
    v_device_id,
    btrim(p_push_token),
    v_provider,
    v_environment,
    nullif(btrim(COALESCE(p_app_version, '')), ''),
    COALESCE(p_activate_row, true),
    v_now,
    v_now
  )
  ON CONFLICT (push_provider, push_token, environment)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    device_id = EXCLUDED.device_id,
    app_version = EXCLUDED.app_version,
    is_active = EXCLUDED.is_active,
    last_seen_at = EXCLUDED.last_seen_at,
    updated_at = EXCLUDED.updated_at
  RETURNING id, is_active, last_seen_at
  INTO v_row_id, v_is_active, v_last_seen;

  -- Cross-user same physical device → inactive (all providers on that device).
  UPDATE public.user_devices
     SET is_active = false,
         updated_at = v_now
   WHERE device_id = v_device_id
     AND environment = v_environment
     AND user_id IS DISTINCT FROM v_user_id
     AND is_active = true;

  -- Same user + device + provider, other tokens → inactive (apns/voip isolation by provider).
  UPDATE public.user_devices
     SET is_active = false,
         updated_at = v_now
   WHERE user_id = v_user_id
     AND device_id = v_device_id
     AND push_provider = v_provider
     AND environment = v_environment
     AND push_token IS DISTINCT FROM btrim(p_push_token)
     AND is_active = true;

  -- A3 (docs/audit/messenger-2026-10-22-reaudit-plan.md §4-14): 새 iOS 설치가 VoIP 를 활성 등록하면,
  -- 같은 사용자의 「VoIP 없는 옛 iOS apns 행」을 비활성화(삭제 아님). VoIP(PushKit) 토큰은 재설치에도
  -- 같아 위 upsert 로 이 device_id 에 옮겨 오므로 옛 설치 device_id 에는 VoIP 가 남지 않는다.
  -- iPad·다른 iPhone 은 각자 VoIP 행이 있어 유지. VoIP 없는 기기는 다음 apns 재등록 시 즉시 재활성.
  IF v_provider = 'voip_apns' AND btrim(p_platform) = 'ios' AND COALESCE(p_activate_row, true) THEN
    UPDATE public.user_devices a
       SET is_active = false,
           updated_at = v_now
     WHERE a.user_id = v_user_id
       AND a.environment = v_environment
       AND a.platform = 'ios'
       AND a.push_provider = 'apns'
       AND a.device_id IS DISTINCT FROM v_device_id
       AND a.is_active = true
       AND NOT EXISTS (
         SELECT 1
           FROM public.user_devices v
          WHERE v.user_id = v_user_id
            AND v.environment = v_environment
            AND v.push_provider = 'voip_apns'
            AND v.is_active = true
            AND v.device_id = a.device_id
       );
  END IF;

  -- Cap: inactive oldest active rows (never DELETE).
  LOOP
    SELECT COUNT(*)::integer INTO v_active_count
      FROM public.user_devices
     WHERE user_id = v_user_id
       AND environment = v_environment
       AND is_active = true;

    EXIT WHEN v_active_count <= v_max;

    SELECT id INTO v_oldest_id
      FROM public.user_devices
     WHERE user_id = v_user_id
       AND environment = v_environment
       AND is_active = true
       AND id IS DISTINCT FROM v_row_id
     ORDER BY last_seen_at ASC NULLS FIRST, updated_at ASC NULLS FIRST
     LIMIT 1;

    EXIT WHEN v_oldest_id IS NULL;

    UPDATE public.user_devices
       SET is_active = false,
           updated_at = v_now
     WHERE id = v_oldest_id;
  END LOOP;

  SELECT id, is_active, last_seen_at, device_id, environment, push_provider
    INTO v_row_id, v_is_active, v_last_seen, v_device_id, v_environment, v_provider
    FROM public.user_devices
   WHERE id = v_row_id;

  RETURN jsonb_build_object(
    'ok', true,
    'device_row_id', v_row_id,
    'user_id', v_user_id,
    'device_id', v_device_id,
    'is_active', v_is_active,
    'last_seen_at', v_last_seen,
    'environment', v_environment,
    'push_provider', v_provider
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'register_failed',
      'db_code', SQLSTATE,
      'db_message', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.register_user_device(
  uuid, text, text, text, text, text, text, boolean, integer
) IS
  'Phase A atomic device register: upsert token ownership, deactivate peers, cap via inactive. A3: iOS VoIP register deactivates same-user iOS apns rows without VoIP (stale reinstalls). service_role only.';

REVOKE ALL ON FUNCTION public.register_user_device(
  uuid, text, text, text, text, text, text, boolean, integer
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_user_device(
  uuid, text, text, text, text, text, text, boolean, integer
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_user_device(
  uuid, text, text, text, text, text, text, boolean, integer
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.register_user_device(
  uuid, text, text, text, text, text, text, boolean, integer
) TO service_role;
