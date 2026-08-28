import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const g7 = readFileSync(
  resolve(root, "supabase/migrations/20261127140000_gift_certificate_checkout_refund_atomic.sql"),
  "utf8"
);
const g2 = readFileSync(
  resolve(root, "supabase/migrations/20261127120000_gift_certificate_domain_g2.sql"),
  "utf8"
);

function extractFunc(src, name) {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?\\n\\$\\$;`);
  const m = src.match(re);
  if (!m) throw new Error(`missing ${name}`);
  return m[0];
}

const revenueAvailableBlockOrder = `
      INSERT INTO public.gift_certificate_revenue_ledger (
        store_id, redemption_id, entry_type, amount, related_type, related_id
      ) VALUES (
        p_store_id, v_gift_redemption_id, 'REVENUE_AVAILABLE', v_gift_merchant,
        'redemption', v_gift_redemption_id::text || ':available'
      );`;

const revenueAvailableBlockRedeem = `
    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      p_store_id, v_redemption_id, 'REVENUE_AVAILABLE', v_merchant,
      'redemption', v_redemption_id::text || ':available'
    );`;

let createOrder = extractFunc(g7, "create_store_order_atomic");
createOrder = createOrder.replace(revenueAvailableBlockOrder, "");

let redeem = extractFunc(g2, "gift_certificate_redeem");
redeem = redeem.replace(revenueAvailableBlockRedeem, "");

let reverse = extractFunc(g2, "gift_certificate_redemption_reverse");
const reverseOld = `    v_avail_before := public.gift_certificate_store_revenue_available(v_red.store_id);

    -- Reverse available revenue (and audit create counterpart)
    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      v_red.store_id, v_red.id, 'REVERSED', -v_red.merchant_net_amount,
      'redemption_reverse', v_red.id::text
    );

    -- If revenue was already converted away, claw back cash or open recovery
    IF v_avail_before < v_red.merchant_net_amount THEN`;

const reverseNew = `    -- Reverse recognized revenue only (pending REVENUE_CREATE-only claims need no REVERSED)
    IF EXISTS (
      SELECT 1 FROM public.gift_certificate_revenue_ledger rl
       WHERE rl.redemption_id = v_red.id
         AND rl.entry_type = 'REVENUE_AVAILABLE'
    ) THEN
      v_avail_before := public.gift_certificate_store_revenue_available(v_red.store_id);

      INSERT INTO public.gift_certificate_revenue_ledger (
        store_id, redemption_id, entry_type, amount, related_type, related_id
      ) VALUES (
        v_red.store_id, v_red.id, 'REVERSED', -v_red.merchant_net_amount,
        'redemption_reverse', v_red.id::text
      );

      -- If revenue was already converted away, claw back cash or open recovery
      IF v_avail_before < v_red.merchant_net_amount THEN`;

if (!reverse.includes(reverseOld)) throw new Error("reverse patch anchor missing");
reverse = reverse.replace(reverseOld, reverseNew);
reverse = reverse.replace(
  /      END IF;\n    END IF;\n  END LOOP;/,
  "      END IF;\n    END IF;\n    END IF;\n  END LOOP;"
);

const header = `-- Gift certificate revenue recognition at order completion (not redeem).
-- REVENUE_CREATE at redeem = pending claim; REVENUE_AVAILABLE at order completed.

CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_is_recognized(p_redemption_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.gift_certificate_revenue_ledger rl
     WHERE rl.redemption_id = p_redemption_id
       AND rl.entry_type = 'REVENUE_AVAILABLE'
  );
$$;

COMMENT ON FUNCTION public.gift_certificate_redemption_is_recognized(uuid) IS
  'True when merchant net was recognized (REVENUE_AVAILABLE) for a redemption.';

CREATE OR REPLACE FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_red public.gift_certificate_redemptions%ROWTYPE;
  v_recognized_count integer := 0;
  v_skipped_count integer := 0;
  v_inserted integer;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_order.order_status IS DISTINCT FROM 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_completed');
  END IF;

  FOR v_red IN
    SELECT * FROM public.gift_certificate_redemptions
     WHERE order_id = p_order_id
       AND reversed = false
     ORDER BY created_at
     FOR UPDATE
  LOOP
    IF public.gift_certificate_redemption_is_recognized(v_red.id) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      v_red.store_id, v_red.id, 'REVENUE_AVAILABLE', v_red.merchant_net_amount,
      'redemption', v_red.id::text || ':available'
    )
    ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      v_recognized_count := v_recognized_count + 1;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'recognized_count', v_recognized_count,
    'skipped_count', v_skipped_count
  );
END;
$$;

COMMENT ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid) IS
  'Idempotent: insert REVENUE_AVAILABLE for non-reversed redemptions when order is completed.';

CREATE OR REPLACE FUNCTION public.trg_store_orders_gift_revenue_on_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NEW.order_status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.order_status IS DISTINCT FROM 'completed') THEN
    v_result := public.gift_certificate_recognize_revenue_for_completed_order(NEW.id);
    IF coalesce(v_result->>'ok', 'false') <> 'true' THEN
      RAISE EXCEPTION 'gift_revenue_recognition_failed: %', coalesce(v_result->>'error', 'unknown');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_orders_gift_revenue_recognition ON public.store_orders;
CREATE TRIGGER trg_store_orders_gift_revenue_recognition
  AFTER INSERT OR UPDATE OF order_status ON public.store_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_store_orders_gift_revenue_on_completed();

`;

const footer = `
REVOKE ALL ON FUNCTION public.gift_certificate_redemption_is_recognized(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redemption_is_recognized(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid) TO service_role;

COMMENT ON FUNCTION public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb) IS
  'Atomic order + coupon + gift redeem (G7). Gift revenue recognized at order completion only.';
`;

const outPath = resolve(
  root,
  "supabase/migrations/20261128140000_gift_certificate_order_completion_revenue.sql"
);
writeFileSync(outPath, header + "\n" + createOrder + "\n\n" + redeem + "\n\n" + reverse + "\n" + footer);
console.log("wrote", outPath);
