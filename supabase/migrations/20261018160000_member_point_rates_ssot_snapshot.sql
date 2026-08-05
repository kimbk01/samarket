-- Phase 4 Slice 3: Member Rates SSOT (point_plans) + charge rate snapshots
-- Out of scope: store charge payment ratio constant and store writers

CREATE TABLE IF NOT EXISTS public.point_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ko text NOT NULL,
  name_en text NOT NULL,
  description_ko text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  payment_amount integer NOT NULL CHECK (payment_amount >= 0),
  point_amount integer NOT NULL CHECK (point_amount >= 0),
  bonus_amount integer NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  rate_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT point_plans_currency_check CHECK (currency IN ('PHP', 'KRW', 'USD'))
);

ALTER TABLE public.point_plans
  ADD COLUMN IF NOT EXISTS rate_version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_point_plans_active_sort
  ON public.point_plans (is_active, sort_order ASC, created_at ASC);

ALTER TABLE public.point_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "point_plans_select_active" ON public.point_plans;
CREATE POLICY "point_plans_select_active"
  ON public.point_plans
  FOR SELECT
  USING (is_active = true);

INSERT INTO public.point_plans (
  id, name_ko, name_en, description_ko, description_en,
  payment_amount, point_amount, bonus_amount, currency, is_active, sort_order, rate_version
) VALUES
  (
    'a1000001-0001-4000-8000-000000000001',
    '1,000P',
    '1,000P',
    '₱1,000 결제 시 1,000P',
    '₱1,000 for 1,000P',
    1000, 1000, 0, 'PHP', true, 10, 1
  ),
  (
    'a1000002-0002-4000-8000-000000000002',
    '5,000P (+5% 보너스)',
    '5,000P (+5% bonus)',
    '₱5,000 결제 시 5,250P',
    '₱5,000 for 5,250P',
    5000, 5000, 250, 'PHP', true, 20, 1
  ),
  (
    'a1000003-0003-4000-8000-000000000003',
    '10,000P (+10% 보너스)',
    '10,000P (+10% bonus)',
    '₱10,000 결제 시 11,000P',
    '₱10,000 for 11,000P',
    10000, 10000, 1000, 'PHP', true, 30, 1
  )
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.point_charge_requests
  ADD COLUMN IF NOT EXISTS applied_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_version integer NOT NULL DEFAULT 1;

UPDATE public.point_charge_requests
   SET applied_rate = CASE
         WHEN payment_amount > 0 THEN (point_amount::numeric / payment_amount::numeric)
         ELSE 0
       END,
       rate_version = GREATEST(1, COALESCE(rate_version, 1))
 WHERE applied_rate = 0
    OR rate_version IS NULL
    OR rate_version < 1;

COMMENT ON COLUMN public.point_plans.rate_version IS
  'Member Rates SSOT version; bump on payment/point/bonus/currency change';
COMMENT ON COLUMN public.point_charge_requests.applied_rate IS
  'Snapshot: total_points / payment_amount at charge create; immutable for history';
COMMENT ON COLUMN public.point_charge_requests.rate_version IS
  'Snapshot of point_plans.rate_version at charge create; immutable for history';
