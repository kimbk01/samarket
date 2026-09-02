-- DIBAY Support Center — Case / Message / Session SSOT (CUT 2).
-- Identity: MEMBER (owner_store_id NULL) vs OWNER (owner_store_id NOT NULL).
-- Writes: service_role API only. Reads: RLS + admin.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.support_case_public_no_seq START 100001;

CREATE TABLE IF NOT EXISTS public.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_case_no text NOT NULL UNIQUE,
  audience text NOT NULL CHECK (audience IN ('MEMBER', 'OWNER')),
  requester_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  owner_store_id uuid NULL REFERENCES public.stores (id) ON DELETE SET NULL,
  category text NOT NULL,
  subject text NOT NULL DEFAULT '',
  source_surface text NOT NULL DEFAULT '',
  reference_type text NULL,
  reference_id text NULL,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'WAITING_ADMIN', 'WAITING_USER', 'RESOLVED', 'ARCHIVED')),
  priority text NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
  assigned_admin_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  previous_case_id uuid NULL REFERENCES public.support_cases (id) ON DELETE SET NULL,
  requester_unread_count integer NOT NULL DEFAULT 0 CHECK (requester_unread_count >= 0),
  admin_unread_count integer NOT NULL DEFAULT 0 CHECK (admin_unread_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  first_admin_response_at timestamptz NULL,
  resolved_at timestamptz NULL,
  archived_at timestamptz NULL,
  CONSTRAINT support_cases_member_no_store CHECK (
    (audience = 'MEMBER' AND owner_store_id IS NULL)
    OR (audience = 'OWNER' AND owner_store_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_support_cases_requester_last
  ON public.support_cases (requester_user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_cases_owner_store_last
  ON public.support_cases (owner_store_id, last_message_at DESC)
  WHERE owner_store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_cases_admin_queue
  ON public.support_cases (status, admin_unread_count DESC, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_cases_assigned
  ON public.support_cases (assigned_admin_id, status, last_message_at DESC)
  WHERE assigned_admin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_cases_reference
  ON public.support_cases (reference_type, reference_id)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

COMMENT ON TABLE public.support_cases IS
  'Canonical DIBAY Support cases — MEMBER (no store) vs OWNER (store scoped).';

CREATE TABLE IF NOT EXISTS public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.support_cases (id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_support_sessions_case_open
  ON public.support_sessions (case_id, opened_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_support_sessions_one_open_per_case
  ON public.support_sessions (case_id)
  WHERE closed_at IS NULL;

COMMENT ON TABLE public.support_sessions IS
  'Support session lifecycle — NOT an auth token. Supabase auth remains access SSOT.';

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.support_cases (id) ON DELETE CASCADE,
  sender_type text NOT NULL
    CHECK (sender_type IN ('MEMBER', 'OWNER', 'ADMIN', 'SYSTEM')),
  sender_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  sender_admin_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  message_type text NOT NULL DEFAULT 'PUBLIC'
    CHECK (message_type IN ('PUBLIC', 'INTERNAL_NOTE')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_messages_sender_shape CHECK (
    (sender_type IN ('MEMBER', 'OWNER') AND sender_user_id IS NOT NULL AND sender_admin_id IS NULL)
    OR (sender_type = 'ADMIN' AND sender_admin_id IS NOT NULL)
    OR (sender_type = 'SYSTEM' AND sender_user_id IS NULL AND sender_admin_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_support_messages_case_created
  ON public.support_messages (case_id, created_at ASC);

COMMENT ON TABLE public.support_messages IS
  'Support case messages. INTERNAL_NOTE visible to admins only.';

CREATE TABLE IF NOT EXISTS public.support_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.support_cases (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_case_events_case_created
  ON public.support_case_events (case_id, created_at ASC);

COMMENT ON TABLE public.support_case_events IS
  'Immutable support case audit trail (assignment, status, priority).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_case_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_cases_requester_select ON public.support_cases;
CREATE POLICY support_cases_requester_select
  ON public.support_cases
  FOR SELECT
  TO authenticated
  USING (
    requester_user_id = auth.uid()
    AND (
      audience = 'MEMBER'
      OR (
        audience = 'OWNER'
        AND owner_store_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.stores s
          WHERE s.id = owner_store_id
            AND s.owner_user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS support_cases_admin_select ON public.support_cases;
CREATE POLICY support_cases_admin_select
  ON public.support_cases
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS support_sessions_requester_select ON public.support_sessions;
CREATE POLICY support_sessions_requester_select
  ON public.support_sessions
  FOR SELECT
  TO authenticated
  USING (requester_user_id = auth.uid());

DROP POLICY IF EXISTS support_sessions_admin_select ON public.support_sessions;
CREATE POLICY support_sessions_admin_select
  ON public.support_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS support_messages_requester_select ON public.support_messages;
CREATE POLICY support_messages_requester_select
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    message_type = 'PUBLIC'
    AND EXISTS (
      SELECT 1 FROM public.support_cases c
      WHERE c.id = case_id
        AND c.requester_user_id = auth.uid()
        AND (
          c.audience = 'MEMBER'
          OR (
            c.audience = 'OWNER'
            AND c.owner_store_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.stores s
              WHERE s.id = c.owner_store_id
                AND s.owner_user_id = auth.uid()
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS support_messages_admin_select ON public.support_messages;
CREATE POLICY support_messages_admin_select
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS support_case_events_admin_select ON public.support_case_events;
CREATE POLICY support_case_events_admin_select
  ON public.support_case_events
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Writes: service_role only (API validates identity)
REVOKE ALL ON TABLE public.support_cases FROM PUBLIC;
REVOKE ALL ON TABLE public.support_cases FROM anon, authenticated;
GRANT SELECT ON TABLE public.support_cases TO authenticated;
GRANT ALL ON TABLE public.support_cases TO service_role;

REVOKE ALL ON TABLE public.support_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.support_sessions FROM anon, authenticated;
GRANT SELECT ON TABLE public.support_sessions TO authenticated;
GRANT ALL ON TABLE public.support_sessions TO service_role;

REVOKE ALL ON TABLE public.support_messages FROM PUBLIC;
REVOKE ALL ON TABLE public.support_messages FROM anon, authenticated;
GRANT SELECT ON TABLE public.support_messages TO authenticated;
GRANT ALL ON TABLE public.support_messages TO service_role;

REVOKE ALL ON TABLE public.support_case_events FROM PUBLIC;
REVOKE ALL ON TABLE public.support_case_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.support_case_events TO authenticated;
GRANT ALL ON TABLE public.support_case_events TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.support_case_public_no_seq TO service_role;

CREATE OR REPLACE FUNCTION public.allocate_support_public_case_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('public.support_case_public_no_seq');
  RETURN 'SC-' || n::text;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_support_public_case_no() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_support_public_case_no() TO service_role;

-- Realtime (messages wake requester/admin UIs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF to_regclass('public.support_messages') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = 'support_messages'
       ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages';
    END IF;
    IF to_regclass('public.support_cases') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = 'support_cases'
       ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.support_cases';
    END IF;
  END IF;
END $$;

COMMIT;
