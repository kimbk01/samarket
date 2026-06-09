-- DIBAY messenger bottom_nav_chat surface verification
-- Migration: supabase/migrations/20260609120000_bottom_nav_chat_consumer_chat_room_only.sql
--
-- Replace :user_id with a test user UUID before running in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- 1) RPC definition — bottom_nav_chat must count consumer chat_room ONLY
--    (no trade target in messenger tab surface)
-- ---------------------------------------------------------------------------
WITH fn AS (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'count_notification_targets'
    AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_surface text, p_store_id uuid'
  LIMIT 1
),
branch AS (
  SELECT split_part(
    split_part(def, 'WHEN ''bottom_nav_chat'' THEN', 2),
    'WHEN ''bottom_nav_community'' THEN',
    1
  ) AS bottom_nav_branch
  FROM fn
)
SELECT
  CASE
    WHEN (SELECT def FROM fn) IS NULL THEN
      'FAIL: count_notification_targets function not found'
    WHEN strpos((SELECT def FROM fn), 'WHEN ''bottom_nav_chat'' THEN') = 0 THEN
      'FAIL: bottom_nav_chat CASE branch not found'
    WHEN (SELECT bottom_nav_branch FROM branch) LIKE '%target_type = ''chat_room''%'
      AND (SELECT bottom_nav_branch FROM branch) LIKE '%scope = ''consumer''%'
      AND (SELECT bottom_nav_branch FROM branch) NOT LIKE '%''trade''%'
    THEN 'PASS: bottom_nav_chat = chat_room only'
    ELSE 'FAIL: bottom_nav_chat still includes trade or missing chat_room-only branch'
  END AS rpc_surface_check;

-- ---------------------------------------------------------------------------
-- 2) Hub bundle snapshot for one user (3-axis badge surfaces)
-- ---------------------------------------------------------------------------
-- SELECT public.count_notification_targets_hub_bundle('00000000-0000-0000-0000-000000000000'::uuid);
--
-- Expected after migration + app bump routing:
--   bottom_nav_chat     = unread consumer chat_room targets (general CM rooms only in practice)
--   bottom_nav_delivery = unread buyer_order targets
--   trade unread        = NOT in bottom_nav_chat (trade target → tier1 bell / trade pillar UI)

-- ---------------------------------------------------------------------------
-- 3) Unread target breakdown by type (stale rows diagnostic)
-- ---------------------------------------------------------------------------
-- SELECT target_type, scope, count(*) AS unread_targets
-- FROM public.notification_targets
-- WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid
--   AND is_unread = true
-- GROUP BY target_type, scope
-- ORDER BY target_type, scope;
--
-- Note: legacy unread `trade` rows may still exist but must NOT affect bottom_nav_chat after migration.

-- ---------------------------------------------------------------------------
-- 4) Surface counts vs raw targets (cross-check)
-- ---------------------------------------------------------------------------
-- WITH uid AS (SELECT '00000000-0000-0000-0000-000000000000'::uuid AS user_id)
-- SELECT
--   public.count_notification_targets((SELECT user_id FROM uid), 'bottom_nav_chat') AS messenger_tab,
--   public.count_notification_targets((SELECT user_id FROM uid), 'bottom_nav_delivery') AS delivery_tab,
--   (SELECT count(*) FROM public.notification_targets t, uid
--    WHERE t.user_id = uid.user_id AND t.is_unread AND t.target_type = 'trade' AND t.scope = 'consumer') AS raw_trade_unread,
--   (SELECT count(*) FROM public.notification_targets t, uid
--    WHERE t.user_id = uid.user_id AND t.is_unread AND t.target_type = 'chat_room' AND t.scope = 'consumer') AS raw_chat_room_unread;

-- ---------------------------------------------------------------------------
-- 5) Manual scenario checklist (after migration + app deploy)
-- ---------------------------------------------------------------------------
-- A. Record messenger_tab_before from query (4).
-- B. Send ONE trade CM message to self (other account) as recipient.
-- C. Record messenger_tab_after — delta must be 0 (FAIL if +1).
-- D. trade target row may increment (raw_trade_unread) — OK for trade surface, not messenger tab.
-- E. Send ONE general friend DM — messenger_tab_after should +1.
-- F. Send ONE store order CM message as customer — delivery_tab +1, messenger_tab unchanged.
