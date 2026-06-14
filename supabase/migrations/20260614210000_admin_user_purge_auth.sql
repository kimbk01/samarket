-- Admin user DB purge: blocker RPC + moderation action 'purge'
-- Safe when 20260614120000_admin_users_management.sql was not applied yet.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) user_moderation_events — create if missing, then extend action CHECK
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS user_moderation_events_user_idx
  ON public.user_moderation_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_moderation_events_action_idx
  ON public.user_moderation_events (user_id, action, created_at DESC);

COMMENT ON TABLE public.user_moderation_events IS 'User moderation and deletion event log';

ALTER TABLE public.user_moderation_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('public.is_platform_admin(uuid)') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS user_moderation_events_select_admin ON public.user_moderation_events';
    EXECUTE $policy$
      CREATE POLICY user_moderation_events_select_admin ON public.user_moderation_events
        FOR SELECT
        USING (public.is_platform_admin(auth.uid()))
    $policy$;
  END IF;
END $$;

ALTER TABLE public.user_moderation_events
  DROP CONSTRAINT IF EXISTS user_moderation_events_action_check;

ALTER TABLE public.user_moderation_events
  ADD CONSTRAINT user_moderation_events_action_check
  CHECK (
    action IN (
      'warn',
      'suspend',
      'ban',
      'restore',
      'soft_delete',
      'hard_delete',
      'purge'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) admin_can_purge_auth_user RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_can_purge_auth_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers
  );
END;
$$;

COMMENT ON FUNCTION public.admin_can_purge_auth_user(uuid) IS
  'Returns blockers that prevent auth.users DELETE (ON DELETE RESTRICT / operational ownership).';

REVOKE ALL ON FUNCTION public.admin_can_purge_auth_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_can_purge_auth_user(uuid) TO service_role;

COMMIT;
