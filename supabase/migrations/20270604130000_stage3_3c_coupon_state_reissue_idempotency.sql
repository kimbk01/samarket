-- Stage 3-C (RC-8) coupons: IA-04 (=ADS-20) admin-pause marker, IA-05 reissue idempotency, ADS-23 auto end,
-- ADS-24 one use per buyer.
--
-- Production base (read-only, 2026-10-21, project ckdosyydvgzqwpbwuhon):
--   * public.store_coupon_campaigns has NO paused_by / source_campaign_id / client_request_id columns, no triggers.
--     69 rows: active+is_active 41, active+!is_active 13, paused 10, ended 3, revoked 2; max_uses_per_user = 1 on all.
--   * every open (active/scheduled/paused) row already has end_at <= 2026-09-25 03:40 UTC (64 rows) -> none of them
--     is touched by the auto end below (end_at >= c_apply_from = 2026-10-21 00:00 UTC). D-5: no past row changes.
--   * store_coupon_redemptions keeps the stage-2 partial unique index store_coupon_redemptions_buyer_campaign_active_uidx
--     (buyer_user_id, campaign_id) WHERE reversed_at IS NULL -> a 2nd simultaneous use per buyer is impossible, so the
--     product contract is max_uses_per_user = 1 (ADS-24). That index and restore_store_coupon_entitlement
--     (md5 a9913e9716fe8da677c51387fabf4d0b) are NOT changed here. claim_store_coupon
--     (md5 2d2885296dbc6d044b93c9b7cc13a4ae) and create_store_order_atomic (md5 adc3d68faece57cb3160306f6d5e686e)
--     are NOT changed here.
--
-- No existing function is redefined. New function: public.store_coupon_campaigns_auto_end_expired(integer)
--   (expected md5(prosrc) is printed by supabase/tests/isolated/stage3-3c/run.sh).
--
-- What this adds (all additive, existing rows unchanged):
--   1. paused_by text NULL CHECK (owner|admin). The admin route writes 'admin' on pause; the owner route refuses to
--      resume a row with paused_by = 'admin' (403). Existing 10 paused rows stay NULL -> owner resume still allowed
--      (past rows keep their meaning, D-5 / design 3-C IA-04 field 7).
--   2. source_campaign_id uuid NULL (FK -> store_coupon_campaigns ON DELETE SET NULL) + client_request_id text NULL and
--      UNIQUE (store_id, source_campaign_id, client_request_id) WHERE client_request_id IS NOT NULL -> one reissue per
--      form key (IA-05). Existing rows: both NULL, outside the partial index.
--   3. CHECK (max_uses_per_user = 1) NOT VALID (ADS-24): new / updated rows only; old rows are not re-validated.
--   4. store_coupon_campaigns_auto_end_expired(p_limit): lifecycle active/scheduled/paused -> ended, is_active false,
--      only for end_at in [c_apply_from, now()] (ADS-23). Called by the existing delivery-ads-schedule-transitions cron.
--
-- Lock / runtime: ADD COLUMN (no default) + CREATE UNIQUE INDEX on a 69-row table - milliseconds.
-- Idempotent: IF NOT EXISTS / pg_constraint guards / CREATE OR REPLACE.
--
-- Rollback (manual, only if required; contains DROP statements the apply tool cannot run - run in SQL editor):
--   DROP FUNCTION IF EXISTS public.store_coupon_campaigns_auto_end_expired(integer);
--   DROP INDEX IF EXISTS public.store_coupon_campaigns_reissue_request_uidx;
--   ALTER TABLE public.store_coupon_campaigns DROP CONSTRAINT IF EXISTS store_coupon_campaigns_max_uses_one_chk;
--   ALTER TABLE public.store_coupon_campaigns DROP CONSTRAINT IF EXISTS store_coupon_campaigns_client_request_id_chk;
--   ALTER TABLE public.store_coupon_campaigns DROP CONSTRAINT IF EXISTS store_coupon_campaigns_source_campaign_fk;
--   ALTER TABLE public.store_coupon_campaigns DROP CONSTRAINT IF EXISTS store_coupon_campaigns_paused_by_chk;
--   ALTER TABLE public.store_coupon_campaigns DROP COLUMN IF EXISTS client_request_id,
--     DROP COLUMN IF EXISTS source_campaign_id, DROP COLUMN IF EXISTS paused_by;
--   (web code must be rolled back first: it selects / writes these columns.)

