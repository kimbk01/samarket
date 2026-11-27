-- 어드민 회원 영구 삭제 실패 10건 (2026-11-27 PHT) — 설계 docs/audit/admin-user-purge-failures-2026-11-27/design.md
-- Owner 「구현 승인」 2026-11-27. 운영 적용은 Owner 승인 후.
--
-- D1 사전 확인이 시스템 계정(community_import_principal · ON DELETE RESTRICT)을 막는 이유로 알린다.
-- D2 삭제 전 준비: 대상 회원 기기를 가리키는 캠페인 발송 기록 가운데 기기를 비우면(ON DELETE SET NULL)
--    고유 인덱스 2개와 겹치는 행만 지운다 — 회차 행 notification_campaign_deliveries_occurrence_user_device_channel
--    (occurrence_id 있음) · 레거시 행 ncd_legacy_campaign_user_device_channel_uidx (occurrence_id 없음, campaign_id 기준).
-- D3 support_messages_sender_shape 완화 — 보낸 사람 FK 의 ON DELETE SET NULL 이 검사 제약에 막히지 않게.

BEGIN;

-- D1 ------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_can_purge_auth_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_blockers jsonb := '[]'::jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'blockers', jsonb_build_array('invalid_user_id'));
  END IF;

  IF to_regclass('public.group_rooms') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.group_rooms WHERE created_by = p_user_id) THEN
      v_blockers := v_blockers || jsonb_build_array('group_rooms.created_by');
    END IF;
  END IF;

  IF to_regclass('public.group_messages') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.group_messages WHERE sender_id = p_user_id) THEN
      v_blockers := v_blockers || jsonb_build_array('group_messages.sender_id');
    END IF;
  END IF;

  IF to_regclass('public.group_audit_log') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.group_audit_log WHERE actor_id = p_user_id) THEN
      v_blockers := v_blockers || jsonb_build_array('group_audit_log.actor_id');
    END IF;
  END IF;

  IF to_regclass('public.stores') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.stores WHERE owner_user_id = p_user_id) THEN
      v_blockers := v_blockers || jsonb_build_array('stores.owner_user_id');
    END IF;
  END IF;

  /** 커뮤니티 가져오기 글의 작성자(시스템 계정) — FK 가 ON DELETE RESTRICT 로 일부러 막는다 */
  IF to_regclass('public.community_import_principal') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.community_import_principal WHERE user_id = p_user_id) THEN
      v_blockers := v_blockers || jsonb_build_array('community_import_principal');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers
  );
END;
$function$;

-- D2 ------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_prepare_auth_user_purge(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_user_id');
  END IF;
  IF to_regclass('public.notification_campaign_deliveries') IS NULL
     OR to_regclass('public.user_devices') IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deliveries_deleted', 0);
  END IF;

  /**
   * 회원을 지우면 그 회원의 user_devices 가 지워지고(CASCADE) 그 기기를 가리키던 발송 기록의 device_id 가 비워진다(SET NULL).
   * 같은 (회차·받는 사람·채널)에 이미 「기기 없음」 행이 있거나, 비워질 행이 2개 이상이면 고유 인덱스가 겹쳐 삭제 전체가 실패한다.
   * 겹칠 행만 지운다: 「기기 없음」 행이 있으면 비워질 행 전부, 없으면 가장 이른 1행만 남긴다. 받는 사람이 다른 회원이어도 같다.
   */
  WITH dev AS (
    SELECT ud.id FROM public.user_devices ud WHERE ud.user_id = p_user_id
  ),
  hit AS (
    /** 고유 인덱스 범위: 회차 행은 occurrence_id, 레거시 행(occurrence_id 없음)은 campaign_id */
    SELECT d.id, d.occurrence_id, d.campaign_id, d.user_id, d.channel, d.created_at,
           (d.occurrence_id IS NULL) AS legacy
    FROM public.notification_campaign_deliveries d
    WHERE d.device_id IN (SELECT dev.id FROM dev)
  ),
  ranked AS (
    SELECT
      h.id,
      EXISTS (
        SELECT 1
        FROM public.notification_campaign_deliveries x
        WHERE x.user_id = h.user_id
          AND x.channel = h.channel
          AND x.device_id IS NULL
          AND (
            (NOT h.legacy AND x.occurrence_id = h.occurrence_id)
            OR (h.legacy AND x.occurrence_id IS NULL AND x.campaign_id IS NOT DISTINCT FROM h.campaign_id)
          )
      ) AS has_null_row,
      row_number() OVER (
        PARTITION BY h.legacy, CASE WHEN h.legacy THEN h.campaign_id ELSE h.occurrence_id END, h.user_id, h.channel
        ORDER BY h.created_at, h.id
      ) AS rn
    FROM hit h
  )
  DELETE FROM public.notification_campaign_deliveries t
  USING ranked r
  WHERE t.id = r.id
    AND (r.has_null_row OR r.rn > 1);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deliveries_deleted', v_deleted);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_prepare_auth_user_purge(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_prepare_auth_user_purge(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_prepare_auth_user_purge(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepare_auth_user_purge(uuid) TO service_role;

-- D3 ------------------------------------------------------------------------------------------
-- 이전: MEMBER·OWNER 는 sender_user_id NOT NULL, ADMIN 은 sender_admin_id NOT NULL.
-- 두 FK 가 ON DELETE SET NULL 이라 보낸 회원·관리자를 지우면 검사 제약에 막혀 삭제 전체가 실패했다.
-- 회원 상담 건은 support_cases.requester_user_id ON DELETE CASCADE 로 함께 지워지고, 관리자 답변은 보낸 사람 없이 남는다.
ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_sender_shape;
ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_sender_shape CHECK (
    ((sender_type = ANY (ARRAY['MEMBER'::text, 'OWNER'::text])) AND (sender_admin_id IS NULL))
    OR (sender_type = 'ADMIN'::text)
    OR ((sender_type = 'SYSTEM'::text) AND (sender_user_id IS NULL) AND (sender_admin_id IS NULL))
  );

COMMIT;
