-- Supabase Security Advisor WARN (splinter export ckdosyydvgzqwpbwuhon) phase 7
--
-- Scope (EXECUTE privilege only — no CREATE/REPLACE/DROP, no RLS/View/body changes):
--   A) Drift cleanup — repo already intends service_role only
--   B) Orphan (prod-only) — dibay_reconcile_stale_badge_facts(uuid) if present
--   C) Atomic mark-read — product wiring OFF → service_role only (revoke authenticated)
--
-- Intentionally unchanged (advisor may still WARN — phase6 contract):
--   cm_is_room_admin / cm_is_room_participant — RLS + Realtime membership
--   posts_mask_reserved_buyer_id — posts_masked security_invoker view
--   is_platform_admin / is_admin_user — RLS inline helpers (authenticated KEEP)
--   auth_leaked_password_protection — Dashboard → Authentication → Password Security
--
-- BLOCKED (not in this migration — identity arguments not confirmed in repo/DB evidence):
--   cm_room_summary_try_parse_jsonb — advisor lists name only; no CREATE in main migrations
--
-- Dashboard residual (not SQL):
--   Leaked Password Protection → enable manually in Supabase Auth settings

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Drift — exact signatures from latest repo migrations
-- ---------------------------------------------------------------------------

-- assign_auto_dibay_id — 20260709120000 (service_role only). Callers: service client API.
REVOKE EXECUTE ON FUNCTION public.assign_auto_dibay_id(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_auto_dibay_id(uuid)
  TO service_role;

-- community_messenger_bootstrap_rooms — 20260618160000 + harden 20260808136000.
-- Callers: lib/community-messenger/service.ts via getSupabaseServer().
REVOKE EXECUTE ON FUNCTION public.community_messenger_bootstrap_rooms(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_bootstrap_rooms(uuid[])
  TO service_role;

-- community_messenger_send_text_message — phase2 body + phase3 service_role only.
-- Identity args use timestamp with time zone (timestamptz alias in CREATE).
REVOKE EXECUTE ON FUNCTION public.community_messenger_send_text_message(
  uuid, uuid, text, text, timestamp with time zone, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_send_text_message(
  uuid, uuid, text, text, timestamp with time zone, uuid
) TO service_role;

-- upsert_notification_target_unread — 20261009120000 (7-arg). Callers: service_role bump paths.
REVOKE EXECUTE ON FUNCTION public.upsert_notification_target_unread(
  uuid, text, text, text, uuid, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_notification_target_unread(
  uuid, text, text, text, uuid, jsonb, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- B) Orphan — present on linked project advisor export; absent from main migrations
-- Identity: advisor metadata arguments = "p_user_id uuid" → (uuid)
-- Conditional: skip if not installed (local/fresh apply)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.dibay_reconcile_stale_badge_facts(uuid)') IS NULL THEN
    RAISE NOTICE 'phase7: skip orphan dibay_reconcile_stale_badge_facts(uuid) — not present';
    RETURN;
  END IF;

  REVOKE EXECUTE ON FUNCTION public.dibay_reconcile_stale_badge_facts(uuid)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.dibay_reconcile_stale_badge_facts(uuid)
    TO service_role;
END $$;

-- ---------------------------------------------------------------------------
-- C) Atomic mark-read — 20261005120000; D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING = false
-- No product route / browser / authenticated JWT .rpc callers in repo.
-- JWT canary later: separate migration to GRANT authenticated.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.dibay_messenger_domain_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dibay_messenger_domain_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dibay_store_order_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dibay_store_order_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text, text, uuid, uuid
) TO service_role;

COMMIT;
