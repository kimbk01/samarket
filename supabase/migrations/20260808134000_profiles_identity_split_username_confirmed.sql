-- Dibay identity split phase 1:
-- - Introduce username confirmation metadata (1-time confirm policy)
-- - Add username_normalized for search
-- - Add format/reserved checks (only when username is non-empty)
--
-- IMPORTANT: Keep compatibility with existing rows and older schemas.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_confirmed boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_set_at timestamptz;

-- Search helper: lower(username). Keep as STORED generated when supported.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'username_normalized'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ADD COLUMN username_normalized text GENERATED ALWAYS AS (lower(btrim(username))) STORED';
  END IF;
EXCEPTION
  WHEN others THEN
    -- Some Postgres configs may not support generated columns; fallback to plain column.
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'username_normalized'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ADD COLUMN username_normalized text';
    END IF;
END $$;

-- Backfill normalized only when it is a plain column.
-- (Generated columns cannot be updated: "can only be updated to DEFAULT".)
DO $$
DECLARE
  is_generated boolean := false;
BEGIN
  SELECT (c.is_generated = 'ALWAYS')
  INTO is_generated
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'profiles'
    AND c.column_name = 'username_normalized';

  IF is_generated IS DISTINCT FROM true THEN
    UPDATE public.profiles
    SET username_normalized = lower(btrim(username))
    WHERE (username_normalized IS NULL OR btrim(username_normalized) = '')
      AND username IS NOT NULL
      AND btrim(username) <> '';
  END IF;
END $$;

-- Username format & reserved words.
-- Allow NULL/empty for staged migration, but validate when present.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format_check
  CHECK (
    username IS NULL
    OR btrim(username) = ''
    OR (
      username ~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$'
      AND lower(username) NOT IN (
        'admin',
        'administrator',
        'support',
        'owner',
        'system',
        'official',
        'staff',
        'root',
        'mod',
        'help',
        'dibay',
        'samarket'
      )
    )
  );

-- If there is already a usable username, mark it confirmed to avoid forcing onboarding.
UPDATE public.profiles
SET
  username_confirmed = true,
  username_set_at = COALESCE(username_set_at, updated_at, now())
WHERE username_confirmed = false
  AND username IS NOT NULL
  AND btrim(username) <> ''
  AND username ~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$'
  AND lower(username) NOT IN (
    'admin',
    'administrator',
    'support',
    'owner',
    'system',
    'official',
    'staff',
    'root',
    'mod',
    'help',
    'dibay',
    'samarket'
  );

-- Optional (non-unique) index for search. Unique is already enforced by profiles_username_lower_unique_idx.
CREATE INDEX IF NOT EXISTS profiles_username_normalized_idx
  ON public.profiles (username_normalized)
  WHERE username_normalized IS NOT NULL AND btrim(username_normalized) <> '';

COMMIT;

