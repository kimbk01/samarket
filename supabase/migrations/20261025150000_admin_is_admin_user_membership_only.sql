-- Admin authorization SSOT: active admin_memberships only.
-- This helper is called by Store RLS policies; profiles.role/is_admin are legacy mirrors.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_memberships m
    WHERE m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('admin', 'super_admin')
  );
$$;

