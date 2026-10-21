-- Stage 3-E (design G-2 3-E) - owner product P3.
--
-- PRD-11: atomic menu category reorder.
--   New function public.reorder_store_menu_sections(p_store_id uuid, p_section_ids uuid[]) -> jsonb.
--   One UPDATE ... FROM unnest(...) WITH ORDINALITY statement: sort_order = array position (0-based).
--   Any id that is not a section of p_store_id raises section_not_in_store and nothing changes.
--   Called only by the owner route PUT /api/me/stores/[storeId]/menu-sections/order (service_role) after the
--   route has checked session + ownership + 1-B operational gate. Not callable by anon / authenticated (D-0).
--   Base: function did not exist on production (pg_proc count 0, read-only check 2026-10-21) - no prod base md5.
--   Expected new md5(prosrc) is printed by supabase/tests/isolated/stage3-3e/run.sh and recorded below.
--
-- PRD-15: owner product POST idempotency key.
--   store_products.client_request_id text (nullable) + partial UNIQUE index (store_id, client_request_id).
--   Existing rows keep NULL (D-5: no backfill / no correction); only new owner POSTs that send a key use it.
--
-- Deploy order: apply this migration BEFORE the web deploy. If the web lands first, the new reorder route
-- answers 503 migration_pending (category drag order cannot be saved until applied) and product POST falls
-- back to a key-less insert (no idempotency) - nothing breaks permanently.
--
-- Rollback (manual, Owner approval):
--   REVOKE ALL ON FUNCTION public.reorder_store_menu_sections(uuid, uuid[]) FROM service_role;
--   (function can stay unused; the old per-section PATCH path is unchanged)
--   The index / column can stay (nullable, unused by old code).
--
-- EXPECTED_MD5 reorder_store_menu_sections = 8f8b1eb1def69832f36258570f874d1c

ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS store_products_store_client_request_id_key
  ON public.store_products (store_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reorder_store_menu_sections(p_store_id uuid, p_section_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_n integer;
  v_updated integer;
BEGIN
  IF p_store_id IS NULL OR p_section_ids IS NULL THEN
    RAISE EXCEPTION 'invalid_section_ids' USING ERRCODE = '22023';
  END IF;
  v_n := coalesce(cardinality(p_section_ids), 0);
  IF v_n = 0 OR v_n > 1000 THEN
    RAISE EXCEPTION 'invalid_section_ids' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_section_ids) AS x(id) WHERE x.id IS NULL) THEN
    RAISE EXCEPTION 'invalid_section_ids' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT x.id) FROM unnest(p_section_ids) AS x(id)) <> v_n THEN
    RAISE EXCEPTION 'duplicate_section_ids' USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent reorders of the same store (row locks in id order - no deadlock between two calls).
  PERFORM 1 FROM public.store_menu_sections s
   WHERE s.store_id = p_store_id
   ORDER BY s.id
   FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM unnest(p_section_ids) AS x(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.store_menu_sections s WHERE s.id = x.id AND s.store_id = p_store_id
     )
  ) THEN
    RAISE EXCEPTION 'section_not_in_store' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.store_menu_sections s
     SET sort_order = (o.ord - 1)::integer
    FROM unnest(p_section_ids) WITH ORDINALITY AS o(id, ord)
   WHERE s.id = o.id
     AND s.store_id = p_store_id
     AND s.sort_order IS DISTINCT FROM (o.ord - 1)::integer;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated, 'count', v_n);
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_store_menu_sections(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_store_menu_sections(uuid, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_store_menu_sections(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.reorder_store_menu_sections(uuid, uuid[]) IS
  'Stage 3-E PRD-11: owner menu category reorder in one statement; ids outside the store raise section_not_in_store.';
