-- Clear auto-generated dibay_* nicknames for incomplete signup users.
-- Next OAuth login will refill nickname/display_name from provider metadata.

BEGIN;

UPDATE public.profiles
SET
  nickname = NULL,
  display_name = NULL,
  updated_at = now()
WHERE onboarding_completed_at IS NULL
  AND (
    lower(btrim(coalesce(nickname, ''))) ~ '^dibay_[a-f0-9]{6}$'
    OR lower(btrim(coalesce(display_name, ''))) ~ '^dibay_[a-f0-9]{6}$'
  );

COMMIT;