ALTER TABLE public.store_coupon_campaigns ADD COLUMN IF NOT EXISTS paused_by text;
ALTER TABLE public.store_coupon_campaigns ADD COLUMN IF NOT EXISTS source_campaign_id uuid;
ALTER TABLE public.store_coupon_campaigns ADD COLUMN IF NOT EXISTS client_request_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.store_coupon_campaigns'::regclass AND conname = 'store_coupon_campaigns_paused_by_chk'
  ) THEN
    ALTER TABLE public.store_coupon_campaigns
      ADD CONSTRAINT store_coupon_campaigns_paused_by_chk
      CHECK (paused_by IS NULL OR paused_by = ANY (ARRAY['owner'::text, 'admin'::text]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.store_coupon_campaigns'::regclass AND conname = 'store_coupon_campaigns_source_campaign_fk'
  ) THEN
    ALTER TABLE public.store_coupon_campaigns
      ADD CONSTRAINT store_coupon_campaigns_source_campaign_fk
      FOREIGN KEY (source_campaign_id) REFERENCES public.store_coupon_campaigns(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.store_coupon_campaigns'::regclass AND conname = 'store_coupon_campaigns_client_request_id_chk'
  ) THEN
    ALTER TABLE public.store_coupon_campaigns
      ADD CONSTRAINT store_coupon_campaigns_client_request_id_chk
      CHECK (client_request_id IS NULL OR length(client_request_id) BETWEEN 8 AND 128);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.store_coupon_campaigns'::regclass AND conname = 'store_coupon_campaigns_max_uses_one_chk'
  ) THEN
    ALTER TABLE public.store_coupon_campaigns
      ADD CONSTRAINT store_coupon_campaigns_max_uses_one_chk
      CHECK (max_uses_per_user = 1) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS store_coupon_campaigns_reissue_request_uidx
  ON public.store_coupon_campaigns (store_id, source_campaign_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

COMMENT ON COLUMN public.store_coupon_campaigns.paused_by IS
  'Stage 3-C IA-04: who paused the campaign (owner|admin). admin -> owner cannot resume. NULL on legacy rows.';
COMMENT ON COLUMN public.store_coupon_campaigns.client_request_id IS
  'Stage 3-C IA-05: owner reissue form key; unique per (store_id, source_campaign_id).';

-- ADS-23: lifecycle follows the claim window for campaigns that end after the apply instant (past rows unchanged).
CREATE OR REPLACE FUNCTION public.store_coupon_campaigns_auto_end_expired(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  c_apply_from constant timestamptz := '2026-10-21 00:00:00+00';
  v_ids uuid[];
BEGIN
  WITH due AS (
    SELECT c.id
      FROM public.store_coupon_campaigns c
     WHERE c.lifecycle_state IN ('active', 'scheduled', 'paused')
       AND c.end_at <= now()
       AND c.end_at >= c_apply_from
     ORDER BY c.end_at, c.id
     LIMIT greatest(1, least(coalesce(p_limit, 500), 2000))
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.store_coupon_campaigns c
       SET lifecycle_state = 'ended',
           is_active = false,
           updated_at = now()
      FROM due
     WHERE c.id = due.id
       AND c.lifecycle_state IN ('active', 'scheduled', 'paused')
    RETURNING c.id
  )
  SELECT coalesce(array_agg(upd.id), ARRAY[]::uuid[]) INTO v_ids FROM upd;

  INSERT INTO public.coupon_audit_events (campaign_id, actor_user_id, action, payload)
  SELECT x.id, NULL, 'system_auto_end', jsonb_build_object('reason', 'end_at_passed')
    FROM unnest(v_ids) AS x(id);

  RETURN jsonb_build_object('ok', true, 'ended', coalesce(array_length(v_ids, 1), 0));
END
$fn$;

REVOKE ALL ON FUNCTION public.store_coupon_campaigns_auto_end_expired(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_coupon_campaigns_auto_end_expired(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_coupon_campaigns_auto_end_expired(integer) TO service_role;
