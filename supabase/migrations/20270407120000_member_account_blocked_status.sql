-- P0 Member Management: BLOCKED is independent of WITHDRAWN/DELETED.
-- Owner policy: ban must NOT write status=deleted + deleted_at.
-- Allowed profiles.status: sns_pending | verified_user | suspended | blocked | deleted

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('sns_pending', 'verified_user', 'suspended', 'blocked', 'deleted'));

COMMENT ON CONSTRAINT profiles_status_check ON public.profiles IS
  'P0 account lifecycle: blocked (login deny, PII kept) ≠ deleted (withdrawn/anonymized)';
