-- PRODUCT CUT 3-B — Operations system lifecycle timeline
-- delivery_ad_operations_messages + Admin RPC return audit_id (return-shape only).
-- No notification / human messaging / Action Queue / Case FK redesign.

BEGIN;

-- ── Messages (system_lifecycle only in 3-B; human kind reserved) ───────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_operations_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL
    REFERENCES public.delivery_ad_operations_threads (id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('system_lifecycle', 'human')),
  sender_role text NOT NULL
    CHECK (sender_role IN ('system', 'owner', 'admin')),
  source_audit_id uuid NOT NULL
    REFERENCES public.delivery_ad_audit_logs (id),
  event_type text NOT NULL,
  message_key text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_ops_messages_source_audit_unique UNIQUE (source_audit_id),
  CONSTRAINT delivery_ad_ops_messages_kind_role CHECK (
    (kind = 'system_lifecycle' AND sender_role = 'system')
    OR (kind = 'human' AND sender_role IN ('owner', 'admin'))
  )
);

CREATE INDEX IF NOT EXISTS delivery_ad_ops_messages_thread_occurred_idx
  ON public.delivery_ad_operations_messages (thread_id, occurred_at ASC, created_at ASC);

COMMENT ON TABLE public.delivery_ad_operations_messages IS
  'CUT 3-B ops timeline. system_lifecycle only in 3-B; UNIQUE(source_audit_id)=one event per audit. Human messaging deferred to 3-C.';

ALTER TABLE public.delivery_ad_operations_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_ad_operations_messages FROM PUBLIC;
REVOKE ALL ON TABLE public.delivery_ad_operations_messages FROM anon, authenticated;
GRANT SELECT ON TABLE public.delivery_ad_operations_messages TO authenticated;
GRANT ALL ON TABLE public.delivery_ad_operations_messages TO service_role;

-- Owner: SELECT own campaign Case thread messages
DROP POLICY IF EXISTS delivery_ad_ops_messages_owner_select ON public.delivery_ad_operations_messages;
CREATE POLICY delivery_ad_ops_messages_owner_select
  ON public.delivery_ad_operations_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_ad_operations_threads t
      JOIN public.delivery_ad_operations_cases c ON c.id = t.case_id
      WHERE t.id = thread_id
        AND c.owner_user_id = auth.uid()
    )
  );

-- Admin: SELECT all
DROP POLICY IF EXISTS delivery_ad_ops_messages_admin_select ON public.delivery_ad_operations_messages;
CREATE POLICY delivery_ad_ops_messages_admin_select
  ON public.delivery_ad_operations_messages
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- No authenticated INSERT/UPDATE/DELETE policies → client system/human write DENY

-- ── Admin RPC: return existing audit row id (lifecycle semantics UNCHANGED) ─
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
  v_audit_id uuid;
BEGIN
  IF p_admin_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

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

  IF p_expected_lifecycle IS NOT NULL AND v_from IS DISTINCT FROM p_expected_lifecycle THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_lifecycle', 'current', v_from);
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  END IF;

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
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'from', v_from,
    'to', v_to,
    'action', p_action,
    'audit_id', v_audit_id
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
