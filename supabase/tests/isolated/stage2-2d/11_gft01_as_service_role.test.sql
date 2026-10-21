-- GFT-01 checks executed AS the service_role database role (what the app's service client uses).
-- Direct reverse is refused by GRANT; the two SECURITY DEFINER wrappers (owner postgres) still work.

SET ROLE service_role;
SET test.jwt_role = 'service_role';

DO $$
DECLARE r jsonb; v_denied boolean := false;
BEGIN
  BEGIN
    r := public.gift_certificate_redemption_reverse((SELECT id FROM public.t_ids WHERE k = 'direct_cancelled'));
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  PERFORM public.t_assert(v_denied, 'service_role direct reverse -> permission denied');
  PERFORM public.t_assert((SELECT NOT reversed FROM public.gift_certificate_redemptions
    WHERE order_id = (SELECT id FROM public.t_ids WHERE k = 'direct_cancelled')), 'direct call left redemption untouched');

  r := public.gift_certificate_cancel_order_restore((SELECT id FROM public.t_ids WHERE k = 'wrap_cancelled'));
  PERFORM public.t_assert(r->>'ok' = 'true' AND (r->'gift_reverse'->>'reversed_count')::int = 1,
    'cancel wrapper on cancelled order -> ok reversed (' || r::text || ')');

  r := public.gift_certificate_cancel_order_restore((SELECT id FROM public.t_ids WHERE k = 'wrap_cancelled'));
  PERFORM public.t_assert(r->>'ok' = 'true' AND r->>'idempotent' = 'true', 'cancel wrapper repeat -> idempotent');

  r := public.gift_certificate_refund_order_atomic((SELECT id FROM public.t_ids WHERE k = 'wrap_refund'), NULL);
  PERFORM public.t_assert(r->>'ok' = 'true' AND (r->'gift_reverse'->>'reversed_count')::int = 1,
    'refund wrapper (reverse before refunded UPDATE) -> ok (' || r::text || ')');
  PERFORM public.t_assert((SELECT order_status = 'refunded' FROM public.store_orders
    WHERE id = (SELECT id FROM public.t_ids WHERE k = 'wrap_refund')), 'refund wrapper: order refunded');

  r := public.gift_certificate_refund_order_atomic((SELECT id FROM public.t_ids WHERE k = 'wrap_refund'), NULL);
  PERFORM public.t_assert(r->>'ok' = 'true' AND r->>'idempotent' = 'true'
    AND (r->'gift_reverse'->>'reversed_count')::int = 0, 'refund wrapper repeat -> idempotent, nothing reversed again');

  r := public.gift_certificate_cancel_order_restore((SELECT id FROM public.t_ids WHERE k = 'wrap_pending'));
  PERFORM public.t_assert(r->>'error' = 'order_not_cancelled', 'cancel wrapper on pending -> order_not_cancelled');
  PERFORM public.t_assert((SELECT NOT reversed FROM public.gift_certificate_redemptions
    WHERE order_id = (SELECT id FROM public.t_ids WHERE k = 'wrap_pending')), 'pending order redemption untouched');
END $$;

RESET ROLE;
