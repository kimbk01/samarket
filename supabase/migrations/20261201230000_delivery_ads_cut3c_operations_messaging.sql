-- PRODUCT CUT 3-C — Human Owner↔Admin operations messaging
-- Extends delivery_ad_operations_messages; transactional human send + shared case status writer.
-- Scope: storage/write/read/auth only. No lifecycle campaign writes.

BEGIN;

-- ── Extend messages for human (preserve system exactly-once) ───────────────
ALTER TABLE public.delivery_ad_operations_messages
  ALTER COLUMN source_audit_id DROP NOT NULL;

ALTER TABLE public.delivery_ad_operations_messages
  ALTER COLUMN event_type DROP NOT NULL;

ALTER TABLE public.delivery_ad_operations_messages
  ALTER COLUMN message_key DROP NOT NULL;

ALTER TABLE public.delivery_ad_operations_messages
  ADD COLUMN IF NOT EXISTS body text NULL;

ALTER TABLE public.delivery_ad_operations_messages
  ADD COLUMN IF NOT EXISTS sender_user_id uuid NULL;

-- Replace kind/role check with system vs human contracts
ALTER TABLE public.delivery_ad_operations_messages
  DROP CONSTRAINT IF EXISTS delivery_ad_ops_messages_kind_role;

ALTER TABLE public.delivery_ad_operations_messages
  ADD CONSTRAINT delivery_ad_ops_messages_kind_role CHECK (
    (
      kind = 'system_lifecycle'
      AND sender_role = 'system'
      AND source_audit_id IS NOT NULL
      AND event_type IS NOT NULL
      AND message_key IS NOT NULL
      AND body IS NULL
      AND sender_user_id IS NULL
    )
    OR
    (
      kind = 'human'
      AND sender_role IN ('owner', 'admin')
      AND source_audit_id IS NULL
      AND body IS NOT NULL
      AND length(trim(body)) > 0
      AND sender_user_id IS NOT NULL
      AND event_type IS NULL
      AND message_key IS NULL
    )
  );

COMMENT ON TABLE public.delivery_ad_operations_messages IS
  'CUT 3-B/3-C ops timeline. system_lifecycle: UNIQUE(source_audit_id). human: body+sender_user_id, source_audit_id NULL. Append-only.';

-- UNIQUE(source_audit_id) already exists; Postgres allows multiple NULLs → human rows OK.

-- ── Sole Case status DB writer (3-A authority shared with human send) ──────
CREATE OR REPLACE FUNCTION public.delivery_ad_ops_apply_case_status(
  p_case_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.delivery_ad_operations_cases%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_case_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'case_not_found');
  END IF;
  IF p_status NOT IN ('OPEN', 'WAITING_OWNER', 'WAITING_ADMIN', 'RESOLVED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  UPDATE public.delivery_ad_operations_cases SET
    status = p_status,
    updated_at = v_now,
    resolved_at = CASE WHEN p_status = 'RESOLVED' THEN v_now ELSE NULL END
  WHERE id = p_case_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'case_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'case', jsonb_build_object(
      'id', v_row.id,
      'product_kind', v_row.product_kind,
      'store_sponsored_campaign_id', v_row.store_sponsored_campaign_id,
      'banner_campaign_id', v_row.banner_campaign_id,
      'owner_user_id', v_row.owner_user_id,
      'status', v_row.status,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at,
      'resolved_at', v_row.resolved_at
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_ad_ops_apply_case_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_ops_apply_case_status(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_ops_apply_case_status(uuid, text) TO service_role;

-- ── Human message send: insert + case status in ONE DB transaction ─────────
CREATE OR REPLACE FUNCTION public.send_delivery_ad_operations_message(
  p_actor_user_id uuid,
  p_actor_role text,
  p_product_kind text,
  p_campaign_id uuid,
  p_case_id uuid,
  p_thread_id uuid,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.delivery_ad_operations_cases%ROWTYPE;
  v_thread public.delivery_ad_operations_threads%ROWTYPE;
  v_owner uuid;
  v_body text;
  v_status text;
  v_now timestamptz := now();
  v_msg public.delivery_ad_operations_messages%ROWTYPE;
  v_status_res jsonb;
BEGIN
  IF p_actor_user_id IS NULL OR p_case_id IS NULL OR p_thread_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_actor_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  v_body := nullif(trim(coalesce(p_body, '')), '');
  IF v_body IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_body');
  END IF;
  IF char_length(v_body) > 4000 THEN
    v_body := left(v_body, 4000);
  END IF;

  SELECT * INTO v_case FROM public.delivery_ad_operations_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'case_not_found');
  END IF;

  SELECT * INTO v_thread FROM public.delivery_ad_operations_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND OR v_thread.case_id IS DISTINCT FROM p_case_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'thread_mismatch');
  END IF;

  IF v_case.product_kind IS DISTINCT FROM p_product_kind THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_mismatch');
  END IF;

  IF p_product_kind = 'store_sponsored' THEN
    IF v_case.store_sponsored_campaign_id IS DISTINCT FROM p_campaign_id
       OR v_case.banner_campaign_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'campaign_mismatch');
    END IF;
    SELECT owner_user_id INTO v_owner
    FROM public.store_paid_ad_campaigns WHERE id = p_campaign_id;
  ELSE
    IF v_case.banner_campaign_id IS DISTINCT FROM p_campaign_id
       OR v_case.store_sponsored_campaign_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'campaign_mismatch');
    END IF;
    SELECT owner_user_id INTO v_owner
    FROM public.store_banner_ad_campaigns WHERE id = p_campaign_id;
  END IF;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;
  IF v_case.owner_user_id IS DISTINCT FROM v_owner THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_mismatch');
  END IF;

  IF p_actor_role = 'owner' THEN
    IF p_actor_user_id IS DISTINCT FROM v_owner THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    v_status := 'WAITING_ADMIN';
  ELSE
    IF NOT public.is_platform_admin(p_actor_user_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    v_status := 'WAITING_OWNER';
  END IF;

  INSERT INTO public.delivery_ad_operations_messages (
    thread_id, kind, sender_role, sender_user_id, source_audit_id,
    event_type, message_key, body, occurred_at, created_at
  ) VALUES (
    p_thread_id, 'human', p_actor_role, p_actor_user_id, NULL,
    NULL, NULL, v_body, v_now, v_now
  )
  RETURNING * INTO v_msg;

  v_status_res := public.delivery_ad_ops_apply_case_status(p_case_id, v_status);
  IF coalesce((v_status_res->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'case_status_failed:%', coalesce(v_status_res->>'error', 'db_error');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'message', jsonb_build_object(
      'id', v_msg.id,
      'thread_id', v_msg.thread_id,
      'kind', v_msg.kind,
      'sender_role', v_msg.sender_role,
      'sender_user_id', v_msg.sender_user_id,
      'source_audit_id', v_msg.source_audit_id,
      'event_type', v_msg.event_type,
      'message_key', v_msg.message_key,
      'body', v_msg.body,
      'occurred_at', v_msg.occurred_at,
      'created_at', v_msg.created_at
    ),
    'case_id', p_case_id,
    'thread_id', p_thread_id,
    'case_status', v_status
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.send_delivery_ad_operations_message(uuid, text, text, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_delivery_ad_operations_message(uuid, text, text, uuid, uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_delivery_ad_operations_message(uuid, text, text, uuid, uuid, uuid, text) TO service_role;

COMMIT;
