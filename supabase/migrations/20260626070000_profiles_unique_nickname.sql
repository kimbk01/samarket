-- Profiles nickname uniqueness for member operations.
-- No member rows are deleted. Existing duplicates are made unique by appending a short id suffix.

BEGIN;

UPDATE public.profiles
SET nickname = COALESCE(
  NULLIF(btrim(nickname), ''),
  NULLIF(btrim(display_name), ''),
  NULLIF(btrim(username), ''),
  CASE WHEN email IS NOT NULL AND position('@' IN email) > 1 THEN split_part(email, '@', 1) ELSE NULL END,
  left(id::text, 8)
)
WHERE nickname IS NULL OR btrim(nickname) = '';

WITH ranked AS (
  SELECT
    id,
    nickname,
    row_number() OVER (
      PARTITION BY lower(btrim(nickname))
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM public.profiles
  WHERE nickname IS NOT NULL
    AND btrim(nickname) <> ''
)
UPDATE public.profiles p
SET nickname = left(btrim(p.nickname), 12) || '-' || left(replace(p.id::text, '-', ''), 6)
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(btrim(nickname))
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM public.profiles
  WHERE nickname IS NOT NULL
    AND btrim(nickname) <> ''
)
UPDATE public.profiles p
SET nickname = 'member-' || left(replace(p.id::text, '-', ''), 12)
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

UPDATE public.profiles
SET display_name = nickname
WHERE nickname IS NOT NULL
  AND btrim(nickname) <> ''
  AND (display_name IS NULL OR btrim(display_name) = '' OR display_name IS DISTINCT FROM nickname);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_nickname_lower_unique_idx
  ON public.profiles (lower(btrim(nickname)))
  WHERE nickname IS NOT NULL AND btrim(nickname) <> '';

COMMIT;
