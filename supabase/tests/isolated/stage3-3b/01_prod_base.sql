-- Production base definitions (verbatim pg_get_functiondef, read-only 2026-10-21) + prod trigger definitions.
CREATE OR REPLACE FUNCTION public.block_client_role_direct_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'client_role_direct_write_forbidden:%', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stores_protect_first_listed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stores_block_client_role_writes BEFORE INSERT OR DELETE OR UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION block_client_role_direct_writes();
CREATE TRIGGER trg_stores_first_listed_at BEFORE UPDATE OF is_visible, first_listed_at ON public.stores FOR EACH ROW EXECUTE FUNCTION stores_protect_first_listed_at();
