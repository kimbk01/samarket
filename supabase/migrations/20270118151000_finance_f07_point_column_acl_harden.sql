-- F-07 follow-up: table-level UPDATE still implied column UPDATE(points).
-- Convert authenticated profile UPDATE to column-level grants excluding points.
-- Trigger guard from 20270118150000 remains belt-and-suspenders.

BEGIN;

REVOKE UPDATE ON TABLE public.profiles FROM anon;
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
    INTO cols
  FROM pg_attribute a
  WHERE a.attrelid = 'public.profiles'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname IS DISTINCT FROM 'points';

  IF cols IS NULL OR length(cols) = 0 THEN
    RAISE EXCEPTION 'f07_profiles_column_grant_empty';
  END IF;

  EXECUTE format(
    'GRANT UPDATE (%s) ON TABLE public.profiles TO authenticated',
    cols
  );
END;
$$;

-- service_role keeps full table UPDATE for projection fallback + admin writers
GRANT UPDATE ON TABLE public.profiles TO service_role;
GRANT UPDATE (points) ON TABLE public.profiles TO service_role;

COMMENT ON FUNCTION public.guard_profiles_self_update() IS
  'F-07: blocks profiles.points mutation for non-service_role JWT. Column ACL excludes points from authenticated UPDATE.';

COMMIT;
