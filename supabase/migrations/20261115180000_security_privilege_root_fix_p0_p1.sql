-- DIBAY SUPABASE SECURITY LINT — P0/P1 PRIVILEGE ROOT FIX
-- Project: ckdosyydvgzqwpbwuhon
--
-- Scope (authority-proven only):
--   A. P0 admin campaign occurrence RPCs → service_role-only EXECUTE
--   B. P1 count_notification_unread_segmented → service_role-only
--      (server API via getSupabaseServer / service key; no auth.uid() in body)
--   C. P1 record_customer_center_content_view → service_role-only
--      (POST /api/me/settings/notices/[id]/view uses service client)
--   D. P1 dibamarket_messages_after_insert → revoke PUBLIC/anon/authenticated
--      (AFTER INSERT trigger; RPC EXECUTE not required to fire)
--   E. touch_dibamarket_* → fixed search_path only (ALTER FUNCTION; body unchanged)
--
-- HOLD (intentionally unchanged here):
--   posts_mask_reserved_buyer_id — KEEP anon/authenticated for posts_masked
--     security_invoker=true view contract
--   spatial_ref_sys RLS / PostGIS relocate / leaked-password protection
--
-- No CREATE OR REPLACE of function bodies. No SECURITY mode flips.
-- No unrelated policies/grants. Idempotent REVOKE/GRANT/ALTER.

BEGIN;

-- ---------------------------------------------------------------------------
-- Existence gate — fail loud if any exact signature missing
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing_functions text[];
BEGIN
  SELECT array_agg(expected_signature ORDER BY expected_signature)
  INTO missing_functions
  FROM (
    VALUES
      ('public.claim_due_admin_notification_campaign_occurrence(text, timestamp with time zone, integer)'),
      ('public.claim_admin_notification_campaign_occurrence_send(uuid, text, text, timestamp with time zone, integer)'),
      ('public.ensure_admin_notification_campaign_occurrence(uuid, integer, text, timestamp with time zone, text, uuid, jsonb, timestamp with time zone)'),
      ('public.count_notification_unread_segmented(uuid, text)'),
      ('public.record_customer_center_content_view(uuid, uuid, timestamp with time zone)'),
      ('public.dibamarket_messages_after_insert()'),
      ('public.touch_dibamarket_listings_updated_at()'),
      ('public.touch_dibamarket_threads_updated_at()')
  ) AS expected(expected_signature)
  WHERE to_regprocedure(expected_signature) IS NULL;

  IF missing_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'security_privilege_root_fix_p0_p1: missing functions: %',
      array_to_string(missing_functions, ', ');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- P0 — admin campaign occurrence RPCs (cron/admin service_role only)
-- Callers: lib/admin/notification-campaigns/* + cron routes via service client
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.claim_due_admin_notification_campaign_occurrence(text, timestamp with time zone, integer)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_due_admin_notification_campaign_occurrence(text, timestamp with time zone, integer)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_due_admin_notification_campaign_occurrence(text, timestamp with time zone, integer)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_admin_notification_campaign_occurrence(text, timestamp with time zone, integer)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_admin_notification_campaign_occurrence_send(uuid, text, text, timestamp with time zone, integer)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_admin_notification_campaign_occurrence_send(uuid, text, text, timestamp with time zone, integer)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_admin_notification_campaign_occurrence_send(uuid, text, text, timestamp with time zone, integer)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_notification_campaign_occurrence_send(uuid, text, text, timestamp with time zone, integer)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.ensure_admin_notification_campaign_occurrence(uuid, integer, text, timestamp with time zone, text, uuid, jsonb, timestamp with time zone)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_admin_notification_campaign_occurrence(uuid, integer, text, timestamp with time zone, text, uuid, jsonb, timestamp with time zone)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_admin_notification_campaign_occurrence(uuid, integer, text, timestamp with time zone, text, uuid, jsonb, timestamp with time zone)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_admin_notification_campaign_occurrence(uuid, integer, text, timestamp with time zone, text, uuid, jsonb, timestamp with time zone)
  TO service_role;

-- ---------------------------------------------------------------------------
-- P1 — count_notification_unread_segmented
-- Server-only (getSupabaseServer service key). No auth.uid() bind in body →
-- must not remain callable by anon/authenticated with arbitrary p_user_id.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.count_notification_unread_segmented(uuid, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_notification_unread_segmented(uuid, text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_notification_unread_segmented(uuid, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_notification_unread_segmented(uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- P1 — record_customer_center_content_view
-- Member view recording via authenticated API + service_role writer only.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.record_customer_center_content_view(uuid, uuid, timestamp with time zone)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_customer_center_content_view(uuid, uuid, timestamp with time zone)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_customer_center_content_view(uuid, uuid, timestamp with time zone)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_center_content_view(uuid, uuid, timestamp with time zone)
  TO service_role;

-- ---------------------------------------------------------------------------
-- P1 — dibamarket_messages_after_insert (trigger fn; no client RPC caller)
-- Trigger fire does not require PostgREST EXECUTE for anon/authenticated.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.dibamarket_messages_after_insert()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dibamarket_messages_after_insert()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.dibamarket_messages_after_insert()
  FROM authenticated;

-- ---------------------------------------------------------------------------
-- Hygiene — touch trigger search_path (body/security/owner untouched)
-- Bodies only use NEW + now(); pin pg_catalog + public.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.touch_dibamarket_listings_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.touch_dibamarket_threads_updated_at()
  SET search_path = pg_catalog, public;

COMMIT;
