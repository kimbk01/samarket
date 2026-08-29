-- CUT F — Admin Delivery Ads transactional lifecycle transition (CAS + audit)
-- EXECUTE: service_role only (revoke anon/authenticated from the start)

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_delivery_ad_transition(
  p_admin_user_id uuid,
  p_product_kind text,
  p_campaign_id uuid,
  p_action text,
  p_expected_lifecycle text,
  p_expected_updated_at timestamptz,
  p_reason text DEFAULT NULL,
  p_owner_visible_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text;
  v_row record;
  v_from text;
  v_to text;
  v_review text;
  v_is_active boolean;
  v_now timestamptz := now();
  v_go_live text;
  v_audit_action text;
BEGIN
  IF p_admin_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Canonical Application Admin gate
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  v_table := CASE
    WHEN p_product_kind = 'banner' THEN 'store_banner_ad_campaigns'
    ELSE 'store_paid_ad_campaigns'
  END;

  IF p_product_kind = 'banner' THEN
    SELECT * INTO v_row FROM public.store_banner_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  ELSE
    SELECT * INTO v_row FROM public.store_paid_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  v_from := v_row.lifecycle_status;

  -- CAS: expected lifecycle + updated_at
  IF p_expected_lifecycle IS NOT NULL AND v_from IS DISTINCT FROM p_expected_lifecycle THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_lifecycle', 'current', v_from);
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  END IF;

  -- Resolve target
  IF p_action = 'start_review' THEN
    v_to := 'UNDER_REVIEW'; v_review := 'IN_REVIEW'; v_audit_action := 'review_started';
  ELSIF p_action = 'request_changes' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'CHANGES_REQUESTED'; v_review := 'CHANGES_REQUESTED'; v_audit_action := 'changes_requested';
  ELSIF p_action = 'approve' THEN
    v_to := 'APPROVED'; v_review := 'APPROVED'; v_audit_action := 'approved';
  ELSIF p_action = 'reject' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'REJECTED'; v_review := 'REJECTED'; v_audit_action := 'rejected';
  ELSIF p_action = 'pause' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'PAUSED_ADMIN'; v_review := NULL; v_audit_action := 'paused_admin';
  ELSIF p_action = 'resume' THEN
    v_to := 'ACTIVE'; v_review := NULL; v_audit_action := 'resumed_admin';
  ELSIF p_action = 'end' THEN
    v_to := 'ENDED'; v_review := NULL; v_audit_action := 'ended_admin';
  ELSIF p_action = 'terminate' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'TERMINATED'; v_review := NULL; v_audit_action := 'terminated_admin';
  ELSIF p_action = 'archive' THEN
    v_to := 'ARCHIVED'; v_review := NULL; v_audit_action := 'archived';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  -- Lightweight transition allowlist (mirrors delivery-ad-lifecycle ADMIN edges)
  -- Approve composites UNDER_REVIEW → SCHEDULED|ACTIVE in one txn after go-live resolve.
  IF p_action = 'approve' THEN
    IF v_from IS DISTINCT FROM 'UNDER_REVIEW' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', 'APPROVED');
    END IF;
  ELSIF NOT (
    (v_from = 'SUBMITTED' AND v_to = 'UNDER_REVIEW') OR
    (v_from = 'UNDER_REVIEW' AND v_to IN ('CHANGES_REQUESTED','REJECTED')) OR
    (v_from IN ('ACTIVE','SCHEDULED') AND v_to = 'PAUSED_ADMIN') OR
    (v_from = 'PAUSED_ADMIN' AND v_to = 'ACTIVE') OR
    (v_from IN ('ACTIVE','SCHEDULED','PAUSED_ADMIN','PAUSED_OWNER') AND v_to IN ('ENDED','TERMINATED')) OR
    (v_from IN ('ENDED','REJECTED','TERMINATED') AND v_to = 'ARCHIVED') OR
    (v_from = 'CHANGES_REQUESTED' AND v_to IN ('UNDER_REVIEW','REJECTED'))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', v_to);
  END IF;

  -- Approve → go-live in same transaction
  IF p_action = 'approve' THEN
    IF v_row.start_at > v_now THEN
      v_go_live := 'SCHEDULED';
    ELSE
      v_go_live := 'ACTIVE';
    END IF;
    v_to := v_go_live;
  END IF;

  v_is_active := (v_to IN ('ACTIVE','SCHEDULED'));

  IF p_product_kind = 'banner' THEN
    UPDATE public.store_banner_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      review_status = COALESCE(v_review, review_status),
      review_notes = CASE
        WHEN p_action IN ('request_changes','reject','pause','terminate')
          THEN nullif(trim(coalesce(p_owner_visible_notes, p_reason)), '')
        WHEN p_action = 'approve' THEN NULL
        ELSE review_notes
      END,
      reviewed_at = CASE WHEN p_action IN ('approve','reject','request_changes','start_review') THEN v_now ELSE reviewed_at END,
      approved_at = CASE WHEN p_action = 'approve' THEN v_now ELSE approved_at END,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      paused_at = CASE WHEN v_to = 'PAUSED_ADMIN' THEN v_now ELSE paused_at END,
      ended_at = CASE WHEN v_to IN ('ENDED','TERMINATED') THEN v_now ELSE ended_at END,
      archived_at = CASE WHEN v_to = 'ARCHIVED' THEN v_now ELSE archived_at END,
      updated_by_user_id = p_admin_user_id,
      updated_at = v_now
    WHERE id = p_campaign_id;

    -- Creative review sync on approve/reject
    IF p_action = 'approve' AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'APPROVED', updated_at = v_now
      WHERE id = v_row.creative_id;
    ELSIF p_action = 'reject' AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'REJECTED', updated_at = v_now
      WHERE id = v_row.creative_id;
    ELSIF p_action = 'request_changes' AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'CHANGES_REQUESTED', updated_at = v_now
      WHERE id = v_row.creative_id;
    END IF;
  ELSE
    UPDATE public.store_paid_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      review_status = COALESCE(v_review, review_status),
      review_notes = CASE
        WHEN p_action IN ('request_changes','reject','pause','terminate')
          THEN nullif(trim(coalesce(p_owner_visible_notes, p_reason)), '')
        WHEN p_action = 'approve' THEN NULL
        ELSE review_notes
      END,
      reviewed_at = CASE WHEN p_action IN ('approve','reject','request_changes','start_review') THEN v_now ELSE reviewed_at END,
      approved_at = CASE WHEN p_action = 'approve' THEN v_now ELSE approved_at END,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      paused_at = CASE WHEN v_to = 'PAUSED_ADMIN' THEN v_now ELSE paused_at END,
      ended_at = CASE WHEN v_to IN ('ENDED','TERMINATED') THEN v_now ELSE ended_at END,
      archived_at = CASE WHEN v_to = 'ARCHIVED' THEN v_now ELSE archived_at END,
      updated_by_user_id = p_admin_user_id,
      updated_at = v_now
    WHERE id = p_campaign_id;
  END IF;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, reason, before_json, after_json
  ) VALUES (
    p_product_kind, p_campaign_id, 'admin', p_admin_user_id, v_audit_action,
    nullif(trim(coalesce(p_reason, '')), ''),
    jsonb_build_object('lifecycle', v_from, 'updated_at', v_row.updated_at),
    jsonb_build_object('lifecycle', v_to, 'action', p_action)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'from', v_from,
    'to', v_to,
    'action', p_action
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delivery_ad_transition(uuid, text, uuid, text, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delivery_ad_transition(uuid, text, uuid, text, text, timestamptz, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivery_ad_transition(uuid, text, uuid, text, text, timestamptz, text, text) TO service_role;

COMMIT;
