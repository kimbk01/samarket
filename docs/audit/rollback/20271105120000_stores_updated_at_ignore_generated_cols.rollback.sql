-- 롤백: 20271105120000 이전 정의(20271104100000_owner_sales_completed_at_pht.sql)로 되돌린다.
CREATE OR REPLACE FUNCTION public.stores_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_system_cols text[] := ARRAY[
    'updated_at',
    'delivery_policy_version',
    'discovery_schedule_state',
    'next_schedule_transition_at',
    'completed_orders_30d',
    'completed_orders_30d_at',
    'point_balance',
    'point_commerce_blocked',
    'point_block_reason',
    'point_warning_at',
    'rating_avg',
    'review_count'
  ];
BEGIN
  IF (to_jsonb(NEW) - v_system_cols) = (to_jsonb(OLD) - v_system_cols) THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
