-- Badge event COUNT — full taxonomy + eligibility pushed into SQL (Boot/IO Authority, IO-only)
-- Baseline: 3cc78c14f (append-only; does NOT edit 20260620120000 / 20260921160000)
--
-- WHY: countNotificationEventsBadge() previously SELECTed every unread notification_events
--   row (category, muted_snapshot, display_payload) and aggregated in JS. The prior RPC
--   count_notification_events_badge returned only legacy 5 categories with no payload
--   eligibility, so TS never used it. This replaces the RPC body with the FULL modern
--   taxonomy + the exact JS eligibility predicate, so TS can read COUNT results only.
--
-- CONTRACT (meaning unchanged — LOCK IO-only unlock):
--   * Same category buckets + legacy folding as JS mapBadgeRpc input:
--       chat_message  = category IN ('chat_message','chat')
--       group_message = category IN ('group_message','group')
--       trade_message = category IN ('trade_message','trade')
--       order_status  = category IN ('order_status','store')
--       (trade_status / delivery_status / community_activity / admin_marketing_banner /
--        admin_notice / missed_call as-is)
--   * Same eligibility as isBadgeEligibleNotificationEvent():
--       badge_enabled/badgeEnabled == false        → exclude
--       exclude_from_badge/mute_badge (+camel) == true → exclude
--       deleted/isDeleted == true                  → exclude
--       deleted_at/deletedAt present (parseable)   → exclude
--       expired_at/expiredAt/expires_at/expiresAt <= now() → exclude
--       muted_snapshot is sound-only (NOT a badge filter)
--   * admin_marketing_banner excluded from total is enforced in TS mapBadgeRpc (unchanged).
--   * Signature (uuid)->jsonb unchanged → 20260921160000 REVOKE/GRANT stays valid; re-asserted.

-- ---------------------------------------------------------------------------
-- Eligibility predicate — mirrors isBadgeEligibleNotificationEvent (JS)
-- ---------------------------------------------------------------------------
-- STABLE (not IMMUTABLE): expiry compares against now() (transaction time).
CREATE OR REPLACE FUNCTION public.notification_badge_event_eligible(p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_txt text;
  v_ts timestamptz;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN true;
  END IF;

  -- badge_enabled / badgeEnabled == false → exclude
  IF lower(btrim(coalesce(p_payload->>'badge_enabled', p_payload->>'badgeEnabled', ''))) = 'false' THEN
    RETURN false;
  END IF;

  -- exclude_from_badge / mute_badge (+ camel) == true → exclude
  IF lower(btrim(coalesce(p_payload->>'exclude_from_badge', ''))) = 'true'
     OR lower(btrim(coalesce(p_payload->>'excludeFromBadge', ''))) = 'true'
     OR lower(btrim(coalesce(p_payload->>'mute_badge', ''))) = 'true'
     OR lower(btrim(coalesce(p_payload->>'muteBadge', ''))) = 'true' THEN
    RETURN false;
  END IF;

  -- deleted / isDeleted == true → exclude
  IF lower(btrim(coalesce(p_payload->>'deleted', p_payload->>'isDeleted', ''))) = 'true' THEN
    RETURN false;
  END IF;

  -- deleted_at / deletedAt present + parseable → exclude
  v_txt := btrim(coalesce(p_payload->>'deleted_at', p_payload->>'deletedAt', ''));
  IF v_txt <> '' THEN
    BEGIN
      v_ts := v_txt::timestamptz;
      RETURN false;
    EXCEPTION WHEN others THEN
      NULL; -- unparseable: JS Date.parse → NaN → not excluded
    END;
  END IF;

  -- expired_at / expiredAt / expires_at / expiresAt <= now() → exclude
  v_txt := btrim(coalesce(
    p_payload->>'expired_at',
    p_payload->>'expiredAt',
    p_payload->>'expires_at',
    p_payload->>'expiresAt',
    ''
  ));
  IF v_txt <> '' THEN
    BEGIN
      v_ts := v_txt::timestamptz;
      IF v_ts <= now() THEN
        RETURN false;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_badge_event_eligible(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_badge_event_eligible(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_badge_event_eligible(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- count_notification_events_badge — modern taxonomy COUNT (single scan, no row transfer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_notification_events_badge(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible AS (
    SELECT e.category
    FROM public.notification_events e
    WHERE e.user_id = p_user_id
      AND e.unread = true
      AND e.read_at IS NULL
      AND public.notification_badge_event_eligible(e.display_payload)
  )
  SELECT CASE
    WHEN (SELECT auth.role()) <> 'service_role'
         AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id)
      THEN jsonb_build_object(
        'chat_message', 0,
        'group_message', 0,
        'trade_message', 0,
        'trade_status', 0,
        'order_status', 0,
        'delivery_status', 0,
        'community_activity', 0,
        'admin_marketing_banner', 0,
        'admin_notice', 0,
        'missed_call', 0
      )
    ELSE jsonb_build_object(
      'chat_message',
        (SELECT COUNT(*)::int FROM eligible WHERE category IN ('chat_message', 'chat')),
      'group_message',
        (SELECT COUNT(*)::int FROM eligible WHERE category IN ('group_message', 'group')),
      'trade_message',
        (SELECT COUNT(*)::int FROM eligible WHERE category IN ('trade_message', 'trade')),
      'trade_status',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'trade_status'),
      'order_status',
        (SELECT COUNT(*)::int FROM eligible WHERE category IN ('order_status', 'store')),
      'delivery_status',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'delivery_status'),
      'community_activity',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'community_activity'),
      'admin_marketing_banner',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'admin_marketing_banner'),
      'admin_notice',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'admin_notice'),
      'missed_call',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'missed_call')
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.count_notification_events_badge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_notification_events_badge(uuid) TO service_role;

COMMENT ON FUNCTION public.count_notification_events_badge(uuid) IS
  '알림 뱃지 집계 — modern taxonomy + payload eligibility(SQL). service_role/당사자 전용. 전량 row SELECT 대체 COUNT.';
