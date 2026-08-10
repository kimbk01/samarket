-- Supabase Security Advisor phase 8 (project ckdosyydvgzqwpbwuhon)
--
-- Fixes (SQL):
--   ERROR  rls_disabled_in_public — account_deletion_requests
--   WARN   anon EXECUTE on service-only SECURITY DEFINER RPCs (production drift)
--   WARN   anon EXECUTE on cm_is_room_* (authenticated KEEP for RLS / Realtime)
--   WARN   cm_room_summary_try_parse_jsonb search_path (prod-only helper, if present)
--
-- Intentional residual WARN (do not “fix” here — product contract):
--   posts_mask_reserved_buyer_id(anon) — posts_masked security_invoker view
--   is_platform_admin / is_admin_user(authenticated) — RLS policy helpers
--   cm_is_room_* / posts_mask / admin helpers(authenticated) — SECURITY DEFINER + EXECUTE
-- Dashboard only:
--   auth_leaked_password_protection — Supabase Auth → Password Security

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) account_deletion_requests — RLS (service routes only; no direct PostgREST)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.account_deletion_requests') IS NULL THEN
    RAISE NOTICE 'phase8: skip account_deletion_requests RLS — table missing';
    RETURN;
  END IF;

  ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.account_deletion_requests FORCE ROW LEVEL SECURITY;

  COMMENT ON TABLE public.account_deletion_requests IS
    'Account deletion workflow. RLS on; app uses service_role API routes only.';
END $$;

-- ---------------------------------------------------------------------------
-- 2) Service-only atomic RPCs — repo grants service_role; revoke anon/authenticated drift
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure(
    'public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb)'
  ) IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb)
      TO service_role;
  END IF;

  IF to_regprocedure(
    'public.purchase_member_content_promotion(uuid, text, text, integer, integer, text, text, text, text, text)'
  ) IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.purchase_member_content_promotion(
      uuid, text, text, integer, integer, text, text, text, text, text
    ) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.purchase_member_content_promotion(
      uuid, text, text, integer, integer, text, text, text, text, text
    ) TO service_role;
  END IF;

  IF to_regprocedure(
    'public.dibay_mark_room_read_atomic(uuid, uuid, text, text, text, uuid, uuid, uuid, text)'
  ) IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.dibay_mark_room_read_atomic(
      uuid, uuid, text, text, text, uuid, uuid, uuid, text
    ) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.dibay_mark_room_read_atomic(
      uuid, uuid, text, text, text, uuid, uuid, uuid, text
    ) TO service_role;
  END IF;

  IF to_regprocedure(
    'public.dibay_append_room_message_atomic(text, uuid, text, text, uuid, text, text, text, jsonb, timestamp with time zone, boolean, text, boolean)'
  ) IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.dibay_append_room_message_atomic(
      text, uuid, text, text, uuid, text, text, text, jsonb, timestamp with time zone, boolean, text, boolean
    ) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.dibay_append_room_message_atomic(
      text, uuid, text, text, uuid, text, text, text, jsonb, timestamp with time zone, boolean, text, boolean
    ) TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Messenger RLS helpers — anon RPC surface 제거 (authenticated KEEP)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.cm_is_room_participant(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.cm_is_room_participant(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.cm_is_room_participant(uuid) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.cm_is_room_admin(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.cm_is_room_admin(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.cm_is_room_admin(uuid) TO authenticated, service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Prod-only helper — search_path lock (name from advisor export)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.cm_room_summary_try_parse_jsonb(text)') IS NULL THEN
    RAISE NOTICE 'phase8: skip cm_room_summary_try_parse_jsonb — not present';
    RETURN;
  END IF;

  ALTER FUNCTION public.cm_room_summary_try_parse_jsonb(text) SET search_path = public;
END $$;

COMMIT;
