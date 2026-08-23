-- P1-C1 — First customer-listed authority (additive only).
-- Meaning: first successful customer discovery publication (is_visible false → true).
-- FINAL STAMP AUTHORITY: this trigger (DB now()). App writers send is_visible only.
-- NO backfill from created_at / approved_at / updated_at (unsafe without visibility history).

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS first_listed_at timestamptz NULL;

COMMENT ON COLUMN public.stores.first_listed_at IS
  'P1-C1 SSOT: first successful customer-list publication (is_visible false→true). Immutable once set. Not created_at/approved_at.';

CREATE OR REPLACE FUNCTION public.stores_protect_first_listed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Immutable once stamped (hide / republish / accidental overwrite)
  IF OLD.first_listed_at IS NOT NULL THEN
    NEW.first_listed_at := OLD.first_listed_at;
    RETURN NEW;
  END IF;

  -- First customer listing only
  IF NEW.is_visible IS TRUE
     AND COALESCE(OLD.is_visible, false) IS DISTINCT FROM TRUE
     AND NEW.first_listed_at IS NULL THEN
    NEW.first_listed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stores_first_listed_at ON public.stores;
CREATE TRIGGER trg_stores_first_listed_at
  BEFORE UPDATE OF is_visible, first_listed_at ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.stores_protect_first_listed_at();
