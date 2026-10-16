-- Rollback for 20270506120000_trade_search_text_trgm.
-- App code tolerates a missing search_text column (search falls back to full-pool ranking),
-- so this can run before or after reverting the code.
--
-- DROP VIEW / ALTER TABLE take an ACCESS EXCLUSIVE lock: run off-peak. lock_timeout makes it
-- fail fast instead of queueing behind (and blocking) live reads. Not dry-run on production
-- (a rolled-back dry run timed out waiting for the lock — no change was left behind).
SET lock_timeout = '5s';

DO $$
DECLARE
  def text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts_masked' AND column_name = 'search_text'
  ) THEN
    -- CREATE OR REPLACE cannot drop a column: rebuild the view without it (live definition),
    -- keeping security_invoker and the read grants.
    def := pg_get_viewdef('public.posts_masked'::regclass, true);
    def := regexp_replace(def, ',\s*p\.search_text', '', 'i');
    def := regexp_replace(def, ',\s*search_text(\s+FROM)', '\1', 'i');
    DROP VIEW public.posts_masked;
    EXECUTE 'CREATE VIEW public.posts_masked WITH (security_invoker = true) AS ' || def;
    COMMENT ON VIEW public.posts_masked IS
      '거래 posts 읽기용: reserved_buyer_id 마스킹. INSERT/UPDATE/DELETE 는 public.posts 사용.';
    GRANT SELECT ON TABLE public.posts_masked TO anon, authenticated, service_role;
  END IF;
END $$;

DROP INDEX IF EXISTS public.posts_search_text_trgm_idx;
DROP INDEX IF EXISTS public.posts_trade_category_created_active_idx;
ALTER TABLE public.posts DROP COLUMN IF EXISTS search_text;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270506120000';
