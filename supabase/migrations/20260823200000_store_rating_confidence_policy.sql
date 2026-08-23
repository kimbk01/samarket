-- Rating confidence C authority only.
-- Singleton maintained global public-review mean (O(1) read).
-- sort=rating comparator / prior_weight value: OUT (HOLD).

CREATE TABLE IF NOT EXISTS public.store_rating_confidence_policy (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rating_sum numeric NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  global_mean_rating numeric NULL,
  prior_weight numeric NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_rating_confidence_policy IS
  'Singleton rating-confidence authority. global_mean_rating (C) = maintained public review population mean. prior_weight (m) product policy — NULL until decided. Not browse sort comparator.';

COMMENT ON COLUMN public.store_rating_confidence_policy.rating_sum IS
  'Sum of public-visible store_reviews.rating (same predicate as refresh_store_public_rating_aggregate).';

COMMENT ON COLUMN public.store_rating_confidence_policy.rating_count IS
  'Count of public-visible rated store_reviews contributing to C.';

COMMENT ON COLUMN public.store_rating_confidence_policy.global_mean_rating IS
  'C = rating_sum / rating_count when rating_count > 0; else NULL. Never request-path AVG scan.';

COMMENT ON COLUMN public.store_rating_confidence_policy.prior_weight IS
  'Bayesian m (product policy). NULL = undecided. Do not invent defaults in this cut.';

CREATE OR REPLACE FUNCTION public.store_rating_confidence_is_public_contrib(
  p_rating numeric,
  p_status text,
  p_visible_to_public boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_status = 'visible'
    AND COALESCE(p_visible_to_public, false) = true
    AND p_rating IS NOT NULL
    AND p_rating >= 1
    AND p_rating <= 5;
$$;

COMMENT ON FUNCTION public.store_rating_confidence_is_public_contrib(numeric, text, boolean) IS
  'Public review predicate for C — mirrors refresh_store_public_rating_aggregate / reviews-summary.';

CREATE OR REPLACE FUNCTION public.store_rating_confidence_apply_delta(
  p_delta_sum numeric,
  p_delta_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum numeric;
  v_count integer;
BEGIN
  IF p_delta_sum = 0 AND p_delta_count = 0 THEN
    RETURN;
  END IF;

  SELECT rating_sum, rating_count
  INTO v_sum, v_count
  FROM public.store_rating_confidence_policy
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.store_rating_confidence_policy (id, rating_sum, rating_count, global_mean_rating, prior_weight)
    VALUES (1, 0, 0, NULL, NULL);
    v_sum := 0;
    v_count := 0;
  END IF;

  v_sum := COALESCE(v_sum, 0) + COALESCE(p_delta_sum, 0);
  v_count := COALESCE(v_count, 0) + COALESCE(p_delta_count, 0);

  IF v_count < 0 THEN
    RAISE EXCEPTION 'store_rating_confidence_policy: rating_count would be negative (%)', v_count;
  END IF;

  IF v_count = 0 THEN
    v_sum := 0;
  END IF;

  UPDATE public.store_rating_confidence_policy
  SET
    rating_sum = v_sum,
    rating_count = v_count,
    global_mean_rating = CASE
      WHEN v_count > 0 THEN v_sum / v_count
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = 1;
END;
$$;

COMMENT ON FUNCTION public.store_rating_confidence_apply_delta(numeric, integer) IS
  'Incremental C writer. No full-table AVG. Locks singleton row.';

CREATE OR REPLACE FUNCTION public.trg_store_reviews_rating_confidence_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta_sum numeric := 0;
  v_delta_count integer := 0;
  v_old_public boolean := false;
  v_new_public boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.store_rating_confidence_is_public_contrib(NEW.rating, NEW.status, NEW.visible_to_public) THEN
      v_delta_sum := NEW.rating;
      v_delta_count := 1;
    END IF;
    PERFORM public.store_rating_confidence_apply_delta(v_delta_sum, v_delta_count);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF public.store_rating_confidence_is_public_contrib(OLD.rating, OLD.status, OLD.visible_to_public) THEN
      v_delta_sum := -OLD.rating;
      v_delta_count := -1;
    END IF;
    PERFORM public.store_rating_confidence_apply_delta(v_delta_sum, v_delta_count);
    RETURN OLD;
  END IF;

  -- UPDATE: remove OLD contribution, add NEW contribution (covers rating/status/visible/store_id).
  v_old_public := public.store_rating_confidence_is_public_contrib(OLD.rating, OLD.status, OLD.visible_to_public);
  v_new_public := public.store_rating_confidence_is_public_contrib(NEW.rating, NEW.status, NEW.visible_to_public);

  IF v_old_public THEN
    v_delta_sum := v_delta_sum - OLD.rating;
    v_delta_count := v_delta_count - 1;
  END IF;
  IF v_new_public THEN
    v_delta_sum := v_delta_sum + NEW.rating;
    v_delta_count := v_delta_count + 1;
  END IF;

  PERFORM public.store_rating_confidence_apply_delta(v_delta_sum, v_delta_count);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS store_reviews_rating_confidence_policy ON public.store_reviews;

CREATE TRIGGER store_reviews_rating_confidence_policy
  AFTER INSERT OR UPDATE OF store_id, rating, status, visible_to_public OR DELETE
  ON public.store_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_store_reviews_rating_confidence_policy();

COMMENT ON TRIGGER store_reviews_rating_confidence_policy ON public.store_reviews IS
  'Maintains store_rating_confidence_policy C via OLD/NEW delta. Separate from store-local rating aggregate trigger.';

ALTER TABLE public.store_rating_confidence_policy ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.store_rating_confidence_policy FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_rating_confidence_policy TO service_role;

REVOKE ALL ON FUNCTION public.store_rating_confidence_is_public_contrib(numeric, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_rating_confidence_apply_delta(numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_store_reviews_rating_confidence_policy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_rating_confidence_is_public_contrib(numeric, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_rating_confidence_apply_delta(numeric, integer) TO service_role;

-- One-time initial C from public review population (apply-time only; not request path).
INSERT INTO public.store_rating_confidence_policy (
  id,
  rating_sum,
  rating_count,
  global_mean_rating,
  prior_weight,
  updated_at
)
SELECT
  1,
  COALESCE(SUM(r.rating), 0),
  COUNT(*)::integer,
  CASE
    WHEN COUNT(*) > 0 THEN SUM(r.rating)::numeric / COUNT(*)
    ELSE NULL
  END,
  NULL,
  now()
FROM public.store_reviews AS r
WHERE r.status = 'visible'
  AND r.visible_to_public = true
  AND r.rating IS NOT NULL
  AND r.rating BETWEEN 1 AND 5
ON CONFLICT (id) DO UPDATE
SET
  rating_sum = EXCLUDED.rating_sum,
  rating_count = EXCLUDED.rating_count,
  global_mean_rating = EXCLUDED.global_mean_rating,
  -- prior_weight intentionally not overwritten (product policy; still undecided).
  updated_at = EXCLUDED.updated_at;
