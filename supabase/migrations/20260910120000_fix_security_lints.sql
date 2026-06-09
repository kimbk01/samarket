-- Supabase Security Advisor WARN 23건 대응 (splinter export 2026-06-09)
--
-- 1) function_search_path_mutable — ALTER FUNCTION only (본문 미변경)
-- 2) anon_security_definer_function_executable — PUBLIC/anon EXECUTE 제거
-- 3) authenticated_security_definer_function_executable — 관리자·서버 전용 RPC authenticated 제거
--    클라이언트 필요: home_sync_direct_keys_* (authenticated 유지 + 참여자 검증)
--    RLS 보조: is_platform_admin / is_admin_user (authenticated 유지 + self 조회 제한)
-- 4) auth_leaked_password_protection — Dashboard 수동 설정 (본 migration 범위 밖)
--
-- 앱 계약: 관리자·포인트·알림 count·주문 수락 차감은 service_role API 경유 (기존과 동일).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) search_path 고정 (ALTER FUNCTION, 존재 시만)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.touch_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure(
    'public.compute_store_point_fee_amount(text, integer, numeric, integer, integer, integer)'
  ) IS NOT NULL THEN
    ALTER FUNCTION public.compute_store_point_fee_amount(
      text, integer, numeric, integer, integer, integer
    ) SET search_path = public, pg_temp;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.evaluate_store_point_commerce_block(uuid, integer, integer)') IS NOT NULL THEN
    ALTER FUNCTION public.evaluate_store_point_commerce_block(uuid, integer, integer)
      SET search_path = public, pg_temp;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.owner_orders_list_buyer_public_label(text, text, text)') IS NOT NULL THEN
    ALTER FUNCTION public.owner_orders_list_buyer_public_label(text, text, text)
      SET search_path = public, pg_temp;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) RPC 내부 auth 검증 보강 (기능 동작 유지, service_role·당사자만)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_admin(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    check_uid IS NOT NULL
    AND (
      (SELECT auth.role()) = 'service_role'
      OR check_uid = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = check_uid
        AND p.role IN ('admin', 'super_admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.count_notification_targets(
  p_user_id uuid,
  p_surface text,
  p_store_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(count(*)::int, 0)
  FROM public.notification_targets AS t
  WHERE t.user_id = p_user_id
    AND t.is_unread = true
    AND (
      (SELECT auth.role()) = 'service_role'
      OR auth.uid() = p_user_id
    )
    AND CASE btrim(coalesce(p_surface, ''))
      WHEN 'tier1_inbox_bell' THEN
        t.scope = 'consumer'
        AND t.target_type IN ('community_post', 'trade', 'buyer_order', 'system')
      WHEN 'bottom_nav_my' THEN
        t.scope = 'consumer'
        AND t.target_type IN ('community_post', 'trade', 'system')
      WHEN 'bottom_nav_chat' THEN
        t.target_type = 'chat_room'
        AND t.scope = 'consumer'
      WHEN 'bottom_nav_community' THEN
        t.target_type IN ('community_post', 'chat_room')
        AND t.scope = 'consumer'
      WHEN 'bottom_nav_delivery' THEN
        t.target_type = 'buyer_order'
        AND t.scope = 'consumer'
      WHEN 'fab_owner_orders' THEN
        t.target_type = 'owner_order'
        AND t.scope = 'owner_store'
        AND (p_store_id IS NULL OR t.store_id IS NULL OR t.store_id = p_store_id)
      WHEN 'fab_owner_store' THEN
        t.target_type IN ('store_review', 'store_inquiry')
        AND t.scope = 'owner_store'
        AND (p_store_id IS NULL OR t.store_id IS NULL OR t.store_id = p_store_id)
      WHEN 'fab_owner_order_chat' THEN
        t.target_type = 'owner_order_chat'
        AND t.scope = 'owner_store'
        AND (p_store_id IS NULL OR t.store_id IS NULL OR t.store_id = p_store_id)
      WHEN 'owner_commerce_inbox' THEN
        t.target_type = 'owner_order'
        AND t.scope = 'owner_store'
        AND (p_store_id IS NULL OR t.store_id IS NULL OR t.store_id = p_store_id)
      WHEN 'all_consumer_targets' THEN
        t.scope = 'consumer'
      WHEN 'all' THEN
        true
      ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION public.count_notification_targets_hub_bundle(
  p_user_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT auth.role()) = 'service_role' OR auth.uid() = p_user_id THEN
      jsonb_build_object(
        'bottom_nav_chat', public.count_notification_targets(p_user_id, 'bottom_nav_chat', p_store_id),
        'bottom_nav_community', public.count_notification_targets(p_user_id, 'bottom_nav_community', p_store_id),
        'bottom_nav_delivery', public.count_notification_targets(p_user_id, 'bottom_nav_delivery', p_store_id),
        'fab_owner_orders', public.count_notification_targets(p_user_id, 'fab_owner_orders', p_store_id),
        'fab_owner_store', public.count_notification_targets(p_user_id, 'fab_owner_store', p_store_id),
        'fab_owner_order_chat', public.count_notification_targets(p_user_id, 'fab_owner_order_chat', p_store_id),
        'owner_commerce_inbox', public.count_notification_targets(p_user_id, 'owner_commerce_inbox', p_store_id)
      )
    ELSE
      jsonb_build_object(
        'bottom_nav_chat', 0,
        'bottom_nav_community', 0,
        'bottom_nav_delivery', 0,
        'fab_owner_orders', 0,
        'fab_owner_store', 0,
        'fab_owner_order_chat', 0,
        'owner_commerce_inbox', 0
      )
  END;
$$;

CREATE OR REPLACE FUNCTION public.home_sync_direct_keys_item_trade_rows(p_room_ids uuid[])
RETURNS TABLE (
  room_id uuid,
  item_id uuid,
  seller_id uuid,
  buyer_id uuid,
  pc_id uuid,
  pc_post_id uuid,
  pc_seller_id uuid,
  pc_buyer_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cr AS (
    SELECT id, item_id, seller_id, buyer_id
    FROM public.chat_rooms
    WHERE room_type = 'item_trade'
      AND id = ANY(coalesce(p_room_ids, '{}'::uuid[]))
      AND (
        (SELECT auth.role()) = 'service_role'
        OR auth.uid() IN (seller_id, buyer_id)
        OR public.is_platform_admin(auth.uid())
      )
  ),
  pc_dedup AS (
    SELECT DISTINCT ON (pc.post_id, pc.seller_id, pc.buyer_id)
      pc.id,
      pc.post_id,
      pc.seller_id,
      pc.buyer_id
    FROM public.product_chats pc
    WHERE pc.post_id IN (SELECT DISTINCT cr.item_id FROM cr)
    ORDER BY pc.post_id ASC, pc.seller_id ASC, pc.buyer_id ASC, pc.id ASC
  )
  SELECT
    cr.id AS room_id,
    cr.item_id,
    cr.seller_id,
    cr.buyer_id,
    p.id AS pc_id,
    p.post_id AS pc_post_id,
    p.seller_id AS pc_seller_id,
    p.buyer_id AS pc_buyer_id
  FROM cr
  LEFT JOIN pc_dedup p
    ON p.post_id = cr.item_id
   AND p.seller_id = cr.seller_id
   AND p.buyer_id = cr.buyer_id;
$$;

CREATE OR REPLACE FUNCTION public.home_sync_direct_keys_critical_bundle(
  p_item_room_ids uuid[],
  p_trade_pc_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  pc_from_key AS (
    SELECT pc.id, pc.post_id, pc.seller_id, pc.buyer_id
    FROM public.product_chats pc
    WHERE pc.id = ANY(coalesce(p_trade_pc_ids, '{}'::uuid[]))
      AND (
        (SELECT auth.role()) = 'service_role'
        OR auth.uid() IN (pc.seller_id, pc.buyer_id)
        OR public.is_platform_admin(auth.uid())
      )
  ),
  item_cr AS (
    SELECT cr.id, cr.item_id, cr.seller_id, cr.buyer_id
    FROM public.chat_rooms cr
    WHERE cr.room_type = 'item_trade'
      AND cr.id = ANY(coalesce(p_item_room_ids, '{}'::uuid[]))
      AND (
        (SELECT auth.role()) = 'service_role'
        OR auth.uid() IN (cr.seller_id, cr.buyer_id)
        OR public.is_platform_admin(auth.uid())
      )
  ),
  pc_dedup AS (
    SELECT DISTINCT ON (pc.post_id, pc.seller_id, pc.buyer_id)
      pc.id,
      pc.post_id,
      pc.seller_id,
      pc.buyer_id
    FROM public.product_chats pc
    WHERE pc.post_id IN (SELECT DISTINCT ic.item_id FROM item_cr ic)
    ORDER BY pc.post_id ASC, pc.seller_id ASC, pc.buyer_id ASC, pc.id ASC
  ),
  item_ledger AS (
    SELECT
      cr.id AS room_id,
      cr.item_id,
      cr.seller_id,
      cr.buyer_id,
      p.id AS pc_id,
      p.post_id AS pc_post_id,
      p.seller_id AS pc_seller_id,
      p.buyer_id AS pc_buyer_id
    FROM item_cr cr
    LEFT JOIN pc_dedup p
      ON p.post_id = cr.item_id
     AND p.seller_id = cr.seller_id
     AND p.buyer_id = cr.buyer_id
  ),
  all_post_ids AS (
    SELECT DISTINCT z.pid AS id
    FROM (
      SELECT post_id AS pid FROM pc_from_key
      UNION
      SELECT item_id AS pid FROM item_cr
    ) z
    WHERE z.pid IS NOT NULL
  ),
  post_rows AS (
    SELECT
      p.id,
      p.title,
      p.price,
      p.images,
      p.thumbnail_url,
      p.status,
      p.seller_listing_state,
      p.trade_category_id,
      p.trade_type,
      p.user_id
    FROM public.posts p
    WHERE p.id IN (SELECT id FROM all_post_ids)
  )
  SELECT jsonb_build_object(
    'itemLedger',
    coalesce(
      (SELECT jsonb_agg(to_jsonb(il)) FROM item_ledger il),
      '[]'::jsonb
    ),
    'tradePcFromKey',
    coalesce(
      (SELECT jsonb_agg(to_jsonb(pcf)) FROM pc_from_key pcf),
      '[]'::jsonb
    ),
    'posts',
    coalesce(
      (SELECT jsonb_agg(to_jsonb(pr)) FROM post_rows pr),
      '[]'::jsonb
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.charge_store_points_on_order_accept(
  p_store_id uuid,
  p_order_id uuid,
  p_gross_amount integer,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_policy record;
  v_now timestamptz := now();
  v_fee integer;
  v_balance integer;
  v_new_balance integer;
  v_existing uuid;
  v_cat_id uuid;
  v_gross integer := GREATEST(0, COALESCE(p_gross_amount, 0));
BEGIN
  IF p_store_id IS NULL OR p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_ids');
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = p_store_id
        AND s.owner_user_id = auth.uid()
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  SELECT id INTO v_existing
    FROM public.store_point_ledger
   WHERE store_id = p_store_id
     AND order_id = p_order_id
     AND entry_type = 'store_order_fee'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    SELECT point_balance INTO v_balance FROM public.stores WHERE id = p_store_id;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'fee_amount', 0,
      'balance_after', COALESCE(v_balance, 0)
    );
  END IF;

  SELECT id, point_balance, store_category_id
    INTO v_store
    FROM public.stores
   WHERE id = p_store_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;
  v_cat_id := v_store.store_category_id;
  v_balance := COALESCE(v_store.point_balance, 0);

  SELECT * INTO v_policy
    FROM public.store_point_policies
   WHERE is_active = true AND is_archived = false
     AND store_id = p_store_id
     AND (starts_at IS NULL OR starts_at <= v_now)
     AND (ends_at IS NULL OR ends_at > v_now)
   ORDER BY priority ASC, starts_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF v_policy IS NULL AND v_cat_id IS NOT NULL THEN
    SELECT * INTO v_policy
      FROM public.store_point_policies
     WHERE is_active = true AND is_archived = false
       AND category_id = v_cat_id AND store_id IS NULL
       AND (starts_at IS NULL OR starts_at <= v_now)
       AND (ends_at IS NULL OR ends_at > v_now)
     ORDER BY priority ASC, starts_at DESC NULLS LAST, created_at DESC
     LIMIT 1;
  END IF;

  IF v_policy IS NULL THEN
    SELECT * INTO v_policy
      FROM public.store_point_policies
     WHERE is_active = true AND is_archived = false
       AND store_id IS NULL AND category_id IS NULL
       AND (starts_at IS NULL OR starts_at <= v_now)
       AND (ends_at IS NULL OR ends_at > v_now)
     ORDER BY priority ASC, starts_at DESC NULLS LAST, created_at DESC
     LIMIT 1;
  END IF;

  IF v_policy IS NULL THEN
    v_fee := 10;
  ELSE
    v_fee := public.compute_store_point_fee_amount(
      v_policy.fee_mode,
      v_policy.fixed_point,
      v_policy.percent_rate,
      v_policy.minimum_point,
      v_policy.maximum_point,
      v_gross
    );
  END IF;

  IF v_balance < v_fee THEN
    PERFORM public.evaluate_store_point_commerce_block(p_store_id, v_balance, v_fee);
    RETURN jsonb_build_object('ok', false, 'error', 'store_points_insufficient', 'required', v_fee, 'balance', v_balance);
  END IF;

  v_new_balance := v_balance - v_fee;
  UPDATE public.stores SET point_balance = v_new_balance WHERE id = p_store_id;

  INSERT INTO public.store_point_ledger (
    store_id, order_id, entry_type, amount, balance_after,
    policy_snapshot, related_type, related_id, description, actor_type, actor_user_id
  ) VALUES (
    p_store_id,
    p_order_id,
    'store_order_fee',
    -v_fee,
    v_new_balance,
    CASE WHEN v_policy IS NULL THEN '{"source":"fallback","fixed_point":10}'::jsonb
         ELSE to_jsonb(v_policy) END,
    'store_order',
    p_order_id::text,
    'Store order acceptance fee',
    CASE WHEN p_actor_user_id IS NULL THEN 'system' ELSE 'user' END,
    p_actor_user_id
  );

  PERFORM public.evaluate_store_point_commerce_block(p_store_id, v_new_balance, v_fee);

  RETURN jsonb_build_object(
    'ok', true,
    'fee_amount', v_fee,
    'balance_after', v_new_balance,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_store_point_charge_request(
  p_request_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_balance integer;
  v_new_balance integer;
  v_next_fee integer := 10;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req
    FROM public.store_point_charge_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.request_status NOT IN ('pending', 'waiting_confirm', 'on_hold') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  SELECT point_balance INTO v_balance
    FROM public.stores
   WHERE id = v_req.store_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  v_new_balance := COALESCE(v_balance, 0) + GREATEST(0, v_req.point_amount);
  UPDATE public.stores SET point_balance = v_new_balance WHERE id = v_req.store_id;

  UPDATE public.store_point_charge_requests
     SET request_status = 'approved',
         approved_by = p_admin_user_id,
         approved_at = now(),
         updated_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.store_point_ledger (
    store_id, order_id, entry_type, amount, balance_after,
    policy_snapshot, related_type, related_id, description, actor_type, actor_user_id
  ) VALUES (
    v_req.store_id,
    NULL,
    'store_charge',
    v_req.point_amount,
    v_new_balance,
    jsonb_build_object('charge_request_id', p_request_id),
    'store_point_charge',
    p_request_id::text,
    'Store point charge approved',
    'admin',
    p_admin_user_id
  );

  SELECT public.compute_store_point_fee_amount(
    COALESCE(p.fee_mode, 'fixed'),
    COALESCE(p.fixed_point, 10),
    COALESCE(p.percent_rate, 0),
    COALESCE(p.minimum_point, 0),
    COALESCE(p.maximum_point, 0),
    0
  ) INTO v_next_fee
  FROM public.store_point_policies p
  WHERE p.is_active = true AND p.is_archived = false
    AND p.store_id IS NULL AND p.category_id IS NULL
  ORDER BY p.priority ASC
  LIMIT 1;

  PERFORM public.evaluate_store_point_commerce_block(v_req.store_id, v_new_balance, COALESCE(v_next_fee, 10));

  RETURN jsonb_build_object(
    'ok', true,
    'store_id', v_req.store_id,
    'point_amount', v_req.point_amount,
    'balance_after', v_new_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_store_point_balance(
  p_store_id uuid,
  p_delta integer,
  p_admin_user_id uuid,
  p_memo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
  v_delta integer;
  v_next_fee integer := 10;
  v_desc text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_store_id');
  END IF;
  v_delta := COALESCE(p_delta, 0);
  IF v_delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'delta_zero');
  END IF;

  SELECT point_balance INTO v_balance
    FROM public.stores
   WHERE id = p_store_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  v_new_balance := GREATEST(0, COALESCE(v_balance, 0) + v_delta);
  UPDATE public.stores SET point_balance = v_new_balance WHERE id = p_store_id;

  v_desc := NULLIF(trim(COALESCE(p_memo, '')), '');
  IF v_desc IS NULL THEN
    v_desc := CASE WHEN v_delta > 0 THEN 'Admin point grant' ELSE 'Admin point deduction' END;
  END IF;

  INSERT INTO public.store_point_ledger (
    store_id, order_id, entry_type, amount, balance_after,
    policy_snapshot, related_type, related_id, description, actor_type, actor_user_id
  ) VALUES (
    p_store_id,
    NULL,
    'admin_adjust',
    v_delta,
    v_new_balance,
    jsonb_build_object('admin_user_id', p_admin_user_id),
    'admin_adjust',
    COALESCE(p_admin_user_id::text, ''),
    left(v_desc, 500),
    'admin',
    p_admin_user_id
  );

  SELECT public.compute_store_point_fee_amount(
    COALESCE(p.fee_mode, 'fixed'),
    COALESCE(p.fixed_point, 10),
    COALESCE(p.percent_rate, 0),
    COALESCE(p.minimum_point, 0),
    COALESCE(p.maximum_point, 0),
    0
  ) INTO v_next_fee
  FROM public.store_point_policies p
  WHERE p.is_active = true AND p.is_archived = false
    AND p.store_id IS NULL AND p.category_id IS NULL
  ORDER BY p.priority ASC
  LIMIT 1;

  PERFORM public.evaluate_store_point_commerce_block(p_store_id, v_new_balance, COALESCE(v_next_fee, 10));

  RETURN jsonb_build_object(
    'ok', true,
    'store_id', p_store_id,
    'delta', v_delta,
    'balance_after', v_new_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_points_admin_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked bigint;
  v_pending_charges bigint;
  v_recent_deduct jsonb;
  v_recent_charge jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_blocked
    FROM public.stores
   WHERE point_commerce_blocked = true;

  SELECT count(*) INTO v_pending_charges
    FROM public.store_point_charge_requests
   WHERE request_status IN ('pending', 'waiting_confirm', 'on_hold');

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_recent_deduct
  FROM (
    SELECT l.store_id, s.store_name, l.amount, l.balance_after, l.created_at, l.order_id
      FROM public.store_point_ledger l
      JOIN public.stores s ON s.id = l.store_id
     WHERE l.entry_type = 'store_order_fee'
     ORDER BY l.created_at DESC
     LIMIT 20
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_recent_charge
  FROM (
    SELECT c.id, c.store_id, s.store_name, c.point_amount, c.request_status, c.requested_at
      FROM public.store_point_charge_requests c
      JOIN public.stores s ON s.id = c.store_id
     ORDER BY c.requested_at DESC
     LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'blocked_store_count', v_blocked,
    'pending_charge_count', v_pending_charges,
    'recent_deductions', v_recent_deduct,
    'recent_charges', v_recent_charge
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) EXECUTE 권한 정리 — PUBLIC·anon 차단, 역할별 최소 grant
-- ---------------------------------------------------------------------------

-- A) 관리자·서버 전용 (service_role only)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('adjust_store_point_balance(uuid, integer, uuid, text)'),
      ('approve_store_point_charge_request(uuid, uuid)'),
      ('get_store_points_admin_summary()'),
      ('charge_store_points_on_order_accept(uuid, uuid, integer, uuid)'),
      ('count_notification_targets(uuid, text, uuid)'),
      ('count_notification_targets_hub_bundle(uuid, uuid)')
    ) AS t(sig)
  LOOP
    IF to_regprocedure('public.' || r.sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', r.sig);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', r.sig);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', r.sig);
    END IF;
  END LOOP;
END $$;

-- B) 클라이언트 authenticated 유지 (home-sync trade directKeys)
REVOKE ALL ON FUNCTION public.home_sync_direct_keys_critical_bundle(uuid[], uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.home_sync_direct_keys_critical_bundle(uuid[], uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.home_sync_direct_keys_critical_bundle(uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.home_sync_direct_keys_critical_bundle(uuid[], uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.home_sync_direct_keys_item_trade_rows(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.home_sync_direct_keys_item_trade_rows(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.home_sync_direct_keys_item_trade_rows(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.home_sync_direct_keys_item_trade_rows(uuid[]) TO service_role;

-- C) RLS 보조 관리자 판별 (authenticated self-check only — 본문 위에서 제한)
DO $$
BEGIN
  IF to_regprocedure('public.is_platform_admin(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM anon;
    GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO service_role;
  END IF;

  IF to_regprocedure('public.is_admin_user()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;
    GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.is_admin_user() TO service_role;
  END IF;
END $$;

COMMIT;
