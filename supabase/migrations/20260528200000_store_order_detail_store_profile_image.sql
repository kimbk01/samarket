-- Buyer/owner order detail snapshot: include store profile_image_url for messenger header.

CREATE OR REPLACE FUNCTION public.get_buyer_store_order_detail_snapshot(
  p_user_id uuid,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order jsonb;
  v_store_id uuid;
  v_items jsonb;
  v_store jsonb;
  v_delivery jsonb;
  v_review jsonb;
  v_hidden boolean := false;
BEGIN
  BEGIN
    SELECT EXISTS (
      SELECT 1
      FROM public.store_order_buyer_hides AS h
      WHERE h.buyer_user_id = p_user_id
        AND h.order_id = p_order_id
    )
    INTO v_hidden;
  EXCEPTION
    WHEN undefined_table THEN
      v_hidden := false;
  END;

  IF v_hidden THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT to_jsonb(o.*)
  INTO v_order
  FROM public.store_orders AS o
  WHERE o.id = p_order_id
    AND o.buyer_user_id = p_user_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_store_id := (v_order->>'store_id')::uuid;

  SELECT coalesce(jsonb_agg(to_jsonb(i.*) ORDER BY i.id), '[]'::jsonb)
  INTO v_items
  FROM public.store_order_items AS i
  WHERE i.order_id = p_order_id;

  SELECT jsonb_build_object(
    'store_name', s.store_name,
    'slug', s.slug,
    'owner_user_id', s.owner_user_id,
    'profile_image_url', s.profile_image_url,
    'region', s.region,
    'city', s.city,
    'district', s.district,
    'address_line1', s.address_line1,
    'address_line2', s.address_line2
  )
  INTO v_store
  FROM public.stores AS s
  WHERE s.id = v_store_id;

  SELECT to_jsonb(d.*)
  INTO v_delivery
  FROM public.store_order_deliveries AS d
  WHERE d.order_id = p_order_id;

  SELECT to_jsonb(r.*)
  INTO v_review
  FROM public.store_reviews AS r
  WHERE r.order_id = p_order_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'order', v_order,
    'items', v_items,
    'store', coalesce(v_store, '{}'::jsonb),
    'delivery', v_delivery,
    'review', v_review
  );
EXCEPTION
  WHEN undefined_table THEN
    RETURN jsonb_build_object('ok', false, 'error', 'schema_incomplete');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_store_order_detail_snapshot(
  p_user_id uuid,
  p_store_id uuid,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_order jsonb;
  v_items jsonb;
  v_store jsonb;
  v_delivery jsonb;
  v_review_status text;
  v_status text;
BEGIN
  SELECT s.owner_user_id
  INTO v_owner
  FROM public.stores AS s
  WHERE s.id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  IF v_owner IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT to_jsonb(o.*)
  INTO v_order
  FROM public.store_orders AS o
  WHERE o.id = p_order_id
    AND o.store_id = p_store_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'order_id', i.order_id,
        'product_id', i.product_id,
        'product_title_snapshot', i.product_title_snapshot,
        'price_snapshot', i.price_snapshot,
        'qty', i.qty,
        'subtotal', i.subtotal,
        'options_snapshot_json', i.options_snapshot_json
      )
      ORDER BY i.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.store_order_items AS i
  WHERE i.order_id = p_order_id;

  SELECT jsonb_build_object(
    'store_name', s.store_name,
    'slug', s.slug,
    'profile_image_url', s.profile_image_url,
    'region', s.region,
    'city', s.city,
    'district', s.district,
    'address_line1', s.address_line1,
    'address_line2', s.address_line2
  )
  INTO v_store
  FROM public.stores AS s
  WHERE s.id = p_store_id;

  SELECT to_jsonb(d.*)
  INTO v_delivery
  FROM public.store_order_deliveries AS d
  WHERE d.order_id = p_order_id;

  v_status := coalesce(v_order->>'order_status', '');
  IF v_status <> 'completed' THEN
    v_review_status := 'not_applicable';
  ELSIF EXISTS (SELECT 1 FROM public.store_reviews AS r WHERE r.order_id = p_order_id) THEN
    v_review_status := 'completed';
  ELSE
    v_review_status := 'pending';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'store', coalesce(v_store, '{}'::jsonb),
    'order', v_order,
    'items', v_items,
    'delivery', v_delivery,
    'review_status', v_review_status
  );
EXCEPTION
  WHEN undefined_table THEN
    RETURN jsonb_build_object('ok', false, 'error', 'schema_incomplete');
END;
$$;
