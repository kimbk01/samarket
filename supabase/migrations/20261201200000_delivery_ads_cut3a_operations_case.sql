-- PRODUCT CUT 3-A — Delivery Ads operations Case / Thread binding.
-- Dual FK campaign identity · ONE CAMPAIGN → ONE CASE · ONE CASE → ONE THREAD.
-- No lifecycle RPC · no notification · no message APIs · no Care/messenger overload.

BEGIN;

CREATE TABLE IF NOT EXISTS public.delivery_ad_operations_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_kind text NOT NULL
    CHECK (product_kind IN ('store_sponsored', 'banner')),
  store_sponsored_campaign_id uuid NULL
    REFERENCES public.store_paid_ad_campaigns (id) ON DELETE CASCADE,
  banner_campaign_id uuid NULL
    REFERENCES public.store_banner_ad_campaigns (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'WAITING_OWNER', 'WAITING_ADMIN', 'RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT delivery_ad_operations_cases_exactly_one_campaign CHECK (
    (
      product_kind = 'store_sponsored'
      AND store_sponsored_campaign_id IS NOT NULL
      AND banner_campaign_id IS NULL
    )
    OR
    (
      product_kind = 'banner'
      AND banner_campaign_id IS NOT NULL
      AND store_sponsored_campaign_id IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_ad_ops_cases_sponsored_campaign_uidx
  ON public.delivery_ad_operations_cases (store_sponsored_campaign_id)
  WHERE store_sponsored_campaign_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_ad_ops_cases_banner_campaign_uidx
  ON public.delivery_ad_operations_cases (banner_campaign_id)
  WHERE banner_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS delivery_ad_ops_cases_owner_updated_idx
  ON public.delivery_ad_operations_cases (owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS delivery_ad_ops_cases_status_updated_idx
  ON public.delivery_ad_operations_cases (status, updated_at DESC);

COMMENT ON TABLE public.delivery_ad_operations_cases IS
  'CUT 3-A Delivery Ads operations case. Ops conversation state only — never campaign lifecycle. ONE campaign → ONE case via dual FK uniqueness.';

CREATE TABLE IF NOT EXISTS public.delivery_ad_operations_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL UNIQUE
    REFERENCES public.delivery_ad_operations_cases (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_ad_ops_threads_case_idx
  ON public.delivery_ad_operations_threads (case_id);

COMMENT ON TABLE public.delivery_ad_operations_threads IS
  'CUT 3-A thin campaign-bound ops thread. ONE case → ONE thread via UNIQUE(case_id). Not a product messenger.';

-- Message table deferred to 3-B/3-C (not required for Case/Thread uniqueness).

ALTER TABLE public.delivery_ad_operations_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_operations_threads ENABLE ROW LEVEL SECURITY;

-- Writes: service_role / server only (no authenticated INSERT/UPDATE/DELETE policies).
REVOKE ALL ON TABLE public.delivery_ad_operations_cases FROM PUBLIC;
REVOKE ALL ON TABLE public.delivery_ad_operations_cases FROM anon, authenticated;
GRANT SELECT ON TABLE public.delivery_ad_operations_cases TO authenticated;
GRANT ALL ON TABLE public.delivery_ad_operations_cases TO service_role;

REVOKE ALL ON TABLE public.delivery_ad_operations_threads FROM PUBLIC;
REVOKE ALL ON TABLE public.delivery_ad_operations_threads FROM anon, authenticated;
GRANT SELECT ON TABLE public.delivery_ad_operations_threads TO authenticated;
GRANT ALL ON TABLE public.delivery_ad_operations_threads TO service_role;

DROP POLICY IF EXISTS delivery_ad_ops_cases_owner_select ON public.delivery_ad_operations_cases;
CREATE POLICY delivery_ad_ops_cases_owner_select
  ON public.delivery_ad_operations_cases
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS delivery_ad_ops_cases_admin_select ON public.delivery_ad_operations_cases;
CREATE POLICY delivery_ad_ops_cases_admin_select
  ON public.delivery_ad_operations_cases
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS delivery_ad_ops_threads_owner_select ON public.delivery_ad_operations_threads;
CREATE POLICY delivery_ad_ops_threads_owner_select
  ON public.delivery_ad_operations_threads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_ad_operations_cases c
      WHERE c.id = case_id
        AND c.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS delivery_ad_ops_threads_admin_select ON public.delivery_ad_operations_threads;
CREATE POLICY delivery_ad_ops_threads_admin_select
  ON public.delivery_ad_operations_threads
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

COMMIT;
