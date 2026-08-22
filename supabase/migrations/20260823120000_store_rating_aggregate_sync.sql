-- Canonical public store rating snapshot: store_reviews → stores.rating_avg / review_count
-- Predicate matches GET /api/stores/:slug/reviews-summary (visible + visible_to_public).

CREATE OR REPLACE FUNCTION public.refresh_store_public_rating_aggregate(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_avg numeric := NULL;
BEGIN
  IF p_store_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)::integer,
    CASE
      WHEN COUNT(*) > 0 THEN ROUND((SUM(r.rating)::numeric / COUNT(*)), 1)
      ELSE NULL
    END
  INTO v_count, v_avg
  FROM public.store_reviews AS r
  WHERE r.store_id = p_store_id
    AND r.status = 'visible'
    AND r.visible_to_public = true
    AND r.rating IS NOT NULL
    AND r.rating BETWEEN 1 AND 5;

  UPDATE public.stores AS s
  SET
    rating_avg = v_avg,
    review_count = COALESCE(v_count, 0)
  WHERE s.id = p_store_id;
END;
$$;

COMMENT ON FUNCTION public.refresh_store_public_rating_aggregate(uuid) IS
  'Recompute stores.rating_avg/review_count from public-visible store_reviews.';

CREATE OR REPLACE FUNCTION public.trg_store_reviews_refresh_rating_aggregate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_store_public_rating_aggregate(OLD.store_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.store_id IS DISTINCT FROM NEW.store_id THEN
    PERFORM public.refresh_store_public_rating_aggregate(OLD.store_id);
  END IF;

  PERFORM public.refresh_store_public_rating_aggregate(NEW.store_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS store_reviews_refresh_rating_aggregate ON public.store_reviews;

CREATE TRIGGER store_reviews_refresh_rating_aggregate
  AFTER INSERT OR UPDATE OF store_id, rating, status, visible_to_public OR DELETE
  ON public.store_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_store_reviews_refresh_rating_aggregate();

-- Backfill all stores that have at least one review row (safe for empty stores).
DO $$
DECLARE
  v_store_id uuid;
BEGIN
  FOR v_store_id IN
    SELECT DISTINCT r.store_id
    FROM public.store_reviews AS r
    WHERE r.store_id IS NOT NULL
  LOOP
    PERFORM public.refresh_store_public_rating_aggregate(v_store_id);
  END LOOP;
END;
$$;
