-- Phase 3 S2-4 Delete preflight / verification (run against target DB)
-- Migration: 20261011150000_cm_group_delete_tombstone.sql

-- Columns
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'community_messenger_rooms'
  AND column_name IN ('deleted_at', 'deleted_by')
ORDER BY 1;

-- FK for deleted_by
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'community_messenger_rooms'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'deleted_by';

-- Indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'community_messenger_rooms'
  AND indexname IN (
    'community_messenger_rooms_active_non_deleted_idx',
    'community_messenger_rooms_deleted_at_idx'
  )
ORDER BY 1;

-- RPC + helper
SELECT proname, prosecdef AS security_definer, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'cm_group_room_is_deleted',
    'community_messenger_delete_private_group',
    'cm_block_write_on_deleted_group',
    'cm_block_rejoin_on_deleted_group',
    'get_community_messenger_unread_room_count'
  )
ORDER BY 1;

-- Grants on delete RPC
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'community_messenger_delete_private_group'
ORDER BY 1, 2;

-- Triggers
SELECT tgname, relname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND tgname IN (
    'cm_invite_links_block_deleted',
    'cm_join_requests_block_deleted',
    'cm_messages_block_deleted',
    'cm_participants_block_rejoin_deleted'
  )
ORDER BY 1;

-- Unread RPC mentions deleted_at
SELECT
  (pg_get_functiondef(p.oid) ILIKE '%deleted_at IS NULL%') AS unread_excludes_deleted
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'get_community_messenger_unread_room_count';

-- Delete RPC must not hard-delete rooms
SELECT
  (pg_get_functiondef(p.oid) ILIKE '%DELETE FROM%community_messenger_rooms%') AS hard_deletes_rooms
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'community_messenger_delete_private_group';
