-- Gift offer: transfer + canonical messenger message in one DB transaction.
-- Financial SUCCESS without chat message is forbidden when p_room_id is set.

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

  SELECT t.id, t.messenger_message_id
    INTO v_existing_id, v_message_id
    FROM public.gift_certificate_transfers t
   WHERE t.idempotency_key = v_key
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'transfer_id', v_existing_id,
      'message_id', v_message_id,
      'room_id', p_room_id
    );
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
    room_id,
    sender_id,
    message_type,
    content,
    metadata,
    created_at
  ) VALUES (
    p_room_id,
    p_sender_user_id,
    'gift_certificate',
    v_preview,
    v_metadata,
    v_created_at
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

  RETURN jsonb_build_object(
    'ok', true,
    'transfer_id', v_transfer_id,
    'message_id', v_message_id,
    'room_id', p_room_id,
    'recipient_user_id', p_recipient_user_id,
    'created_at', v_created_at,
    'metadata', v_metadata,
    'content', v_preview
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id, t.messenger_message_id
      INTO v_existing_id, v_message_id
      FROM public.gift_certificate_transfers t
     WHERE t.idempotency_key = v_key
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'transfer_id', v_existing_id,
        'message_id', v_message_id,
        'room_id', p_room_id
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'pending_transfer_exists');
END;
$$;

COMMENT ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text) IS
  'Gift offer: PENDING transfer + canonical gift_certificate messenger message (atomic when room_id set).';
