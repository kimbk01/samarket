-- Corrective: reconcile repo schema authority to Production Live jsonb contract.
-- OWNER DECISION A — Live canonical:
--   admin_staff_permissions(
--     user_id PK,
--     permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
--     updated_at,
--     updated_by
--   )
-- Does NOT rewrite/delete applied migration 20260614120000.
-- Production already matching Live jsonb → NO-OP (no destructive DDL).
-- Fresh replay after permission_key row model → convert once to jsonb.

DO $$
DECLARE
  has_table boolean;
  has_permission_key boolean;
  has_permissions boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_staff_permissions'
  ) INTO has_table;

  IF NOT has_table THEN
    CREATE TABLE public.admin_staff_permissions (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES auth.users(id)
    );
    CREATE INDEX IF NOT EXISTS admin_staff_permissions_user_idx
      ON public.admin_staff_permissions (user_id);
    COMMENT ON TABLE public.admin_staff_permissions IS
      'Granular admin permissions per staff user';
    ALTER TABLE public.admin_staff_permissions ENABLE ROW LEVEL SECURITY;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_staff_permissions'
      AND column_name = 'permission_key'
  ) INTO has_permission_key;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_staff_permissions'
      AND column_name = 'permissions'
  ) INTO has_permissions;

  -- Production Live / already canonical: permissions jsonb, no permission_key → NO-OP.
  IF has_permissions AND NOT has_permission_key THEN
    ALTER TABLE public.admin_staff_permissions
      ALTER COLUMN permissions SET DEFAULT '[]'::jsonb;
    ALTER TABLE public.admin_staff_permissions
      ALTER COLUMN permissions SET NOT NULL;
    RETURN;
  END IF;

  -- Repo replay path: convert permission_key rows → one jsonb array per user_id.
  IF has_permission_key AND NOT has_permissions THEN
    CREATE TABLE public.admin_staff_permissions__jsonb_canonical (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES auth.users(id)
    );

    INSERT INTO public.admin_staff_permissions__jsonb_canonical (
      user_id,
      permissions,
      updated_at,
      updated_by
    )
    SELECT
      asp.user_id,
      COALESCE(
        jsonb_agg(asp.permission_key ORDER BY asp.permission_key),
        '[]'::jsonb
      ),
      COALESCE(max(asp.created_at), now()),
      (array_agg(asp.granted_by ORDER BY asp.created_at DESC NULLS LAST))[1]
    FROM public.admin_staff_permissions asp
    GROUP BY asp.user_id;

    DROP TABLE public.admin_staff_permissions;
    ALTER TABLE public.admin_staff_permissions__jsonb_canonical
      RENAME TO admin_staff_permissions;

    CREATE INDEX IF NOT EXISTS admin_staff_permissions_user_idx
      ON public.admin_staff_permissions (user_id);

    COMMENT ON TABLE public.admin_staff_permissions IS
      'Granular admin permissions per staff user';

    ALTER TABLE public.admin_staff_permissions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS admin_staff_permissions_select_admin
      ON public.admin_staff_permissions;
    CREATE POLICY admin_staff_permissions_select_admin
      ON public.admin_staff_permissions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.is_admin = true
        )
      );

    RETURN;
  END IF;

  -- Hybrid (should not happen on Production Live): fail-fast, no silent guess.
  IF has_permission_key AND has_permissions THEN
    RAISE EXCEPTION
      'admin_staff_permissions hybrid schema (permission_key + permissions) — manual reconcile required';
  END IF;
END $$;
