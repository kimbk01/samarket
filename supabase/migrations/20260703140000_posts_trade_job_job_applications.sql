-- 거래 일자리: posts 확장 컬럼 + job_applications + application_count 트리거 + posts_masked 재생성

-- ── posts 컬럼 ─────────────────────────────────────────────────────────────
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS trade_type text NOT NULL DEFAULT 'product';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS job_employment_type text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS job_category text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS pay_type text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS pay_amount numeric;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS work_start_date date;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS work_end_date date;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS work_days text[];
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS work_start_time text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS work_end_time text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS headcount integer;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS experience_required text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS application_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_trade_type_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_trade_type_check CHECK (trade_type IN ('product', 'job'));

CREATE INDEX IF NOT EXISTS posts_trade_type_status_created_idx
  ON public.posts (trade_type, status, created_at DESC)
  WHERE status IS DISTINCT FROM 'hidden';

CREATE INDEX IF NOT EXISTS posts_trade_job_pay_sort_idx
  ON public.posts (trade_type, pay_amount DESC NULLS LAST, created_at DESC)
  WHERE trade_type = 'job' AND status IS DISTINCT FROM 'hidden';

-- ── meta 기반 백필 (일자리 판별) ───────────────────────────────────────────
UPDATE public.posts p
SET
  trade_type = 'job',
  job_employment_type = NULLIF(trim(COALESCE(p.meta->>'work_term', '')), ''),
  job_category = NULLIF(trim(COALESCE(p.meta->>'work_category', '')), ''),
  pay_type = NULLIF(trim(COALESCE(p.meta->>'pay_type', '')), ''),
  pay_amount = CASE
    WHEN (p.meta->>'pay_amount') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (p.meta->>'pay_amount')::numeric
    ELSE NULL
  END,
  work_start_date = CASE
    WHEN (p.meta->>'work_date_start') ~ '^\d{4}-\d{2}-\d{2}$'
    THEN (p.meta->>'work_date_start')::date
    ELSE NULL
  END,
  work_end_date = CASE
    WHEN (p.meta->>'work_date_end') ~ '^\d{4}-\d{2}-\d{2}$'
    THEN (p.meta->>'work_date_end')::date
    ELSE NULL
  END,
  work_start_time = NULLIF(trim(COALESCE(p.meta->>'work_time_start', '')), ''),
  work_end_time = NULLIF(trim(COALESCE(p.meta->>'work_time_end', '')), ''),
  experience_required = NULLIF(trim(COALESCE(p.meta->>'experience_level', '')), ''),
  headcount = CASE
    WHEN (p.meta->>'headcount') ~ '^[0-9]+$' THEN (p.meta->>'headcount')::integer
    ELSE NULL
  END
WHERE p.type = 'trade'
  AND p.meta IS NOT NULL
  AND jsonb_typeof(p.meta) = 'object'
  AND (
    COALESCE(trim(p.meta->>'trade_chat_kind'), '') = 'job'
    OR (p.meta ? 'listing_kind')
    OR (p.meta ? 'work_category')
    OR (p.meta ? 'work_term')
  );

-- ── job_applications ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'withdrawn', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS job_applications_post_id_idx ON public.job_applications (post_id);
CREATE INDEX IF NOT EXISTS job_applications_applicant_id_idx ON public.job_applications (applicant_id);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_applications_select_own_or_owner ON public.job_applications;
DROP POLICY IF EXISTS job_applications_insert_applicant ON public.job_applications;

CREATE POLICY job_applications_select_own_or_owner ON public.job_applications
  FOR SELECT TO authenticated
  USING (
    applicant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.posts po
      WHERE po.id = job_applications.post_id AND po.user_id = auth.uid()
    )
  );

CREATE POLICY job_applications_insert_applicant ON public.job_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    applicant_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.posts po
      WHERE po.id = job_applications.post_id
        AND po.trade_type = 'job'
        AND po.user_id IS DISTINCT FROM auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.bump_post_job_application_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET application_count = application_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET application_count = GREATEST(0, application_count - 1)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS job_applications_count_ins ON public.job_applications;
CREATE TRIGGER job_applications_count_ins
  AFTER INSERT ON public.job_applications
  FOR EACH ROW EXECUTE PROCEDURE public.bump_post_job_application_count();

DROP TRIGGER IF EXISTS job_applications_count_del ON public.job_applications;
CREATE TRIGGER job_applications_count_del
  AFTER DELETE ON public.job_applications
  FOR EACH ROW EXECUTE PROCEDURE public.bump_post_job_application_count();

GRANT SELECT, INSERT, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;

-- ── posts_masked 재생성 (신규 컬럼 포함) ─────────────────────────────────
DO $$
DECLARE
  parts text[] := ARRAY[]::text[];
  r record;
  tbl regclass := to_regclass('public.posts');
BEGIN
  IF tbl IS NULL THEN
    RAISE NOTICE 'posts_trade_job: public.posts 없음 — posts_masked 스킵';
    RETURN;
  END IF;

  FOR r IN
    SELECT column_name, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts'
    ORDER BY ordinal_position
  LOOP
    IF r.column_name = 'reserved_buyer_id' THEN
      parts := array_append(
        parts,
        'CASE '
          || 'WHEN (SELECT auth.role()) = ''service_role'' THEN p.reserved_buyer_id '
          || 'WHEN auth.uid() IS NOT NULL AND (auth.uid() = p.user_id OR auth.uid() = p.reserved_buyer_id) THEN p.reserved_buyer_id '
          || 'ELSE NULL END AS reserved_buyer_id'
      );
    ELSE
      parts := array_append(parts, format('p.%I', r.column_name));
    END IF;
  END LOOP;

  IF array_length(parts, 1) IS NULL OR array_length(parts, 1) < 1 THEN
    RAISE NOTICE 'posts_trade_job: 컬럼 없음 — posts_masked 스킵';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.posts_masked AS SELECT %s FROM public.posts p',
    array_to_string(parts, ', ')
  );

  COMMENT ON VIEW public.posts_masked IS
    '거래 posts 읽기용: reserved_buyer_id 마스킹. INSERT/UPDATE/DELETE 는 public.posts 사용.';
END $$;

GRANT SELECT ON TABLE public.posts_masked TO anon, authenticated, service_role;
