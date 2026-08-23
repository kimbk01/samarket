-- Close Supabase Security Advisor warnings from recent stores discovery/rating cuts.
-- KEEP (intentional RLS/view helpers — see 20261025170000_supabase_security_lints_phase8):
--   posts_mask_reserved_buyer_id, is_admin_user, is_platform_admin,
--   cm_is_room_admin, cm_is_room_participant
-- Auth dashboard: leaked password protection — enable in Supabase Auth UI (not SQL).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) function_search_path_mutable — pin search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stores_protect_first_listed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.first_listed_at IS NOT NULL THEN
    NEW.first_listed_at := OLD.first_listed_at;
    RETURN NEW;
  END IF;

  IF NEW.is_visible IS TRUE
     AND COALESCE(OLD.is_visible, false) IS DISTINCT FROM TRUE
     AND NEW.first_listed_at IS NULL THEN
    NEW.first_listed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_rating_confidence_is_public_contrib(
  p_rating numeric,
  p_status text,
  p_visible_to_public boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    p_status = 'visible'
    AND COALESCE(p_visible_to_public, false) = true
    AND p_rating IS NOT NULL
    AND p_rating >= 1
    AND p_rating <= 5;
$$;

-- Trigger helpers are not public RPC surface
REVOKE ALL ON FUNCTION public.stores_protect_first_listed_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stores_protect_first_listed_at() TO service_role;

REVOKE ALL ON FUNCTION public.store_rating_confidence_is_public_contrib(numeric, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_rating_confidence_is_public_contrib(numeric, text, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2) anon/authenticated SECURITY DEFINER executable — rating aggregate maintainers
--    Triggers still fire without client EXECUTE. service_role may call refresh.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.refresh_store_public_rating_aggregate(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_store_public_rating_aggregate(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trg_store_reviews_refresh_rating_aggregate()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_store_reviews_refresh_rating_aggregate() TO service_role;

COMMIT;
