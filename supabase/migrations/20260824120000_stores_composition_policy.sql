-- C2 — Stores Composition Policy (Admin overrides only; C1 defaults remain in code)

BEGIN;

CREATE TABLE IF NOT EXISTS public.store_composition_policy_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL CHECK (surface IN ('home', 'browse')),
  slot text NOT NULL,
  enabled boolean NOT NULL,
  section_order integer NOT NULL,
  max_items integer,
  interval_consumed boolean NOT NULL DEFAULT false,
  interval_every_n integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES auth.users(id),
  updated_by_user_id uuid REFERENCES auth.users(id),
  CONSTRAINT store_composition_policy_overrides_surface_slot_key UNIQUE (surface, slot),
  CONSTRAINT store_composition_policy_overrides_max_nonneg CHECK (max_items IS NULL OR max_items >= 0),
  CONSTRAINT store_composition_policy_overrides_order_nonneg CHECK (section_order >= 0),
  CONSTRAINT store_composition_policy_overrides_interval_chk CHECK (
    (interval_consumed = false AND interval_every_n IS NULL)
    OR (interval_consumed = true AND interval_every_n IS NOT NULL AND interval_every_n > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_store_composition_policy_overrides_surface_order
  ON public.store_composition_policy_overrides (surface, section_order);

CREATE TABLE IF NOT EXISTS public.store_composition_policy_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL,
  slot text NOT NULL,
  action_type text NOT NULL,
  admin_id uuid REFERENCES auth.users(id),
  admin_nickname text NOT NULL DEFAULT '',
  before_json jsonb,
  after_json jsonb,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_composition_policy_logs_created
  ON public.store_composition_policy_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_composition_policy_logs_surface_slot
  ON public.store_composition_policy_logs (surface, slot, created_at DESC);

COMMENT ON TABLE public.store_composition_policy_overrides IS
  'C2 Admin composition policy overrides. Missing row => C1 default policy in application code.';

COMMENT ON TABLE public.store_composition_policy_logs IS
  'C2 composition policy change audit trail (domain-specific; not full audit_logs replacement).';

CREATE OR REPLACE FUNCTION public.set_store_composition_policy_overrides_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_composition_policy_overrides_updated_at
  ON public.store_composition_policy_overrides;
CREATE TRIGGER trg_store_composition_policy_overrides_updated_at
  BEFORE UPDATE ON public.store_composition_policy_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_store_composition_policy_overrides_updated_at();

ALTER TABLE public.store_composition_policy_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_composition_policy_logs ENABLE ROW LEVEL SECURITY;

COMMIT;
