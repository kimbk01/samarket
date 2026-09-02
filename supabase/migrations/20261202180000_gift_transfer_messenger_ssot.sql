-- Gift transfer SSOT: financial transition + messenger projection in ONE transaction.
-- transfer = lifecycle authority; community_messenger_messages = projection of same transfer.
-- API/RPC return nested { transfer, message } only (no flat transfer_id / message_id contract).

CREATE OR REPLACE FUNCTION public.gift_transfer_build_mutation_response(
  p_transfer_id uuid,
  p_idempotent boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tr public.gift_certificate_transfers%ROWTYPE;
  v_msg public.community_messenger_messages%ROWTYPE;
BEGIN
  SELECT * INTO v_tr
    FROM public.gift_certificate_transfers
   WHERE id = p_transfer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_found');
  END IF;

  IF v_tr.messenger_message_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'messenger_message_missing');
  END IF;

  SELECT * INTO v_msg
    FROM public.community_messenger_messages
   WHERE id = v_tr.messenger_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'messenger_message_missing');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', coalesce(p_idempotent, false),
    'transfer', jsonb_build_object(
      'id', v_tr.id,
      'status', v_tr.status,
      'instance_id', v_tr.instance_id,
      'room_id', v_tr.room_id,
      'messenger_message_id', v_tr.messenger_message_id,
      'sender_user_id', v_tr.sender_user_id,
      'recipient_user_id', v_tr.recipient_user_id
    ),
    'message', jsonb_build_object(
      'id', v_msg.id,
      'room_id', v_msg.room_id,
      'sender_id', v_msg.sender_id,
      'message_type', v_msg.message_type,
      'content', v_msg.content,
      'metadata', coalesce(v_msg.metadata, '{}'::jsonb),
      'created_at', v_msg.created_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gift_transfer_project_message_status_in_tx(
  p_transfer_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id uuid;
  v_prev jsonb;
BEGIN
  IF p_status NOT IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'gift_transfer_invalid_projection_status:%', p_status;
  END IF;

  SELECT messenger_message_id INTO v_message_id
    FROM public.gift_certificate_transfers
   WHERE id = p_transfer_id
   FOR UPDATE;
  IF v_message_id IS NULL THEN
    RAISE EXCEPTION 'gift_transfer_messenger_message_missing:%', p_transfer_id;
  END IF;

  SELECT coalesce(metadata, '{}'::jsonb) INTO v_prev
    FROM public.community_messenger_messages
   WHERE id = v_message_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_transfer_messenger_row_missing:%', v_message_id;
  END IF;

  UPDATE public.community_messenger_messages
     SET metadata = v_prev || jsonb_build_object(
       'gift_transfer_id', p_transfer_id,
       'transfer_status', p_status
     )
   WHERE id = v_message_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- OFFER: nested canonical response (atomic transfer+message already established)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_offer(
  p_sender_user_id uuid,
  p_instance_id uuid,
  p_recipient_user_id uuid,
  p_room_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_transferable boolean;
  v_transfer_id uuid;
  v_existing_id uuid;
  v_message_id uuid;
  v_product_title text;
  v_product_image_url text;
  v_store_name text;
  v_metadata jsonb;
  v_created_at timestamptz := now();
  v_preview text := 'Gift certificate';
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_sender_user_id IS NULL OR p_instance_id IS NULL OR p_recipient_user_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_id_required');
  END IF;
  IF p_sender_user_id = p_recipient_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_gift_self');
  END IF;

  SELECT t.id INTO v_existing_id
    FROM public.gift_certificate_transfers t
   WHERE t.idempotency_key = v_key
   LIMIT 1;
  IF FOUND THEN
    RETURN public.gift_transfer_build_mutation_response(v_existing_id, true);
  END IF;

  SELECT * INTO v_inst
    FROM public.gift_certificate_instances
   WHERE id = p_instance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;
  IF public.gift_certificate_instance_is_expired(v_inst.valid_until) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gift_expired');
  END IF;
  IF v_inst.current_owner_user_id IS DISTINCT FROM p_sender_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;
  IF v_inst.status NOT IN ('ACTIVE', 'PARTIALLY_REDEEMED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;
  IF coalesce(v_inst.remaining_balance, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'zero_balance');
  END IF;

  SELECT coalesce(p.transferable, true) INTO v_transferable
    FROM public.gift_certificate_products p
   WHERE p.id = v_inst.product_id;
  IF NOT coalesce(v_transferable, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_transferable');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_social_relations r
     WHERE r.owner_user_id = p_sender_user_id
       AND r.target_user_id = p_recipient_user_id
       AND r.relation_type = 'friend'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_friend');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_social_relations r
     WHERE (
       (r.owner_user_id = p_sender_user_id AND r.target_user_id = p_recipient_user_id)
       OR (r.owner_user_id = p_recipient_user_id AND r.target_user_id = p_sender_user_id)
     )
       AND r.relation_type = 'blocked'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'blocked');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_messenger_rooms r WHERE r.id = p_room_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  INSERT INTO public.gift_certificate_transfers (
    instance_id, sender_user_id, recipient_user_id, room_id, status, idempotency_key
  ) VALUES (
    p_instance_id, p_sender_user_id, p_recipient_user_id, p_room_id, 'PENDING', v_key
  )
  RETURNING id INTO v_transfer_id;

  UPDATE public.gift_certificate_instances
     SET status = 'GIFT_LOCKED',
         version = version + 1
   WHERE id = p_instance_id;

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    p_instance_id,
    v_inst.store_id,
    p_sender_user_id,
    'GIFT_OFFER',
    0,
    'gift_certificate_transfer',
    v_transfer_id::text,
    'Gift offer pending',
    'user'
  );

  SELECT
    coalesce(pr.title, ''),
    pr.image_url,
    coalesce(st.store_name, '')
    INTO v_product_title, v_product_image_url, v_store_name
    FROM public.gift_certificate_products pr
    LEFT JOIN public.stores st ON st.id = pr.store_id
   WHERE pr.id = v_inst.product_id;

  v_metadata := jsonb_build_object(
    'gift_transfer_id', v_transfer_id,
    'instance_id', p_instance_id,
    'store_id', v_inst.store_id,
    'store_name', nullif(btrim(v_store_name), ''),
    'title', nullif(btrim(v_product_title), ''),
    'image_url', v_product_image_url,
    'face_value', v_inst.face_value,
    'remaining_balance', v_inst.remaining_balance,
    'public_gift_number', nullif(btrim(coalesce(v_inst.public_gift_number, '')), ''),
    'transfer_status', 'PENDING'
  );

  INSERT INTO public.community_messenger_messages (
    room_id, sender_id, message_type, content, metadata, created_at
  ) VALUES (
    p_room_id, p_sender_user_id, 'gift_certificate', v_preview, v_metadata, v_created_at
  )
  RETURNING id INTO v_message_id;

  UPDATE public.gift_certificate_transfers
     SET messenger_message_id = v_message_id
   WHERE id = v_transfer_id;

  UPDATE public.community_messenger_rooms
     SET last_message = v_preview,
         last_message_at = v_created_at,
         last_message_type = 'gift_certificate',
         updated_at = v_created_at
   WHERE id = p_room_id;

  PERFORM public.community_messenger_apply_unread_for_text_message(
    p_room_id,
    p_sender_user_id,
    v_created_at
  );

  RETURN public.gift_transfer_build_mutation_response(v_transfer_id, false);
EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id INTO v_existing_id
      FROM public.gift_certificate_transfers t
     WHERE t.idempotency_key = v_key
     LIMIT 1;
    IF FOUND THEN
      RETURN public.gift_transfer_build_mutation_response(v_existing_id, true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'pending_transfer_exists');
END;
$$;

-- ---------------------------------------------------------------------------
-- ACCEPT: ownership + ACCEPTED + SAME message projection (atomic)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_accept(
  p_recipient_user_id uuid,
  p_transfer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tr public.gift_certificate_transfers%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_new_status text;
  v_seq integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_recipient_user_id IS NULL OR p_transfer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Idempotent: already ACCEPTED by this recipient → return canonical projection.
  SELECT * INTO v_tr
    FROM public.gift_certificate_transfers
   WHERE id = p_transfer_id
     AND status = 'ACCEPTED'
     AND recipient_user_id = p_recipient_user_id;
  IF FOUND THEN
    RETURN public.gift_transfer_build_mutation_response(v_tr.id, true);
  END IF;

  SELECT * INTO v_tr
    FROM public.gift_certificate_transfers
   WHERE id = p_transfer_id
     AND status = 'PENDING'
     AND recipient_user_id = p_recipient_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_pending');
  END IF;

  SELECT * INTO v_inst
    FROM public.gift_certificate_instances
   WHERE id = v_tr.instance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;
  IF v_inst.status IS DISTINCT FROM 'GIFT_LOCKED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_locked');
  END IF;
  IF v_inst.current_owner_user_id IS DISTINCT FROM v_tr.sender_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_mismatch');
  END IF;

  IF v_inst.remaining_balance < v_inst.face_value AND v_inst.remaining_balance > 0 THEN
    v_new_status := 'PARTIALLY_REDEEMED';
  ELSIF v_inst.remaining_balance <= 0 THEN
    v_new_status := 'FULLY_REDEEMED';
  ELSE
    v_new_status := 'ACTIVE';
  END IF;

  UPDATE public.gift_certificate_instances
     SET current_owner_user_id = p_recipient_user_id,
         status = v_new_status,
         version = version + 1,
         last_transferred_at = now()
   WHERE id = v_inst.id;

  v_seq := public.gift_certificate_next_ownership_seq(v_inst.id);
  INSERT INTO public.gift_certificate_ownership_events (
    instance_id, seq, event_type, from_user_id, to_user_id, actor_user_id, payload
  ) VALUES (
    v_inst.id, v_seq, 'GIFT_ACCEPTED', v_tr.sender_user_id, p_recipient_user_id, p_recipient_user_id,
    jsonb_build_object('transfer_id', v_tr.id)
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_inst.id, v_inst.store_id, p_recipient_user_id, 'GIFT_ACCEPT', 0,
    'gift_certificate_transfer', v_tr.id::text || ':accept', 'Gift accepted', 'user'
  );

  UPDATE public.gift_certificate_transfers
     SET status = 'ACCEPTED', resolved_at = now()
   WHERE id = v_tr.id AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_accept_race: transfer % no longer PENDING', v_tr.id;
  END IF;

  PERFORM public.gift_transfer_project_message_status_in_tx(v_tr.id, 'ACCEPTED');

  RETURN public.gift_transfer_build_mutation_response(v_tr.id, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- REJECT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_reject(
  p_recipient_user_id uuid,
  p_transfer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tr public.gift_certificate_transfers%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_new_status text;
  v_seq integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_tr
    FROM public.gift_certificate_transfers
   WHERE id = p_transfer_id
     AND status = 'REJECTED'
     AND recipient_user_id = p_recipient_user_id;
  IF FOUND THEN
    RETURN public.gift_transfer_build_mutation_response(v_tr.id, true);
  END IF;

  UPDATE public.gift_certificate_transfers
     SET status = 'REJECTED', resolved_at = now()
   WHERE id = p_transfer_id
     AND status = 'PENDING'
     AND recipient_user_id = p_recipient_user_id
  RETURNING * INTO v_tr;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_pending');
  END IF;

  SELECT * INTO v_inst
    FROM public.gift_certificate_instances
   WHERE id = v_tr.instance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;

  IF v_inst.remaining_balance < v_inst.face_value AND v_inst.remaining_balance > 0 THEN
    v_new_status := 'PARTIALLY_REDEEMED';
  ELSIF v_inst.remaining_balance <= 0 THEN
    v_new_status := 'FULLY_REDEEMED';
  ELSE
    v_new_status := 'ACTIVE';
  END IF;

  IF v_inst.status = 'GIFT_LOCKED' THEN
    UPDATE public.gift_certificate_instances
       SET status = v_new_status, version = version + 1
     WHERE id = v_inst.id;
  END IF;

  v_seq := public.gift_certificate_next_ownership_seq(v_inst.id);
  INSERT INTO public.gift_certificate_ownership_events (
    instance_id, seq, event_type, from_user_id, to_user_id, actor_user_id, payload
  ) VALUES (
    v_inst.id, v_seq, 'GIFT_REJECTED', v_tr.sender_user_id, p_recipient_user_id, p_recipient_user_id,
    jsonb_build_object('transfer_id', v_tr.id)
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_inst.id, v_inst.store_id, p_recipient_user_id, 'GIFT_REJECT', 0,
    'gift_certificate_transfer', v_tr.id::text || ':reject', 'Gift rejected', 'user'
  );

  PERFORM public.gift_transfer_project_message_status_in_tx(v_tr.id, 'REJECTED');

  RETURN public.gift_transfer_build_mutation_response(v_tr.id, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- CANCEL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_cancel(
  p_sender_user_id uuid,
  p_transfer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tr public.gift_certificate_transfers%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_new_status text;
  v_seq integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_tr
    FROM public.gift_certificate_transfers
   WHERE id = p_transfer_id
     AND status = 'CANCELLED'
     AND sender_user_id = p_sender_user_id;
  IF FOUND THEN
    RETURN public.gift_transfer_build_mutation_response(v_tr.id, true);
  END IF;

  UPDATE public.gift_certificate_transfers
     SET status = 'CANCELLED', resolved_at = now()
   WHERE id = p_transfer_id
     AND status = 'PENDING'
     AND sender_user_id = p_sender_user_id
  RETURNING * INTO v_tr;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_pending');
  END IF;

  SELECT * INTO v_inst
    FROM public.gift_certificate_instances
   WHERE id = v_tr.instance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;

  IF v_inst.remaining_balance < v_inst.face_value AND v_inst.remaining_balance > 0 THEN
    v_new_status := 'PARTIALLY_REDEEMED';
  ELSIF v_inst.remaining_balance <= 0 THEN
    v_new_status := 'FULLY_REDEEMED';
  ELSE
    v_new_status := 'ACTIVE';
  END IF;

  IF v_inst.status = 'GIFT_LOCKED' THEN
    UPDATE public.gift_certificate_instances
       SET status = v_new_status, version = version + 1
     WHERE id = v_inst.id;
  END IF;

  v_seq := public.gift_certificate_next_ownership_seq(v_inst.id);
  INSERT INTO public.gift_certificate_ownership_events (
    instance_id, seq, event_type, from_user_id, to_user_id, actor_user_id, payload
  ) VALUES (
    v_inst.id, v_seq, 'GIFT_CANCELLED', p_sender_user_id, v_tr.recipient_user_id, p_sender_user_id,
    jsonb_build_object('transfer_id', v_tr.id)
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_inst.id, v_inst.store_id, p_sender_user_id, 'GIFT_CANCEL', 0,
    'gift_certificate_transfer', v_tr.id::text || ':cancel', 'Gift cancelled', 'user'
  );

  PERFORM public.gift_transfer_project_message_status_in_tx(v_tr.id, 'CANCELLED');

  RETURN public.gift_transfer_build_mutation_response(v_tr.id, false);
END;
$$;

COMMENT ON FUNCTION public.gift_transfer_build_mutation_response(uuid, boolean) IS
  'Canonical gift transfer mutation response: nested transfer + messenger message projection.';
COMMENT ON FUNCTION public.gift_transfer_project_message_status_in_tx(uuid, text) IS
  'In-TX messenger projection update for gift transfer status. Failure rolls back financial transition.';
COMMENT ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text) IS
  'Gift offer SSOT: PENDING transfer + message atomic; nested transfer/message response.';
COMMENT ON FUNCTION public.gift_certificate_accept(uuid, uuid) IS
  'Gift accept SSOT: ownership + ACCEPTED + same-message projection atomic.';
COMMENT ON FUNCTION public.gift_certificate_reject(uuid, uuid) IS
  'Gift reject SSOT: REJECTED + same-message projection atomic.';
COMMENT ON FUNCTION public.gift_certificate_cancel(uuid, uuid) IS
  'Gift cancel SSOT: CANCELLED + same-message projection atomic.';

REVOKE ALL ON FUNCTION public.gift_transfer_build_mutation_response(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_transfer_project_message_status_in_tx(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_transfer_build_mutation_response(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_transfer_project_message_status_in_tx(uuid, text) TO service_role;
