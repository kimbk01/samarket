-- Rating confidence: lock product prior_weight m=10 (Bayesian).
-- sort=rating comparator consumes this authority; do not hardcode m in app code.

COMMENT ON COLUMN public.store_rating_confidence_policy.prior_weight IS
  'Bayesian m (product policy). LOCKED m=10: equal R/C weight at v=10. Matches Production review_count cliff (0–1 vs 10+).';

UPDATE public.store_rating_confidence_policy
SET
  prior_weight = 10,
  updated_at = now()
WHERE id = 1;

INSERT INTO public.store_rating_confidence_policy (
  id,
  rating_sum,
  rating_count,
  global_mean_rating,
  prior_weight,
  updated_at
)
VALUES (1, 0, 0, NULL, 10, now())
ON CONFLICT (id) DO UPDATE
SET
  prior_weight = 10,
  updated_at = now();
