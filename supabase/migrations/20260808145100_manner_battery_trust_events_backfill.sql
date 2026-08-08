-- Manner Battery: backfill trust_events from reputation_logs (proven provenance).
-- IGNORE_FROM_BACKFILL: report (pending -5), dispute_hold, dispute_release.
-- Admin absolute overwrite rows are not reconstructed as behavioral events;
-- admin_adjust deltas become platform manual_adjustment with provenance.

-- Trade completions
INSERT INTO public.trust_events (
  member_id,
  domain,
  event_type,
  source_type,
  source_id,
  direction,
  severity,
  status,
  occurred_at,
  confirmed_at,
  idempotency_key,
  policy_version,
  metadata
)
SELECT
  rl.user_id,
  'trade',
  'trade_completed',
  'legacy_reputation_log',
  COALESCE(rl.source_id, rl.id),
  'positive',
  'none',
  'confirmed',
  COALESCE(rl.created_at, now()),
  COALESCE(rl.created_at, now()),
  CASE
    WHEN rl.source_id IS NOT NULL
      THEN 'trade_completed:' || rl.source_id::text || ':' || rl.user_id::text
    ELSE 'trade_completed:legacy:' || rl.id::text || ':' || rl.user_id::text
  END,
  'manner_trade_v1',
  jsonb_build_object(
    'legacy_reputation_log_id', rl.id,
    'legacy_source_type', rl.source_type,
    'legacy_delta', rl.delta,
    'legacy_reason', rl.reason
  )
FROM public.reputation_logs rl
WHERE rl.source_type = 'trade_complete'
  AND COALESCE(rl.status, 'applied') IN ('applied', 'held', 'released')
ON CONFLICT (idempotency_key) DO NOTHING;

-- Reviews → good / normal / bad by legacy delta sign/magnitude
INSERT INTO public.trust_events (
  member_id,
  domain,
  event_type,
  source_type,
  source_id,
  direction,
  severity,
  status,
  occurred_at,
  confirmed_at,
  idempotency_key,
  policy_version,
  metadata
)
SELECT
  rl.user_id,
  'trade',
  CASE
    WHEN COALESCE(rl.delta, 0) < 0 THEN 'trade_review_bad'
    WHEN COALESCE(rl.delta, 0) > 0.2 THEN 'trade_review_good'
    ELSE 'trade_review_normal'
  END,
  'legacy_reputation_log',
  COALESCE(rl.source_id, rl.id),
  CASE
    WHEN COALESCE(rl.delta, 0) < 0 THEN 'negative'
    WHEN COALESCE(rl.delta, 0) > 0.2 THEN 'positive'
    ELSE 'neutral'
  END,
  CASE WHEN COALESCE(rl.delta, 0) < 0 THEN 'low' ELSE 'none' END,
  'confirmed',
  COALESCE(rl.created_at, now()),
  COALESCE(rl.created_at, now()),
  CASE
    WHEN rl.source_id IS NOT NULL
      THEN 'trade_review:' || rl.source_id::text || ':' || rl.user_id::text
    ELSE 'trade_review:legacy:' || rl.id::text || ':' || rl.user_id::text
  END,
  'manner_trade_v1',
  jsonb_build_object(
    'legacy_reputation_log_id', rl.id,
    'legacy_source_type', rl.source_type,
    'legacy_delta', rl.delta,
    'legacy_reason', rl.reason
  )
FROM public.reputation_logs rl
WHERE rl.source_type IN ('review', 'manner_positive')
  AND COALESCE(rl.status, 'applied') IN ('applied', 'held', 'released')
ON CONFLICT (idempotency_key) DO NOTHING;

-- Admin adjustments with provenance (NOT absolute overwrite)
INSERT INTO public.trust_events (
  member_id,
  domain,
  event_type,
  source_type,
  source_id,
  direction,
  severity,
  status,
  occurred_at,
  confirmed_at,
  idempotency_key,
  policy_version,
  metadata
)
SELECT
  rl.user_id,
  'platform',
  'manual_adjustment',
  'legacy_admin_adjust',
  rl.id,
  'ops',
  'none',
  'confirmed',
  COALESCE(rl.created_at, now()),
  COALESCE(rl.created_at, now()),
  'manual_adjustment:legacy:' || rl.id::text || ':' || rl.user_id::text,
  'manner_trade_v1',
  jsonb_build_object(
    'adjustment', COALESCE(rl.delta, 0),
    'reason', COALESCE(rl.reason, 'legacy_admin_adjust'),
    'legacy_reputation_log_id', rl.id,
    'legacy_source_type', rl.source_type
  )
FROM public.reputation_logs rl
WHERE rl.source_type = 'admin_adjust'
  AND COALESCE(rl.delta, 0) <> 0
  AND COALESCE(rl.status, 'applied') IN ('applied', 'held', 'released')
ON CONFLICT (idempotency_key) DO NOTHING;

-- Explicitly NOT backfilled: report, dispute_hold, dispute_release, no_show without confirmed sanction contract.
COMMENT ON TABLE public.trust_events IS
  'DIBAY Manner Battery immutable trust event ledger (SSOT history). Backfill excludes pending report penalties.';
