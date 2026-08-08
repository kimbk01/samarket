-- Production Super Admin authority bootstrap.
-- Credential creation/rotation is intentionally outside this script.
-- The known Auth identity must already exist; authority is only admin_memberships.

DO $$
DECLARE
  uid constant uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = uid) THEN
    RAISE EXCEPTION 'Known Super Admin Auth identity % does not exist', uid;
  END IF;

  UPDATE public.admin_memberships
  SET role = 'super_admin',
      status = 'active',
      admin_tier = NULL,
      bootstrap_seed = true,
      revoked_at = NULL,
      revoked_by = NULL,
      revoke_reason = NULL,
      updated_at = timezone('utc', now())
  WHERE user_id = uid
    AND status = 'active';

  IF NOT FOUND THEN
    INSERT INTO public.admin_memberships (
      user_id, role, status, admin_tier, granted_at, granted_by,
      bootstrap_seed, created_at, updated_at
    )
    VALUES (
      uid, 'super_admin', 'active', NULL, timezone('utc', now()), NULL,
      true, timezone('utc', now()), timezone('utc', now())
    );
  END IF;
END;
$$;
