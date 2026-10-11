-- DIBAY — Full data reset system (LOCKED by default)
--
-- Server-side state, plan, approval and execution for the admin "full data reset".
-- Everything destructive lives in SECURITY DEFINER functions that only service_role may call,
-- and every one of them refuses to run unless:
--   * public.data_reset_db_guard has allow_destructive = true (no row is ever inserted by
--     this migration — a QA project must opt in manually; Production never does), and
--   * a reset window is OPEN (requested by one Super Admin, approved by a different one), and
--   * the plan was confirmed and then approved by two different Super Admins.
-- Rows are deleted only when their owning accounts are all classified TESTER; unclassified,
-- real-member, admin and system rows are kept. Parents referenced by kept rows (FK or known
-- non-FK references) are kept. Deletion runs in bounded batches with row locks, records every
-- row it deletes or skips, and is resumable.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. DB-level guard (fail-closed: no row → destructive functions refuse)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_reset_db_guard (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  allow_destructive boolean NOT NULL DEFAULT false,
  environment_label text NOT NULL,
  note text,
  set_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.data_reset_db_guard IS
  'Single-row opt-in for destructive data-reset functions. Never insert this row in Production.';

-- ---------------------------------------------------------------------------
-- 1. State tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_reset_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('requested', 'open', 'closed', 'rejected', 'expired')),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 5),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  open_until timestamptz,
  closed_at timestamptz,
  close_reason text,
  database_target text NOT NULL,
  CONSTRAINT data_reset_windows_two_people CHECK (approved_by IS NULL OR approved_by <> requested_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS data_reset_windows_single_active
  ON public.data_reset_windows ((true)) WHERE status IN ('requested', 'open');

CREATE TABLE IF NOT EXISTS public.data_reset_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_id uuid NOT NULL REFERENCES public.data_reset_windows (id),
  status text NOT NULL CHECK (status IN (
    'building', 'ready', 'confirmed', 'approved', 'running',
    'completed', 'partial', 'failed', 'aborted', 'expired', 'superseded')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  manifest_version text NOT NULL,
  manifest jsonb NOT NULL,
  summary jsonb,
  plan_hash text,
  backup_reference text,
  backup_attested_by uuid,
  backup_attested_at timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  expires_at timestamptz NOT NULL,
  CONSTRAINT data_reset_plans_two_people CHECK (approved_by IS NULL OR approved_by <> confirmed_by)
);
CREATE INDEX IF NOT EXISTS data_reset_plans_window_idx ON public.data_reset_plans (window_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.data_reset_plan_tables (
  plan_id uuid NOT NULL REFERENCES public.data_reset_plans (id) ON DELETE CASCADE,
  table_name text NOT NULL,
  class text NOT NULL,
  key_expr text NOT NULL,
  owner_columns text[] NOT NULL DEFAULT '{}',
  step_order integer,
  total_rows bigint NOT NULL DEFAULT 0,
  target_rows bigint NOT NULL DEFAULT 0,
  kept_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  skip_reason text,
  PRIMARY KEY (plan_id, table_name)
);

CREATE TABLE IF NOT EXISTS public.data_reset_plan_targets (
  plan_id uuid NOT NULL REFERENCES public.data_reset_plans (id) ON DELETE CASCADE,
  table_name text NOT NULL,
  row_key text NOT NULL,
  status text NOT NULL DEFAULT 'target' CHECK (status IN ('target', 'excluded', 'deleted')),
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, table_name, row_key)
);
CREATE INDEX IF NOT EXISTS data_reset_plan_targets_status_idx
  ON public.data_reset_plan_targets (plan_id, table_name, status);

CREATE TABLE IF NOT EXISTS public.data_reset_plan_auth (
  plan_id uuid NOT NULL REFERENCES public.data_reset_plans (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'target' CHECK (status IN ('target', 'excluded', 'deleted', 'failed')),
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.data_reset_plan_storage (
  plan_id uuid NOT NULL REFERENCES public.data_reset_plans (id) ON DELETE CASCADE,
  bucket_id text NOT NULL,
  object_name text NOT NULL,
  status text NOT NULL DEFAULT 'target' CHECK (status IN ('target', 'excluded', 'deleted', 'failed')),
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, bucket_id, object_name)
);

CREATE TABLE IF NOT EXISTS public.data_reset_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL UNIQUE REFERENCES public.data_reset_plans (id),
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed', 'aborted')),
  phase text NOT NULL DEFAULT 'db' CHECK (phase IN ('db', 'storage', 'auth', 'verify', 'done')),
  abort_requested boolean NOT NULL DEFAULT false,
  storage_rechecked_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.data_reset_run_steps (
  run_id uuid NOT NULL REFERENCES public.data_reset_runs (id) ON DELETE CASCADE,
  table_name text NOT NULL,
  step_order integer NOT NULL,
  planned bigint NOT NULL,
  deleted bigint NOT NULL DEFAULT 0,
  skipped bigint NOT NULL DEFAULT 0,
  before_count bigint,
  after_count bigint,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'partial', 'failed')),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, table_name)
);

CREATE TABLE IF NOT EXISTS public.data_reset_action_claims (
  nonce text PRIMARY KEY,
  action text NOT NULL,
  plan_id uuid,
  window_id uuid,
  actor_user_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.data_reset_account_overrides (
  user_id uuid PRIMARY KEY,
  decision text NOT NULL CHECK (decision IN ('TESTER', 'REAL_MEMBER', 'OPERATIONS')),
  note text,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.data_reset_release_flags (
  table_name text PRIMARY KEY,
  reason text NOT NULL,
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.data_reset_release_flags IS
  'LEGAL_HOLD tables whose TESTER-only rows may be deleted (Owner evidence reconciliation done).';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'data_reset_db_guard', 'data_reset_windows', 'data_reset_plans', 'data_reset_plan_tables',
    'data_reset_plan_targets', 'data_reset_plan_auth', 'data_reset_plan_storage', 'data_reset_runs',
    'data_reset_run_steps', 'data_reset_action_claims', 'data_reset_account_overrides',
    'data_reset_release_flags']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- Writes on state tables go through the functions below, except these narrow inserts.
GRANT INSERT ON TABLE public.data_reset_action_claims TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.data_reset_account_overrides TO service_role;
GRANT INSERT, DELETE ON TABLE public.data_reset_release_flags TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.data_reset_assert_destructive_allowed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE ok boolean;
BEGIN
  SELECT allow_destructive INTO ok FROM public.data_reset_db_guard WHERE id;
  IF ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'data_reset_db_guard_locked' USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Expire overdue windows (and everything hanging off them). Returns the active window or NULL.
CREATE OR REPLACE FUNCTION public.data_reset_window_current()
RETURNS public.data_reset_windows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE w public.data_reset_windows;
BEGIN
  UPDATE public.data_reset_windows
     SET status = 'expired', closed_at = now(), close_reason = coalesce(close_reason, 'window_expired')
   WHERE status = 'open' AND open_until IS NOT NULL AND open_until <= now();
  UPDATE public.data_reset_windows
     SET status = 'expired', closed_at = now(), close_reason = coalesce(close_reason, 'request_expired')
   WHERE status = 'requested' AND requested_at <= now() - interval '24 hours';
  UPDATE public.data_reset_plans p
     SET status = 'expired'
   WHERE p.status IN ('building', 'ready', 'confirmed', 'approved')
     AND (p.expires_at <= now()
          OR NOT EXISTS (SELECT 1 FROM public.data_reset_windows w2 WHERE w2.id = p.window_id AND w2.status = 'open'));
  UPDATE public.data_reset_runs r
     SET abort_requested = true, updated_at = now()
   WHERE r.status = 'running'
     AND NOT EXISTS (
       SELECT 1 FROM public.data_reset_plans p JOIN public.data_reset_windows w2 ON w2.id = p.window_id
        WHERE p.id = r.plan_id AND w2.status = 'open');
  SELECT * INTO w FROM public.data_reset_windows WHERE status IN ('requested', 'open') LIMIT 1;
  RETURN w;
END $$;

-- Primary-key based row identity. Tables without a primary key are never row-targeted
-- (ctid is not stable across updates, so such tables are kept and reported).
CREATE OR REPLACE FUNCTION public.data_reset_pk(p_table regclass)
RETURNS TABLE (col text, typ text, ord bigint)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT a.attname::text, format_type(a.atttypid, NULL), k.ord
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
   WHERE c.conrelid = p_table AND c.contype = 'p'
   ORDER BY k.ord;
$$;

-- Text row key of alias p_alias (NULL alias → unqualified, for display). NULL when no PK.
CREATE OR REPLACE FUNCTION public.data_reset_key_sql(p_table regclass, p_alias text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN count(*) = 0 THEN NULL
           WHEN count(*) = 1 THEN format('(%s%I)::text', coalesce(quote_ident(p_alias) || '.', ''), min(col))
           ELSE format('jsonb_build_array(%s)::text',
                       string_agg(coalesce(quote_ident(p_alias) || '.', '') || quote_ident(col), ', ' ORDER BY ord))
         END
    FROM public.data_reset_pk(p_table);
$$;

-- Predicate "row of alias p_alias has a key in text[] expression p_array" (index-friendly for single-column PKs).
CREATE OR REPLACE FUNCTION public.data_reset_key_any(p_table regclass, p_alias text, p_array text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN count(*) = 0 THEN 'false'
           WHEN count(*) = 1 THEN format('%I.%I = ANY((%s)::%s[])', p_alias, min(col), p_array, min(typ))
           ELSE format('%s = ANY(%s)', public.data_reset_key_sql(p_table, p_alias), p_array)
         END
    FROM public.data_reset_pk(p_table);
$$;

-- Predicate "row of alias p_alias has key equal to text expression p_text" (index-friendly for single-column PKs).
CREATE OR REPLACE FUNCTION public.data_reset_key_eq(p_table regclass, p_alias text, p_text text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN count(*) = 0 THEN 'false'
           WHEN count(*) = 1 THEN format('%I.%I = (%s)::%s', p_alias, min(col), p_text, min(typ))
           ELSE format('%s = %s', public.data_reset_key_sql(p_table, p_alias), p_text)
         END
    FROM public.data_reset_pk(p_table);
$$;

-- Owner columns: uuid/text columns that identify the member a row belongs to.
-- Actor columns (who approved/processed/updated it) do not make a row someone's data.
CREATE OR REPLACE FUNCTION public.data_reset_owner_columns(p_table regclass, p_manifest jsonb)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH tname AS (SELECT c.relname AS n FROM pg_class c WHERE c.oid = p_table),
  user_fk AS (
    SELECT c.conkey[1] AS attnum
      FROM pg_constraint c
     WHERE c.conrelid = p_table AND c.contype = 'f' AND array_length(c.conkey, 1) = 1
       AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
     UNION
    SELECT c.conkey[1]
      FROM pg_constraint c
     WHERE c.conrelid = p_table AND c.contype = 'f' AND array_length(c.conkey, 1) = 1
       AND to_regclass('public.test_users') IS NOT NULL AND c.confrelid = to_regclass('public.test_users')),
  auto AS (
    SELECT a.attname::text AS col
      FROM pg_attribute a
     WHERE a.attrelid = p_table AND a.attnum > 0 AND NOT a.attisdropped
       AND a.atttypid = 'uuid'::regtype
       AND (a.attname ~ '^(user_id|owner_id|seller_id|buyer_id|sender_id|peer_id|reporter_id|reviewer_id|reviewee_id)$'
            OR a.attname ~ '_user_id$' OR a.attname ~ '_buyer_id$'
            OR a.attnum IN (SELECT attnum FROM user_fk))
       AND a.attname !~ '(_by$|_by_|(^|_)(admin|actor)(_|$))'),
  incl AS (
    SELECT split_part(v, '.', 2) AS col
      FROM jsonb_array_elements_text(coalesce(p_manifest -> 'ownerInclude', '[]'::jsonb)) v, tname
     WHERE split_part(v, '.', 1) = tname.n),
  excl AS (
    SELECT split_part(v, '.', 2) AS col
      FROM jsonb_array_elements_text(coalesce(p_manifest -> 'ownerExclude', '[]'::jsonb)) v, tname
     WHERE split_part(v, '.', 1) = tname.n)
  SELECT coalesce(array_agg(DISTINCT col ORDER BY col), '{}')
    FROM (SELECT col FROM auto UNION SELECT col FROM incl) u
   WHERE col NOT IN (SELECT col FROM excl)
     AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = p_table AND a.attname = u.col AND NOT a.attisdropped);
$$;

-- Account classification. Only TESTER accounts are deletable owners.
CREATE OR REPLACE FUNCTION public.data_reset_account_categories()
RETURNS TABLE (user_id uuid, category text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id,
         CASE
           WHEN EXISTS (SELECT 1 FROM public.admin_memberships m WHERE m.user_id = u.id AND m.status::text = 'active') THEN 'ADMIN'
           WHEN u.raw_user_meta_data ? 'dibay_system_principal' THEN 'SYSTEM'
           WHEN o.decision IS NOT NULL THEN o.decision
           WHEN EXISTS (SELECT 1 FROM public.admin_memberships m WHERE m.user_id = u.id) THEN 'ADMIN_REVOKED'
           WHEN p.manual_account_type = 'operations_member' THEN 'OPERATIONS'
           WHEN p.manual_account_type = 'development_member'
             OR u.raw_user_meta_data ->> 'p0_r4_qa' = 'true'
             OR (to_regclass('public.test_users') IS NOT NULL
                 AND EXISTS (SELECT 1 FROM public.test_users t WHERE t.id = u.id)) THEN 'TESTER'
           ELSE 'UNKNOWN'
         END
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.data_reset_account_overrides o ON o.user_id = u.id;
$$;

-- ---------------------------------------------------------------------------
-- 2b. Append-only audit trail (written inside the same transaction as each transition;
--     blocked attempts are written by the server through data_reset_audit_log()).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_reset_audit_events (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  action text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('ok', 'blocked', 'error')),
  window_id uuid,
  plan_id uuid,
  run_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS data_reset_audit_events_at_idx ON public.data_reset_audit_events (at DESC);
ALTER TABLE public.data_reset_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.data_reset_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.data_reset_audit_events TO service_role;

CREATE OR REPLACE FUNCTION public.data_reset_audit_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'data_reset_audit_events_append_only';
END $$;
DROP TRIGGER IF EXISTS data_reset_audit_events_no_change ON public.data_reset_audit_events;
CREATE TRIGGER data_reset_audit_events_no_change
  BEFORE UPDATE OR DELETE ON public.data_reset_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.data_reset_audit_events_immutable();

CREATE OR REPLACE FUNCTION public.data_reset_audit_log(
  p_actor uuid, p_action text, p_outcome text,
  p_window_id uuid DEFAULT NULL, p_plan_id uuid DEFAULT NULL, p_run_id uuid DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, plan_id, run_id, detail)
  VALUES (p_actor, p_action, p_outcome, p_window_id, p_plan_id, p_run_id, coalesce(p_detail, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- 3. Plan builder (dry-run: writes only data_reset_* rows)
-- ---------------------------------------------------------------------------
-- p_manifest: {
--   "version": "...",
--   "tables": { "<table>": { "class": "DELETE|KEEP|LEGAL_HOLD|COND|UNRESOLVED|SPLIT",
--                            "split": "<sql predicate over the table's columns>"?, "holdAll": bool?, "wholesale": bool? } },
--   "softRefs": [ { "from": "reports", "col": "product_id", "to": ["posts"], "toCol": "id" } ],
--   "pathColumns": [ { "table": "community_post_images", "col": "storage_path", "bucket": "post-images" } ],
--   "ownerInclude": ["test_users.id"], "ownerExclude": ["x.y"] }
--
-- Rules
--   * KEEP / UNRESOLVED / LEGAL_HOLD (unless released) / holdAll (unless released) / no PK → whole table kept.
--   * Tables with owner columns: a row is a candidate when at least one owner column is set and every
--     set owner column is a TESTER account (rows of real, unknown, admin, system accounts stay).
--   * Tables without owner columns: wholesale → every row; otherwise a row follows its "data parents"
--     (FK / soft-ref parents that hold member data): no link → kept; any linked parent kept → kept.
--   * Fixpoint: a candidate referenced by any row that stays (FK or soft ref) is kept.
CREATE OR REPLACE FUNCTION public.data_reset_full_build_plan(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET client_min_messages = warning
AS $$
DECLARE
  v_plan public.data_reset_plans;
  v_win public.data_reset_windows;
  m jsonb;
  r record;
  fk record;
  v_missing text[];
  v_cls text;
  v_owners text[];
  v_pred text;
  v_any text;
  v_col text;
  v_skip text;
  v_released boolean;
  v_n bigint;
  v_changed bigint;
  v_round int := 0;
  v_order int := 0;
  v_summary jsonb;
  v_hash text;
  v_ref record;
  v_cond text;
  v_url_re constant text := '/storage/v1/object/(?:public|sign|authenticated)/([A-Za-z0-9._-]+)/([^"?\s\\]+)';
BEGIN
  SELECT * INTO v_plan FROM public.data_reset_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_plan.status <> 'building' THEN RAISE EXCEPTION 'plan_not_building'; END IF;
  v_win := public.data_reset_window_current();
  IF v_win.id IS DISTINCT FROM v_plan.window_id OR v_win.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'window_not_open';
  END IF;
  m := v_plan.manifest;

  -- Manifest must cover every public base table (fail-closed on schema drift) with a known class.
  SELECT array_agg(c.relname ORDER BY c.relname) INTO v_missing
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
     AND c.relname NOT LIKE 'data\_reset\_%'
     AND NOT coalesce(m -> 'tables', '{}'::jsonb) ? c.relname;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'manifest_missing_tables: %', array_to_string(v_missing, ',');
  END IF;
  SELECT array_agg(e.k ORDER BY e.k) INTO v_missing
    FROM jsonb_each(m -> 'tables') e(k, v)
   WHERE coalesce(e.v ->> 'class', '') NOT IN ('DELETE', 'KEEP', 'LEGAL_HOLD', 'COND', 'UNRESOLVED', 'SPLIT');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'manifest_bad_class: %', array_to_string(v_missing, ',');
  END IF;

  DELETE FROM public.data_reset_plan_targets WHERE plan_id = p_plan_id;
  DELETE FROM public.data_reset_plan_tables WHERE plan_id = p_plan_id;
  DELETE FROM public.data_reset_plan_auth WHERE plan_id = p_plan_id;
  DELETE FROM public.data_reset_plan_storage WHERE plan_id = p_plan_id;

  DROP TABLE IF EXISTS _dr_accounts, _dr_testers, _dr_fk, _dr_data_tables, _dr_steps;
  CREATE TEMP TABLE _dr_accounts ON COMMIT DROP AS SELECT * FROM public.data_reset_account_categories();
  CREATE TEMP TABLE _dr_testers ON COMMIT DROP AS SELECT user_id::text AS uid FROM _dr_accounts WHERE category = 'TESTER';
  CREATE UNIQUE INDEX ON _dr_testers (uid);

  -- 3a. Candidate rows per table
  FOR r IN
    SELECT c.oid::regclass AS reg, c.relname::text AS name
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
       AND c.relname NOT LIKE 'data\_reset\_%'
     ORDER BY c.relname
  LOOP
    v_cls := m -> 'tables' -> r.name ->> 'class';
    v_owners := public.data_reset_owner_columns(r.reg, m);
    v_released := EXISTS (SELECT 1 FROM public.data_reset_release_flags f WHERE f.table_name = r.name);
    v_skip := CASE
      WHEN public.data_reset_key_sql(r.reg, NULL) IS NULL THEN 'no_primary_key'
      WHEN v_cls = 'KEEP' THEN 'class_keep'
      WHEN v_cls = 'UNRESOLVED' THEN 'class_unresolved'
      WHEN v_cls = 'LEGAL_HOLD' AND NOT v_released THEN 'legal_hold'
      WHEN coalesce((m -> 'tables' -> r.name ->> 'holdAll')::boolean, false) AND NOT v_released THEN 'hold_all'
      WHEN v_cls = 'SPLIT' AND coalesce(m -> 'tables' -> r.name ->> 'split', '') = '' THEN 'split_predicate_missing'
      WHEN array_length(v_owners, 1) IS NULL
           AND NOT coalesce((m -> 'tables' -> r.name ->> 'wholesale')::boolean, false)
           AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = r.reg AND c.contype = 'f')
           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(m -> 'softRefs', '[]'::jsonb)) s WHERE s ->> 'from' = r.name)
        THEN 'no_owner_column'
      ELSE NULL END;

    INSERT INTO public.data_reset_plan_tables (plan_id, table_name, class, key_expr, owner_columns, skip_reason)
    VALUES (p_plan_id, r.name, v_cls, coalesce(public.data_reset_key_sql(r.reg, NULL), '(no primary key)'), v_owners, v_skip);
    EXECUTE format('UPDATE public.data_reset_plan_tables SET total_rows = (SELECT count(*) FROM %s) WHERE plan_id = $1 AND table_name = $2', r.reg)
      USING p_plan_id, r.name;
    IF v_skip IS NOT NULL THEN CONTINUE; END IF;

    v_pred := 'true';
    IF v_cls = 'SPLIT' THEN
      v_pred := '(' || (m -> 'tables' -> r.name ->> 'split') || ')';
    END IF;
    IF array_length(v_owners, 1) IS NOT NULL THEN
      v_any := NULL;
      FOREACH v_col IN ARRAY v_owners LOOP
        v_pred := v_pred || format(' AND (t.%1$I IS NULL OR t.%1$I::text IN (SELECT uid FROM _dr_testers))', v_col);
        v_any := coalesce(v_any || ' OR ', '') || format('t.%I IS NOT NULL', v_col);
      END LOOP;
      v_pred := v_pred || ' AND (' || v_any || ')';
    END IF;

    EXECUTE format(
      'INSERT INTO public.data_reset_plan_targets (plan_id, table_name, row_key) SELECT $1, $2, %s FROM %s t WHERE %s ON CONFLICT DO NOTHING',
      public.data_reset_key_sql(r.reg, 't'), r.reg, v_pred)
      USING p_plan_id, r.name;
  END LOOP;

  -- 3b. Reference graph: real FKs (typed equality) + manifest soft references (text equality).
  CREATE TEMP TABLE _dr_fk ON COMMIT DROP AS
  SELECT c.conrelid::regclass AS child, cc.relname::text AS child_name,
         c.confrelid::regclass AS parent, pc.relname::text AS parent_name,
         (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS child_cols,
         (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS parent_cols,
         false AS soft
    FROM pg_constraint c
    JOIN pg_class cc ON cc.oid = c.conrelid AND cc.relnamespace = 'public'::regnamespace
    JOIN pg_class pc ON pc.oid = c.confrelid AND pc.relnamespace = 'public'::regnamespace
   WHERE c.contype = 'f'
     AND cc.relname NOT LIKE 'data\_reset\_%' AND pc.relname NOT LIKE 'data\_reset\_%';
  INSERT INTO _dr_fk
  SELECT to_regclass('public.' || (s ->> 'from')), s ->> 'from',
         to_regclass('public.' || t.v), t.v,
         ARRAY[s ->> 'col'], ARRAY[coalesce(s ->> 'toCol', 'id')], true
    FROM jsonb_array_elements(coalesce(m -> 'softRefs', '[]'::jsonb)) s
    CROSS JOIN LATERAL jsonb_array_elements_text(s -> 'to') t(v)
   WHERE to_regclass('public.' || (s ->> 'from')) IS NOT NULL
     AND to_regclass('public.' || t.v) IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.' || (s ->> 'from'))
                   AND a.attname = s ->> 'col' AND NOT a.attisdropped);
  ALTER TABLE _dr_fk ADD COLUMN cond text;
  UPDATE _dr_fk f SET cond = (
    SELECT string_agg(CASE WHEN f.soft THEN format('c.%I::text = p.%I::text', f.child_cols[i], f.parent_cols[i])
                           ELSE format('c.%I = p.%I', f.child_cols[i], f.parent_cols[i]) END, ' AND ')
      FROM generate_subscripts(f.child_cols, 1) i);

  -- Tables that hold member data (an owner column, or candidate rows of their own).
  CREATE TEMP TABLE _dr_data_tables ON COMMIT DROP AS
  SELECT t.table_name FROM public.data_reset_plan_tables t
   WHERE t.plan_id = p_plan_id
     AND (t.owner_columns <> '{}'
          OR EXISTS (SELECT 1 FROM public.data_reset_plan_targets x WHERE x.plan_id = p_plan_id AND x.table_name = t.table_name));

  -- Owner-less, non-wholesale tables: a row is someone's data only through a data parent that is itself
  -- a deletion candidate. Rows with no such parent (no link, orphan link, lookup-only link) are kept.
  FOR r IN SELECT pt.table_name FROM public.data_reset_plan_tables pt
            WHERE pt.plan_id = p_plan_id AND pt.owner_columns = '{}' AND pt.skip_reason IS NULL
              AND NOT coalesce((m -> 'tables' -> pt.table_name ->> 'wholesale')::boolean, false) LOOP
    SELECT string_agg(format(
             'EXISTS (SELECT 1 FROM %1$s p JOIN public.data_reset_plan_targets ppt
                         ON ppt.plan_id = $1 AND ppt.table_name = %2$L AND ppt.status = ''target'' AND %3$s
                       WHERE %4$s)',
             f.parent, f.parent_name, public.data_reset_key_eq(f.parent, 'p', 'ppt.row_key'), f.cond), ' OR ')
      INTO v_cond
      FROM _dr_fk f WHERE f.child_name = r.table_name AND f.child_name <> f.parent_name
       AND f.parent_name IN (SELECT table_name FROM _dr_data_tables);
    EXECUTE format(
      'UPDATE public.data_reset_plan_targets ct SET status = ''excluded'', reason = ''no_tester_parent'', updated_at = now()
         FROM %1$s c WHERE ct.plan_id = $1 AND ct.table_name = $2 AND ct.status = ''target'' AND %2$s AND NOT (%3$s)',
      to_regclass('public.' || r.table_name), public.data_reset_key_eq(to_regclass('public.' || r.table_name), 'c', 'ct.row_key'),
      coalesce(v_cond, 'false'))
      USING p_plan_id, r.table_name;
  END LOOP;

  -- 3c. Fixpoint
  LOOP
    v_round := v_round + 1;
    v_changed := 0;
    FOR fk IN SELECT * FROM _dr_fk LOOP
      -- (1) A candidate referenced by a row that stays is kept (no cascade / set-null onto kept data).
      IF EXISTS (SELECT 1 FROM public.data_reset_plan_targets WHERE plan_id = p_plan_id AND table_name = fk.parent_name AND status = 'target') THEN
        EXECUTE format(
          'UPDATE public.data_reset_plan_targets pt SET status = ''excluded'', reason = $3, updated_at = now()
            WHERE pt.plan_id = $1 AND pt.table_name = $2 AND pt.status = ''target''
              AND pt.row_key IN (
                SELECT %1$s FROM %2$s p JOIN %3$s c ON %4$s
                 WHERE NOT EXISTS (SELECT 1 FROM public.data_reset_plan_targets ct
                                    WHERE ct.plan_id = $1 AND ct.table_name = $4 AND ct.status = ''target''
                                      AND ct.row_key = %5$s))',
          public.data_reset_key_sql(fk.parent, 'p'), fk.parent, fk.child, fk.cond,
          coalesce(public.data_reset_key_sql(fk.child, 'c'), 'NULL::text'))
          USING p_plan_id, fk.parent_name,
                CASE WHEN fk.soft THEN 'referenced_by_kept:' ELSE 'kept_child:' END || fk.child_name || '.' || array_to_string(fk.child_cols, ','),
                fk.child_name;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_changed := v_changed + v_n;
      END IF;

      -- (2) An owner-less (or manifest "followParents") non-wholesale candidate whose data parent stays
      --     is that parent's data → kept (e.g. a tester's message inside a real member's chat room).
      IF fk.parent_name IN (SELECT table_name FROM _dr_data_tables)
         AND fk.child_name <> fk.parent_name
         AND EXISTS (SELECT 1 FROM public.data_reset_plan_tables
                      WHERE plan_id = p_plan_id AND table_name = fk.child_name
                        AND (owner_columns = '{}' OR coalesce((m -> 'tables' -> fk.child_name ->> 'followParents')::boolean, false))
                        -- structural parents only: an owner reference (sender → profile) is not containment
                        AND NOT (fk.child_cols && owner_columns))
         AND NOT coalesce((m -> 'tables' -> fk.child_name ->> 'wholesale')::boolean, false)
         AND EXISTS (SELECT 1 FROM public.data_reset_plan_targets WHERE plan_id = p_plan_id AND table_name = fk.child_name AND status = 'target') THEN
        EXECUTE format(
          'UPDATE public.data_reset_plan_targets ct SET status = ''excluded'', reason = $3, updated_at = now()
            WHERE ct.plan_id = $1 AND ct.table_name = $2 AND ct.status = ''target''
              AND ct.row_key IN (
                SELECT %1$s FROM %2$s c JOIN %3$s p ON %4$s
                 WHERE NOT EXISTS (SELECT 1 FROM public.data_reset_plan_targets pt
                                    WHERE pt.plan_id = $1 AND pt.table_name = $4 AND pt.status = ''target''
                                      AND pt.row_key = %5$s))',
          public.data_reset_key_sql(fk.child, 'c'), fk.child, fk.parent, fk.cond,
          coalesce(public.data_reset_key_sql(fk.parent, 'p'), 'NULL::text'))
          USING p_plan_id, fk.child_name, 'kept_parent:' || fk.parent_name, fk.parent_name;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_changed := v_changed + v_n;
      END IF;
    END LOOP;
    EXIT WHEN v_changed = 0 OR v_round >= 100;
  END LOOP;
  IF v_changed <> 0 THEN RAISE EXCEPTION 'fixpoint_not_reached'; END IF;

  UPDATE public.data_reset_plan_tables t
     SET target_rows = coalesce((SELECT count(*) FROM public.data_reset_plan_targets x
                                  WHERE x.plan_id = p_plan_id AND x.table_name = t.table_name AND x.status = 'target'), 0),
         kept_reasons = CASE
           WHEN t.skip_reason IS NOT NULL THEN jsonb_build_object(t.skip_reason, t.total_rows)
           ELSE coalesce((SELECT jsonb_object_agg(reason, n) FROM (
                            SELECT reason, count(*) n FROM public.data_reset_plan_targets x
                             WHERE x.plan_id = p_plan_id AND x.table_name = t.table_name AND x.status = 'excluded'
                             GROUP BY reason) q), '{}'::jsonb)
                || jsonb_build_object('not_tester_owned_or_not_in_scope',
                     t.total_rows - (SELECT count(*) FROM public.data_reset_plan_targets x
                                      WHERE x.plan_id = p_plan_id AND x.table_name = t.table_name))
         END
   WHERE t.plan_id = p_plan_id;

  -- 3d. Step order: referencing tables before referenced tables (Kahn over tables with targets).
  CREATE TEMP TABLE _dr_steps ON COMMIT DROP AS
  SELECT table_name FROM public.data_reset_plan_tables WHERE plan_id = p_plan_id AND target_rows > 0;
  WHILE EXISTS (SELECT 1 FROM _dr_steps) LOOP
    WITH ready AS (
      SELECT s.table_name FROM _dr_steps s
       WHERE NOT EXISTS (
         SELECT 1 FROM _dr_fk f JOIN _dr_steps s2 ON s2.table_name = f.child_name
          WHERE f.parent_name = s.table_name AND f.child_name <> s.table_name))
    UPDATE public.data_reset_plan_tables t SET step_order = v_order
      FROM ready WHERE t.plan_id = p_plan_id AND t.table_name = ready.table_name;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      -- reference cycle: remaining tables share one step; per-row FK failures are recorded at execution.
      UPDATE public.data_reset_plan_tables t SET step_order = v_order
        FROM _dr_steps s WHERE t.plan_id = p_plan_id AND t.table_name = s.table_name;
      DELETE FROM _dr_steps;
    ELSE
      DELETE FROM _dr_steps s USING public.data_reset_plan_tables t
       WHERE t.plan_id = p_plan_id AND t.table_name = s.table_name AND t.step_order = v_order;
    END IF;
    v_order := v_order + 1;
  END LOOP;

  -- 3e. Auth accounts: TESTER only (re-checked against remaining references at the auth step).
  INSERT INTO public.data_reset_plan_auth (plan_id, user_id, category)
  SELECT p_plan_id, a.user_id, a.category FROM _dr_accounts a WHERE a.category = 'TESTER';

  -- 3f. Storage objects referenced by target rows (re-checked against rows that remain, after the DB phase).
  FOR r IN SELECT pt.table_name FROM public.data_reset_plan_tables pt
            WHERE pt.plan_id = p_plan_id AND pt.target_rows > 0 LOOP
    EXECUTE format(
      'INSERT INTO public.data_reset_plan_storage (plan_id, bucket_id, object_name)
       SELECT DISTINCT $1, mm[1], mm[2]
         FROM public.data_reset_plan_targets t
         JOIN %1$s c ON %2$s
         CROSS JOIN LATERAL regexp_matches(row_to_json(c)::text, $3, ''g'') mm
        WHERE t.plan_id = $1 AND t.table_name = $2 AND t.status = ''target''
       ON CONFLICT DO NOTHING',
      to_regclass('public.' || r.table_name), public.data_reset_key_eq(to_regclass('public.' || r.table_name), 'c', 't.row_key'))
      USING p_plan_id, r.table_name, v_url_re;
    FOR v_ref IN SELECT x.j FROM jsonb_array_elements(coalesce(m -> 'pathColumns', '[]'::jsonb)) x(j)
                  WHERE x.j ->> 'table' = r.table_name LOOP
      EXECUTE format(
        'INSERT INTO public.data_reset_plan_storage (plan_id, bucket_id, object_name)
         SELECT DISTINCT $1, $3, c.%3$I::text
           FROM public.data_reset_plan_targets t
           JOIN %1$s c ON %2$s
          WHERE t.plan_id = $1 AND t.table_name = $2 AND t.status = ''target''
            AND c.%3$I IS NOT NULL AND c.%3$I::text <> ''''
         ON CONFLICT DO NOTHING',
        to_regclass('public.' || r.table_name), public.data_reset_key_eq(to_regclass('public.' || r.table_name), 'c', 't.row_key'),
        v_ref.j ->> 'col')
        USING p_plan_id, r.table_name, v_ref.j ->> 'bucket';
    END LOOP;
  END LOOP;
  -- Objects uploaded by TESTER accounts (owner columns of storage.objects), whether or not a row points at them.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'storage.objects'::regclass AND attname = 'owner' AND NOT attisdropped) THEN
      EXECUTE 'INSERT INTO public.data_reset_plan_storage (plan_id, bucket_id, object_name)
               SELECT $1, o.bucket_id, o.name FROM storage.objects o WHERE o.owner::text IN (SELECT uid FROM _dr_testers)
               ON CONFLICT DO NOTHING' USING p_plan_id;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'storage.objects'::regclass AND attname = 'owner_id' AND NOT attisdropped) THEN
      EXECUTE 'INSERT INTO public.data_reset_plan_storage (plan_id, bucket_id, object_name)
               SELECT $1, o.bucket_id, o.name FROM storage.objects o WHERE o.owner_id::text IN (SELECT uid FROM _dr_testers)
               ON CONFLICT DO NOTHING' USING p_plan_id;
    END IF;
    UPDATE public.data_reset_plan_storage s SET status = 'excluded', reason = 'object_not_found'
     WHERE s.plan_id = p_plan_id
       AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = s.bucket_id AND o.name = s.object_name);
  END IF;

  -- 3g. Summary + hash
  SELECT jsonb_build_object(
           'tables', jsonb_object_agg(t.table_name, jsonb_build_object(
             'class', t.class, 'total', t.total_rows, 'delete', t.target_rows,
             'keep', t.total_rows - t.target_rows, 'keptReasons', t.kept_reasons,
             'skipReason', t.skip_reason, 'ownerColumns', to_jsonb(t.owner_columns), 'step', t.step_order)),
           'deleteRows', sum(t.target_rows), 'totalRows', sum(t.total_rows),
           'deleteTables', count(*) FILTER (WHERE t.target_rows > 0))
    INTO v_summary FROM public.data_reset_plan_tables t WHERE t.plan_id = p_plan_id;
  v_summary := v_summary || jsonb_build_object(
    'accounts', coalesce((SELECT jsonb_object_agg(category, n) FROM (SELECT category, count(*) n FROM _dr_accounts GROUP BY 1) q), '{}'::jsonb),
    'authTargets', (SELECT count(*) FROM public.data_reset_plan_auth WHERE plan_id = p_plan_id),
    'storageTargets', (SELECT count(*) FROM public.data_reset_plan_storage WHERE plan_id = p_plan_id AND status = 'target'),
    'manifestVersion', v_plan.manifest_version,
    'builtAt', now());
  SELECT encode(extensions.digest(convert_to(
           coalesce(string_agg(table_name || ':' || row_key, '|' ORDER BY table_name, row_key), '')
           || '#auth:' || coalesce((SELECT string_agg(user_id::text, ',' ORDER BY user_id) FROM public.data_reset_plan_auth WHERE plan_id = p_plan_id), '')
           || '#storage:' || coalesce((SELECT string_agg(bucket_id || '/' || object_name, ',' ORDER BY bucket_id, object_name)
                                          FROM public.data_reset_plan_storage WHERE plan_id = p_plan_id AND status = 'target'), ''),
           'UTF8'), 'sha256'), 'hex')
    INTO v_hash FROM public.data_reset_plan_targets WHERE plan_id = p_plan_id AND status = 'target';

  UPDATE public.data_reset_plans SET status = 'ready', summary = v_summary, plan_hash = v_hash WHERE id = p_plan_id;
  INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, plan_id, detail)
  VALUES (v_plan.created_by, 'plan_built', 'ok', v_plan.window_id, p_plan_id,
          jsonb_build_object('planHash', v_hash, 'deleteRows', v_summary -> 'deleteRows', 'authTargets', v_summary -> 'authTargets',
                             'storageTargets', v_summary -> 'storageTargets'));
  RETURN v_summary || jsonb_build_object('planHash', v_hash);
END $$;

-- ---------------------------------------------------------------------------
-- 4. Run lifecycle
-- ---------------------------------------------------------------------------
-- Raises unless the destructive guard is on and the run is running in phase p_phase. Expires overdue
-- windows first (which flags their runs abort_requested); callers check abort_requested themselves and
-- return normally so that the expiry/abort bookkeeping is committed, not rolled back.
CREATE OR REPLACE FUNCTION public.data_reset_full_assert_active(p_run_id uuid, p_phase text)
RETURNS public.data_reset_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public.data_reset_runs;
BEGIN
  PERFORM public.data_reset_assert_destructive_allowed();
  PERFORM public.data_reset_window_current();
  SELECT * INTO v_run FROM public.data_reset_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status <> 'running' THEN RAISE EXCEPTION 'run_not_running'; END IF;
  IF v_run.phase <> p_phase THEN RAISE EXCEPTION 'run_wrong_phase: %', v_run.phase; END IF;
  RETURN v_run;
END $$;

CREATE OR REPLACE FUNCTION public.data_reset_full_start_run(p_plan_id uuid, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_plan public.data_reset_plans; v_win public.data_reset_windows; v_run uuid; r record;
BEGIN
  PERFORM public.data_reset_assert_destructive_allowed();
  v_win := public.data_reset_window_current();
  SELECT * INTO v_plan FROM public.data_reset_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_win.id IS DISTINCT FROM v_plan.window_id OR v_win.status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'window_not_open'; END IF;
  IF v_plan.status <> 'approved' THEN RAISE EXCEPTION 'plan_not_approved'; END IF;
  IF v_plan.confirmed_by IS NULL OR v_plan.approved_by IS NULL OR v_plan.confirmed_by = v_plan.approved_by THEN
    RAISE EXCEPTION 'two_person_rule_violated';
  END IF;
  IF v_plan.backup_attested_at IS NULL THEN RAISE EXCEPTION 'backup_not_attested'; END IF;
  IF v_plan.expires_at <= now() THEN RAISE EXCEPTION 'plan_expired'; END IF;
  IF p_actor IS DISTINCT FROM v_plan.confirmed_by AND p_actor IS DISTINCT FROM v_plan.approved_by THEN
    RAISE EXCEPTION 'actor_not_signatory';
  END IF;

  INSERT INTO public.data_reset_runs (plan_id, started_by, status) VALUES (p_plan_id, p_actor, 'running') RETURNING id INTO v_run;
  FOR r IN SELECT table_name, step_order, target_rows FROM public.data_reset_plan_tables
            WHERE plan_id = p_plan_id AND target_rows > 0 LOOP
    INSERT INTO public.data_reset_run_steps (run_id, table_name, step_order, planned)
    VALUES (v_run, r.table_name, r.step_order, r.target_rows);
    EXECUTE format('UPDATE public.data_reset_run_steps SET before_count = (SELECT count(*) FROM %s) WHERE run_id = $1 AND table_name = $2',
                   to_regclass('public.' || r.table_name)) USING v_run, r.table_name;
  END LOOP;
  UPDATE public.data_reset_plans SET status = 'running' WHERE id = p_plan_id;
  INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, plan_id, run_id, detail)
  VALUES (p_actor, 'run_started', 'ok', v_plan.window_id, p_plan_id, v_run, jsonb_build_object('planHash', v_plan.plan_hash));
  RETURN v_run;
END $$;

-- Deletes at most p_limit planned rows of the current step in one transaction. Call repeatedly;
-- every call is idempotent and resumable (state lives in data_reset_plan_targets / run_steps).
CREATE OR REPLACE FUNCTION public.data_reset_full_execute_batch(p_run_id uuid, p_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET client_min_messages = warning
SET lock_timeout = '10s'
AS $$
DECLARE
  v_run public.data_reset_runs;
  v_plan public.data_reset_plans;
  v_step public.data_reset_run_steps;
  v_reg regclass;
  v_keys text[];
  v_deleted text[];
  v_skip bigint := 0;
  v_del bigint := 0;
  fk record;
  v_cond text;
  v_row text;
  v_n bigint;
  v_remaining bigint;
  v_lock_tables text[];
  t text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('dibay_data_reset_full_run')) THEN
    RETURN jsonb_build_object('busy', true);
  END IF;
  v_run := public.data_reset_full_assert_active(p_run_id, 'db');
  IF v_run.abort_requested THEN RETURN jsonb_build_object('abort', true); END IF;
  SELECT * INTO v_plan FROM public.data_reset_plans WHERE id = v_run.plan_id;
  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT * INTO v_step FROM public.data_reset_run_steps
   WHERE run_id = p_run_id AND status IN ('pending', 'running')
   ORDER BY step_order, table_name LIMIT 1;
  IF NOT FOUND THEN
    UPDATE public.data_reset_runs SET phase = 'storage', updated_at = now() WHERE id = p_run_id;
    INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, plan_id, run_id, detail)
    VALUES (v_run.started_by, 'db_phase_done', 'ok', v_plan.window_id, v_plan.id, p_run_id,
            (SELECT jsonb_build_object('deleted', coalesce(sum(deleted), 0), 'skipped', coalesce(sum(skipped), 0)) FROM public.data_reset_run_steps WHERE run_id = p_run_id));
    RETURN jsonb_build_object('dbDone', true);
  END IF;
  v_reg := to_regclass('public.' || v_step.table_name);
  IF v_reg IS NULL THEN RAISE EXCEPTION 'table_missing: %', v_step.table_name; END IF;

  SELECT array_agg(row_key) INTO v_keys FROM (
    SELECT row_key FROM public.data_reset_plan_targets
     WHERE plan_id = v_plan.id AND table_name = v_step.table_name AND status = 'target'
     ORDER BY row_key LIMIT greatest(1, least(coalesce(p_limit, 1000), 5000))) q;

  IF v_keys IS NOT NULL THEN
    -- Block concurrent writes on tables that point here only through non-FK links
    -- (FK children are blocked by the row locks below).
    SELECT array_agg(DISTINCT s ->> 'from') INTO v_lock_tables
      FROM jsonb_array_elements(coalesce(v_plan.manifest -> 'softRefs', '[]'::jsonb)) s
     WHERE (s -> 'to') ? v_step.table_name AND to_regclass('public.' || (s ->> 'from')) IS NOT NULL
       AND s ->> 'from' <> v_step.table_name;
    IF v_lock_tables IS NOT NULL THEN
      FOREACH t IN ARRAY v_lock_tables LOOP
        EXECUTE format('LOCK TABLE %s IN SHARE MODE', to_regclass('public.' || t));
      END LOOP;
    END IF;

    -- Lock the batch rows; rows that no longer exist are recorded and skipped.
    DROP TABLE IF EXISTS _dr_batch;
    CREATE TEMP TABLE _dr_batch (row_key text PRIMARY KEY) ON COMMIT DROP;
    EXECUTE format('INSERT INTO _dr_batch SELECT k FROM (SELECT %1$s AS k FROM %2$s c WHERE %3$s FOR UPDATE) q',
                   public.data_reset_key_sql(v_reg, 'c'), v_reg, public.data_reset_key_any(v_reg, 'c', '$1')) USING v_keys;
    UPDATE public.data_reset_plan_targets SET status = 'excluded', reason = 'absent_at_execution', updated_at = now()
     WHERE plan_id = v_plan.id AND table_name = v_step.table_name AND row_key = ANY(v_keys)
       AND NOT EXISTS (SELECT 1 FROM _dr_batch b WHERE b.row_key = data_reset_plan_targets.row_key);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_skip := v_skip + v_n;

    -- Re-check under lock: a row (FK or soft reference) that is not being deleted points at a batch row.
    FOR fk IN
      SELECT c.conrelid::regclass AS child, cc.relname::text AS child_name,
             (SELECT string_agg(format('c.%I = p.%I', ca.attname, pa.attname), ' AND ')
                FROM unnest(c.conkey, c.confkey) AS k(ck, pk)
                JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = k.ck
                JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = k.pk) AS cond
        FROM pg_constraint c JOIN pg_class cc ON cc.oid = c.conrelid
       WHERE c.contype = 'f' AND c.confrelid = v_reg
         AND cc.relnamespace = 'public'::regnamespace AND cc.relname NOT LIKE 'data\_reset\_%'
      UNION ALL
      SELECT to_regclass('public.' || (s ->> 'from')), s ->> 'from',
             format('c.%I::text = p.%I::text', s ->> 'col', coalesce(s ->> 'toCol', 'id'))
        FROM jsonb_array_elements(coalesce(v_plan.manifest -> 'softRefs', '[]'::jsonb)) s
       WHERE (s -> 'to') ? v_step.table_name AND to_regclass('public.' || (s ->> 'from')) IS NOT NULL
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.' || (s ->> 'from'))
                       AND a.attname = s ->> 'col' AND NOT a.attisdropped)
    LOOP
      EXECUTE format(
        'UPDATE public.data_reset_plan_targets pt SET status = ''excluded'', reason = $4, updated_at = now()
          WHERE pt.plan_id = $1 AND pt.table_name = $2 AND pt.status = ''target'' AND pt.row_key = ANY($3)
            AND pt.row_key IN (
              SELECT %1$s FROM %2$s p JOIN %3$s c ON %4$s
               WHERE %5$s
                 AND NOT EXISTS (SELECT 1 FROM public.data_reset_plan_targets ct
                                  WHERE ct.plan_id = $1 AND ct.table_name = $5 AND ct.status IN (''target'', ''deleted'')
                                    AND ct.row_key = %6$s))',
        public.data_reset_key_sql(v_reg, 'p'), v_reg, fk.child, fk.cond,
        public.data_reset_key_any(v_reg, 'p', '$3'),
        coalesce(public.data_reset_key_sql(fk.child, 'c'), 'NULL::text'))
        USING v_plan.id, v_step.table_name, v_keys, 'referenced_at_execution:' || fk.child_name, fk.child_name;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_skip := v_skip + v_n;
    END LOOP;

    SELECT array_agg(pt.row_key) INTO v_keys FROM public.data_reset_plan_targets pt
     WHERE pt.plan_id = v_plan.id AND pt.table_name = v_step.table_name AND pt.status = 'target'
       AND pt.row_key IN (SELECT b.row_key FROM _dr_batch b);

    IF v_keys IS NOT NULL THEN
      BEGIN
        EXECUTE format('WITH d AS (DELETE FROM %1$s c WHERE %2$s RETURNING %3$s AS k) SELECT array_agg(k) FROM d',
                       v_reg, public.data_reset_key_any(v_reg, 'c', '$1'), public.data_reset_key_sql(v_reg, 'c'))
          INTO v_deleted USING v_keys;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
        -- Row by row so one blocked row does not stop the rest; every failure is recorded.
        v_deleted := '{}';
        FOREACH v_row IN ARRAY v_keys LOOP
          BEGIN
            EXECUTE format('DELETE FROM %1$s c WHERE %2$s', v_reg, public.data_reset_key_eq(v_reg, 'c', '$1')) USING v_row;
            GET DIAGNOSTICS v_n = ROW_COUNT;
            IF v_n > 0 THEN v_deleted := v_deleted || v_row; END IF;
          EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
            UPDATE public.data_reset_plan_targets SET status = 'excluded', reason = 'fk_blocked_at_execution:' || SQLERRM, updated_at = now()
             WHERE plan_id = v_plan.id AND table_name = v_step.table_name AND row_key = v_row;
            v_skip := v_skip + 1;
          END;
        END LOOP;
      END;
      v_deleted := coalesce(v_deleted, '{}');
      v_del := coalesce(array_length(v_deleted, 1), 0);
      UPDATE public.data_reset_plan_targets SET status = 'deleted', reason = NULL, updated_at = now()
       WHERE plan_id = v_plan.id AND table_name = v_step.table_name AND row_key = ANY(v_deleted);
    END IF;
  END IF;

  SELECT count(*) INTO v_remaining FROM public.data_reset_plan_targets
   WHERE plan_id = v_plan.id AND table_name = v_step.table_name AND status = 'target';
  UPDATE public.data_reset_run_steps
     SET deleted = deleted + v_del, skipped = skipped + v_skip, status = 'running', updated_at = now()
   WHERE run_id = p_run_id AND table_name = v_step.table_name;
  IF v_remaining = 0 THEN
    EXECUTE format('UPDATE public.data_reset_run_steps SET status = CASE WHEN skipped > 0 THEN ''partial'' ELSE ''done'' END,
                      after_count = (SELECT count(*) FROM %s), updated_at = now() WHERE run_id = $1 AND table_name = $2',
                   v_reg) USING p_run_id, v_step.table_name;
  END IF;
  UPDATE public.data_reset_runs SET updated_at = now() WHERE id = p_run_id;
  RETURN jsonb_build_object('table', v_step.table_name, 'deleted', v_del, 'skipped', v_skip,
                            'remaining', v_remaining, 'stepDone', v_remaining = 0);
END $$;

-- References that still point at an account after the DB phase (any → the Auth user is kept).
CREATE OR REPLACE FUNCTION public.data_reset_full_auth_blockers(p_plan_id uuid, p_user uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r record; v_out text[] := '{}'; v_hit boolean;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, cc.relname::text AS tname, a.attname::text AS col
      FROM pg_constraint c
      JOIN pg_class cc ON cc.oid = c.conrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
       AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
       AND cc.relnamespace = 'public'::regnamespace AND cc.relname NOT LIKE 'data\_reset\_%'
    UNION
    SELECT to_regclass('public.' || t.table_name), t.table_name, unnest(t.owner_columns)
      FROM public.data_reset_plan_tables t WHERE t.plan_id = p_plan_id
  LOOP
    CONTINUE WHEN r.tbl IS NULL;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I::text = $1)', r.tbl, r.col) INTO v_hit USING p_user::text;
    IF v_hit THEN v_out := v_out || (r.tname || '.' || r.col); END IF;
  END LOOP;
  -- Storage objects owned by the account that remain (kept or not yet removed) also block.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'storage.objects'::regclass AND attname = 'owner' AND NOT attisdropped) THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM storage.objects WHERE owner::text = $1)' INTO v_hit USING p_user::text;
      IF v_hit THEN v_out := v_out || 'storage.objects.owner'::text; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'storage.objects'::regclass AND attname = 'owner_id' AND NOT attisdropped) THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM storage.objects WHERE owner_id::text = $1)' INTO v_hit USING p_user::text;
      IF v_hit THEN v_out := v_out || 'storage.objects.owner_id'::text; END IF;
    END IF;
  END IF;
  RETURN (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') FROM unnest(v_out) x);
END $$;

-- Storage: one-time recheck after the DB phase — objects still referenced by any remaining row are kept.
CREATE OR REPLACE FUNCTION public.data_reset_full_storage_recheck(p_plan_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET client_min_messages = warning
AS $$
DECLARE r record; m jsonb; v_n bigint;
  v_url_re constant text := '/storage/v1/object/(?:public|sign|authenticated)/([A-Za-z0-9._-]+)/([^"?\s\\]+)';
BEGIN
  SELECT manifest INTO m FROM public.data_reset_plans WHERE id = p_plan_id;
  DROP TABLE IF EXISTS _dr_live_refs;
  CREATE TEMP TABLE _dr_live_refs (bucket_id text, object_name text) ON COMMIT DROP;
  FOR r IN SELECT c.oid::regclass AS reg FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
              AND c.relname NOT LIKE 'data\_reset\_%'
              AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                            AND a.atttypid IN ('text'::regtype, 'jsonb'::regtype, 'json'::regtype, 'text[]'::regtype,
                                               'varchar'::regtype, 'varchar[]'::regtype)) LOOP
    EXECUTE format('INSERT INTO _dr_live_refs SELECT mm[1], mm[2] FROM %s c CROSS JOIN LATERAL regexp_matches(row_to_json(c)::text, $1, ''g'') mm',
                   r.reg) USING v_url_re;
  END LOOP;
  FOR r IN SELECT x.j FROM jsonb_array_elements(coalesce(m -> 'pathColumns', '[]'::jsonb)) x(j)
            WHERE to_regclass('public.' || (x.j ->> 'table')) IS NOT NULL LOOP
    EXECUTE format('INSERT INTO _dr_live_refs SELECT $1, %I::text FROM %s WHERE %I IS NOT NULL',
                   r.j ->> 'col', to_regclass('public.' || (r.j ->> 'table')), r.j ->> 'col') USING r.j ->> 'bucket';
  END LOOP;
  UPDATE public.data_reset_plan_storage s SET status = 'excluded', reason = 'still_referenced', updated_at = now()
   WHERE s.plan_id = p_plan_id AND s.status = 'target'
     AND EXISTS (SELECT 1 FROM _dr_live_refs l WHERE l.bucket_id = s.bucket_id AND l.object_name = s.object_name);
  IF to_regclass('storage.objects') IS NOT NULL THEN
    UPDATE public.data_reset_plan_storage s SET status = 'excluded', reason = 'object_not_found', updated_at = now()
     WHERE s.plan_id = p_plan_id AND s.status = 'target'
       AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = s.bucket_id AND o.name = s.object_name);
  END IF;
  SELECT count(*) INTO v_n FROM public.data_reset_plan_storage WHERE plan_id = p_plan_id AND status = 'target';
  RETURN v_n;
END $$;

-- Storage step, part 1: next objects to remove through the Storage API (server side).
-- The first call performs the post-DB recheck. Returns {abort} / {done} / {items:[{bucket, name}]}.
CREATE OR REPLACE FUNCTION public.data_reset_full_storage_claim(p_run_id uuid, p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public.data_reset_runs; v_items jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('dibay_data_reset_full_run')) THEN
    RETURN jsonb_build_object('busy', true);
  END IF;
  v_run := public.data_reset_full_assert_active(p_run_id, 'storage');
  IF v_run.abort_requested THEN RETURN jsonb_build_object('abort', true); END IF;
  IF v_run.storage_rechecked_at IS NULL THEN
    PERFORM public.data_reset_full_storage_recheck(v_run.plan_id);
    UPDATE public.data_reset_runs SET storage_rechecked_at = now(), updated_at = now() WHERE id = p_run_id;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('bucket', q.bucket_id, 'name', q.object_name) ORDER BY q.bucket_id, q.object_name)
    INTO v_items
    FROM (SELECT s.bucket_id, s.object_name FROM public.data_reset_plan_storage s
           WHERE s.plan_id = v_run.plan_id AND s.status = 'target'
           ORDER BY s.bucket_id, s.object_name LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))) q;
  IF v_items IS NULL THEN
    UPDATE public.data_reset_runs SET phase = 'auth', updated_at = now() WHERE id = p_run_id;
    INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, plan_id, run_id, detail)
    VALUES (v_run.started_by, 'storage_phase_done', 'ok', v_run.plan_id, p_run_id,
            coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.data_reset_plan_storage
                                                                WHERE plan_id = v_run.plan_id GROUP BY 1) q), '{}'::jsonb));
    RETURN jsonb_build_object('done', true);
  END IF;
  RETURN jsonb_build_object('items', v_items);
END $$;

-- Storage step, part 2: record the Storage API outcome. "deleted" only when the object is really gone.
CREATE OR REPLACE FUNCTION public.data_reset_full_storage_mark(p_run_id uuid, p_bucket text, p_names text[], p_error text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public.data_reset_runs; v_gone bigint; v_left bigint;
BEGIN
  -- No guard/abort check: this only records the outcome of a Storage API call that already happened.
  SELECT * INTO v_run FROM public.data_reset_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'running' OR v_run.phase <> 'storage' THEN RAISE EXCEPTION 'run_not_in_storage_phase'; END IF;
  UPDATE public.data_reset_plan_storage s SET status = 'deleted', reason = NULL, updated_at = now()
   WHERE s.plan_id = v_run.plan_id AND s.bucket_id = p_bucket AND s.object_name = ANY(p_names) AND s.status = 'target'
     AND (to_regclass('storage.objects') IS NULL
          OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = s.bucket_id AND o.name = s.object_name));
  GET DIAGNOSTICS v_gone = ROW_COUNT;
  UPDATE public.data_reset_plan_storage s
     SET status = 'failed', reason = left('storage_remove_failed:' || coalesce(p_error, 'object_still_present'), 500), updated_at = now()
   WHERE s.plan_id = v_run.plan_id AND s.bucket_id = p_bucket AND s.object_name = ANY(p_names) AND s.status = 'target';
  GET DIAGNOSTICS v_left = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_gone, 'failed', v_left);
END $$;

-- Auth step: delete TESTER accounts that nothing references any more, inside one transaction per batch
-- (row lock on auth.users blocks new FK references between the check and the delete).
CREATE OR REPLACE FUNCTION public.data_reset_full_auth_batch(p_run_id uuid, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '10s'
AS $$
DECLARE v_run public.data_reset_runs; r record; v_block text[]; v_cat text; v_del int := 0; v_skip int := 0; v_fail int := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('dibay_data_reset_full_run')) THEN
    RETURN jsonb_build_object('busy', true);
  END IF;
  v_run := public.data_reset_full_assert_active(p_run_id, 'auth');
  IF v_run.abort_requested THEN RETURN jsonb_build_object('abort', true); END IF;
  FOR r IN SELECT a.user_id FROM public.data_reset_plan_auth a
            WHERE a.plan_id = v_run.plan_id AND a.status = 'target'
            ORDER BY a.user_id LIMIT greatest(1, least(coalesce(p_limit, 50), 500)) LOOP
    PERFORM 1 FROM auth.users u WHERE u.id = r.user_id FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE public.data_reset_plan_auth SET status = 'excluded', reason = 'absent_at_execution', updated_at = now()
       WHERE plan_id = v_run.plan_id AND user_id = r.user_id;
      v_skip := v_skip + 1; CONTINUE;
    END IF;
    -- The DB phase may have removed the tester marker itself (profile / test_users row), so only a
    -- category that became protected since planning stops the delete.
    SELECT category INTO v_cat FROM public.data_reset_account_categories() c WHERE c.user_id = r.user_id;
    IF v_cat IN ('ADMIN', 'SYSTEM', 'ADMIN_REVOKED', 'OPERATIONS', 'REAL_MEMBER') THEN
      UPDATE public.data_reset_plan_auth SET status = 'excluded', reason = 'category_changed:' || coalesce(v_cat, 'none'), updated_at = now()
       WHERE plan_id = v_run.plan_id AND user_id = r.user_id;
      v_skip := v_skip + 1; CONTINUE;
    END IF;
    v_block := public.data_reset_full_auth_blockers(v_run.plan_id, r.user_id);
    IF array_length(v_block, 1) IS NOT NULL THEN
      UPDATE public.data_reset_plan_auth SET status = 'excluded', reason = left('still_referenced:' || array_to_string(v_block, ','), 500), updated_at = now()
       WHERE plan_id = v_run.plan_id AND user_id = r.user_id;
      v_skip := v_skip + 1; CONTINUE;
    END IF;
    BEGIN
      DELETE FROM auth.users WHERE id = r.user_id;
      UPDATE public.data_reset_plan_auth SET status = 'deleted', reason = NULL, updated_at = now()
       WHERE plan_id = v_run.plan_id AND user_id = r.user_id;
      v_del := v_del + 1;
    EXCEPTION WHEN foreign_key_violation OR restrict_violation OR insufficient_privilege THEN
      UPDATE public.data_reset_plan_auth SET status = 'failed', reason = left('auth_delete_failed:' || SQLERRM, 500), updated_at = now()
       WHERE plan_id = v_run.plan_id AND user_id = r.user_id;
      v_fail := v_fail + 1;
    END;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.data_reset_plan_auth WHERE plan_id = v_run.plan_id AND status = 'target') THEN
    UPDATE public.data_reset_runs SET phase = 'verify', updated_at = now() WHERE id = p_run_id;
    INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, plan_id, run_id, detail)
    VALUES (v_run.started_by, 'auth_phase_done', 'ok', v_run.plan_id, p_run_id,
            coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.data_reset_plan_auth
                                                                WHERE plan_id = v_run.plan_id GROUP BY 1) q), '{}'::jsonb));
    RETURN jsonb_build_object('deleted', v_del, 'skipped', v_skip, 'failed', v_fail, 'authDone', true);
  END IF;
  RETURN jsonb_build_object('deleted', v_del, 'skipped', v_skip, 'failed', v_fail, 'authDone', false);
END $$;

-- Verification: deleted rows/users/objects are gone, step counts reconcile, and no table outside the
-- plan lost rows (cascade check). Returns issues; never edits data.
CREATE OR REPLACE FUNCTION public.data_reset_full_verify(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public.data_reset_runs; r record; v_left bigint; v_now bigint; v_issues jsonb := '[]'::jsonb; v_reg regclass;
  v_unfinished jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_run FROM public.data_reset_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  FOR r IN SELECT s.* FROM public.data_reset_run_steps s WHERE s.run_id = p_run_id LOOP
    v_reg := to_regclass('public.' || r.table_name);
    EXECUTE format('SELECT count(*) FROM public.data_reset_plan_targets t JOIN %1$s c ON %2$s
                     WHERE t.plan_id = $1 AND t.table_name = $2 AND t.status = ''deleted''',
                   v_reg, public.data_reset_key_eq(v_reg, 'c', 't.row_key'))
      INTO v_left USING v_run.plan_id, r.table_name;
    EXECUTE format('SELECT count(*) FROM %s', v_reg) INTO v_now;
    IF v_left > 0 THEN
      v_issues := v_issues || jsonb_build_object('table', r.table_name, 'issue', 'deleted_rows_present', 'count', v_left);
    END IF;
    IF r.status IN ('pending', 'running') THEN
      v_unfinished := v_unfinished || to_jsonb(r.table_name);
    END IF;
    IF r.deleted <> (SELECT count(*) FROM public.data_reset_plan_targets t
                      WHERE t.plan_id = v_run.plan_id AND t.table_name = r.table_name AND t.status = 'deleted') THEN
      v_issues := v_issues || jsonb_build_object('table', r.table_name, 'issue', 'deleted_count_mismatch');
    END IF;
    IF r.before_count IS NOT NULL AND r.before_count - v_now > r.deleted THEN
      v_issues := v_issues || jsonb_build_object('table', r.table_name, 'issue', 'unexpected_row_loss',
                                                 'expected', r.deleted, 'actual', r.before_count - v_now);
    END IF;
  END LOOP;
  FOR r IN SELECT t.* FROM public.data_reset_plan_tables t
            WHERE t.plan_id = v_run.plan_id AND t.target_rows = 0 AND to_regclass('public.' || t.table_name) IS NOT NULL LOOP
    EXECUTE format('SELECT count(*) FROM %s', to_regclass('public.' || r.table_name)) INTO v_now;
    IF v_now < r.total_rows THEN
      v_issues := v_issues || jsonb_build_object('table', r.table_name, 'issue', 'kept_table_shrank',
                                                 'planned', r.total_rows, 'now', v_now);
    END IF;
  END LOOP;
  SELECT count(*) INTO v_left FROM public.data_reset_plan_auth a JOIN auth.users u ON u.id = a.user_id
   WHERE a.plan_id = v_run.plan_id AND a.status = 'deleted';
  IF v_left > 0 THEN v_issues := v_issues || jsonb_build_object('issue', 'deleted_accounts_present', 'count', v_left); END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    SELECT count(*) INTO v_left FROM public.data_reset_plan_storage s
      JOIN storage.objects o ON o.bucket_id = s.bucket_id AND o.name = s.object_name
     WHERE s.plan_id = v_run.plan_id AND s.status = 'deleted';
    IF v_left > 0 THEN v_issues := v_issues || jsonb_build_object('issue', 'deleted_objects_present', 'count', v_left); END IF;
  END IF;
  RETURN jsonb_build_object('ok', jsonb_array_length(v_issues) = 0, 'issues', v_issues, 'unfinishedSteps', v_unfinished);
END $$;

-- Finish: the outcome is computed here (never passed in), the window is closed (automatic re-lock)
-- and every other plan of the window expires.
CREATE OR REPLACE FUNCTION public.data_reset_full_finish_run(p_run_id uuid, p_actor uuid, p_error text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public.data_reset_runs; v_plan public.data_reset_plans; v_verify jsonb; v_status text; v_result jsonb;
BEGIN
  SELECT * INTO v_run FROM public.data_reset_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF v_run.status <> 'running' THEN RETURN jsonb_build_object('status', v_run.status, 'alreadyFinished', true, 'result', v_run.result); END IF;
  SELECT * INTO v_plan FROM public.data_reset_plans WHERE id = v_run.plan_id FOR UPDATE;
  v_verify := public.data_reset_full_verify(p_run_id);
  v_status := CASE
    WHEN p_error IS NOT NULL OR NOT (v_verify ->> 'ok')::boolean THEN 'failed'
    WHEN v_run.phase <> 'verify' OR v_run.abort_requested THEN 'aborted'
    WHEN EXISTS (SELECT 1 FROM public.data_reset_run_steps WHERE run_id = p_run_id AND (skipped > 0 OR status <> 'done'))
      OR EXISTS (SELECT 1 FROM public.data_reset_plan_auth WHERE plan_id = v_plan.id AND status IN ('failed', 'target'))
      OR EXISTS (SELECT 1 FROM public.data_reset_plan_storage WHERE plan_id = v_plan.id AND status IN ('failed', 'target'))
      THEN 'partial'
    ELSE 'completed' END;
  v_result := jsonb_build_object(
    'verify', v_verify,
    'error', p_error,
    'phaseAtFinish', v_run.phase,
    'db', (SELECT jsonb_build_object('planned', coalesce(sum(planned), 0), 'deleted', coalesce(sum(deleted), 0), 'skipped', coalesce(sum(skipped), 0))
             FROM public.data_reset_run_steps WHERE run_id = p_run_id),
    'auth', coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.data_reset_plan_auth WHERE plan_id = v_plan.id GROUP BY 1) q), '{}'::jsonb),
    'storage', coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.data_reset_plan_storage WHERE plan_id = v_plan.id GROUP BY 1) q), '{}'::jsonb));
  UPDATE public.data_reset_runs SET status = v_status, phase = 'done', finished_at = now(), result = v_result, updated_at = now()
   WHERE id = p_run_id;
  UPDATE public.data_reset_plans SET status = v_status WHERE id = v_plan.id;
  UPDATE public.data_reset_windows SET status = 'closed', closed_at = now(), close_reason = 'run_' || v_status
   WHERE id = v_plan.window_id AND status = 'open';
  UPDATE public.data_reset_plans SET status = 'expired'
   WHERE window_id = v_plan.window_id AND status IN ('building', 'ready', 'confirmed', 'approved');
  INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, plan_id, run_id, detail)
  VALUES (p_actor, 'run_finished', CASE WHEN v_status IN ('completed', 'partial') THEN 'ok' ELSE 'error' END,
          v_plan.window_id, v_plan.id, p_run_id, jsonb_build_object('status', v_status) || v_result);
  RETURN jsonb_build_object('status', v_status, 'result', v_result);
END $$;

CREATE OR REPLACE FUNCTION public.data_reset_run_request_abort(p_run_id uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.data_reset_runs SET abort_requested = true, updated_at = now() WHERE id = p_run_id AND status = 'running';
  IF FOUND THEN
    INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, run_id) VALUES (p_actor, 'run_abort_requested', 'ok', p_run_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Window / plan state transitions (non-destructive; still service_role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.data_reset_window_request(p_actor uuid, p_reason text, p_target text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v uuid;
BEGIN
  PERFORM public.data_reset_window_current();
  BEGIN
    INSERT INTO public.data_reset_windows (status, reason, requested_by, database_target)
    VALUES ('requested', p_reason, p_actor, p_target) RETURNING id INTO v;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'window_already_active';
  END;
  INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, detail)
  VALUES (p_actor, 'window_requested', 'ok', v, jsonb_build_object('reason', p_reason, 'databaseTarget', p_target));
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.data_reset_window_decide(p_window_id uuid, p_actor uuid, p_approve boolean, p_minutes integer)
RETURNS public.data_reset_windows LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w public.data_reset_windows;
BEGIN
  PERFORM public.data_reset_window_current();
  SELECT * INTO w FROM public.data_reset_windows WHERE id = p_window_id FOR UPDATE;
  IF NOT FOUND OR w.status <> 'requested' THEN RAISE EXCEPTION 'window_not_requested'; END IF;
  IF w.requested_by = p_actor THEN RAISE EXCEPTION 'two_person_rule_violated'; END IF;
  IF p_approve THEN
    UPDATE public.data_reset_windows
       SET status = 'open', approved_by = p_actor, approved_at = now(),
           open_until = now() + make_interval(mins => least(greatest(coalesce(p_minutes, 120), 15), 240))
     WHERE id = p_window_id RETURNING * INTO w;
  ELSE
    UPDATE public.data_reset_windows SET status = 'rejected', approved_by = p_actor, closed_at = now(), close_reason = 'rejected'
     WHERE id = p_window_id RETURNING * INTO w;
  END IF;
  INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, detail)
  VALUES (p_actor, CASE WHEN p_approve THEN 'window_opened' ELSE 'window_rejected' END, 'ok', p_window_id,
          jsonb_build_object('openUntil', w.open_until));
  RETURN w;
END $$;

CREATE OR REPLACE FUNCTION public.data_reset_window_close(p_window_id uuid, p_actor uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.data_reset_windows SET status = 'closed', closed_at = now(), close_reason = coalesce(p_reason, 'closed')
   WHERE id = p_window_id AND status IN ('requested', 'open');
  IF FOUND THEN
    INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, detail)
    VALUES (p_actor, 'window_closed', 'ok', p_window_id, jsonb_build_object('reason', p_reason));
  END IF;
  -- expires plans of the closed window and flags any running run for abort
  PERFORM public.data_reset_window_current();
END $$;

CREATE OR REPLACE FUNCTION public.data_reset_plan_create(p_window_id uuid, p_actor uuid, p_version text, p_manifest jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w public.data_reset_windows; v uuid;
BEGIN
  w := public.data_reset_window_current();
  IF w.id IS DISTINCT FROM p_window_id OR w.status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'window_not_open'; END IF;
  IF EXISTS (SELECT 1 FROM public.data_reset_plans WHERE window_id = p_window_id AND status = 'running') THEN
    RAISE EXCEPTION 'run_in_progress';
  END IF;
  UPDATE public.data_reset_plans SET status = 'superseded'
   WHERE window_id = p_window_id AND status IN ('building', 'ready', 'confirmed', 'approved');
  INSERT INTO public.data_reset_plans (window_id, status, created_by, manifest_version, manifest, expires_at)
  VALUES (p_window_id, 'building', p_actor, p_version, p_manifest, least(w.open_until, now() + interval '60 minutes'))
  RETURNING id INTO v;
  INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, plan_id, detail)
  VALUES (p_actor, 'plan_created', 'ok', p_window_id, v, jsonb_build_object('manifestVersion', p_version));
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.data_reset_plan_confirm(p_plan_id uuid, p_actor uuid, p_plan_hash text, p_backup_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p public.data_reset_plans;
BEGIN
  PERFORM public.data_reset_window_current();
  SELECT * INTO p FROM public.data_reset_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'ready' THEN RAISE EXCEPTION 'plan_not_ready'; END IF;
  IF p.plan_hash IS DISTINCT FROM p_plan_hash THEN RAISE EXCEPTION 'plan_hash_mismatch'; END IF;
  IF coalesce(btrim(p_backup_reference), '') = '' THEN RAISE EXCEPTION 'backup_reference_required'; END IF;
  UPDATE public.data_reset_plans
     SET status = 'confirmed', confirmed_by = p_actor, confirmed_at = now(),
         backup_reference = p_backup_reference, backup_attested_by = p_actor, backup_attested_at = now()
   WHERE id = p_plan_id;
  INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, plan_id, detail)
  VALUES (p_actor, 'plan_confirmed', 'ok', p.window_id, p_plan_id,
          jsonb_build_object('planHash', p_plan_hash, 'backupReference', p_backup_reference));
END $$;

CREATE OR REPLACE FUNCTION public.data_reset_plan_approve(p_plan_id uuid, p_actor uuid, p_plan_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p public.data_reset_plans; w public.data_reset_windows;
BEGIN
  w := public.data_reset_window_current();
  SELECT * INTO p FROM public.data_reset_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'confirmed' THEN RAISE EXCEPTION 'plan_not_confirmed'; END IF;
  IF p.plan_hash IS DISTINCT FROM p_plan_hash THEN RAISE EXCEPTION 'plan_hash_mismatch'; END IF;
  IF p.confirmed_by = p_actor THEN RAISE EXCEPTION 'two_person_rule_violated'; END IF;
  UPDATE public.data_reset_plans SET status = 'approved', approved_by = p_actor, approved_at = now() WHERE id = p_plan_id;
  INSERT INTO public.data_reset_audit_events (actor_user_id, action, outcome, window_id, plan_id, detail)
  VALUES (p_actor, 'plan_approved', 'ok', p.window_id, p_plan_id, jsonb_build_object('planHash', p_plan_hash));
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'data_reset_assert_destructive_allowed()',
    'data_reset_window_current()',
    'data_reset_pk(regclass)',
    'data_reset_key_sql(regclass, text)',
    'data_reset_key_any(regclass, text, text)',
    'data_reset_key_eq(regclass, text, text)',
    'data_reset_owner_columns(regclass, jsonb)',
    'data_reset_account_categories()',
    'data_reset_audit_events_immutable()',
    'data_reset_audit_log(uuid, text, text, uuid, uuid, uuid, jsonb)',
    'data_reset_full_build_plan(uuid)',
    'data_reset_full_assert_active(uuid, text)',
    'data_reset_full_start_run(uuid, uuid)',
    'data_reset_full_execute_batch(uuid, integer)',
    'data_reset_full_auth_blockers(uuid, uuid)',
    'data_reset_full_storage_recheck(uuid)',
    'data_reset_full_storage_claim(uuid, integer)',
    'data_reset_full_storage_mark(uuid, text, text[], text)',
    'data_reset_full_auth_batch(uuid, integer)',
    'data_reset_full_verify(uuid)',
    'data_reset_full_finish_run(uuid, uuid, text)',
    'data_reset_run_request_abort(uuid, uuid)',
    'data_reset_window_request(uuid, text, text)',
    'data_reset_window_decide(uuid, uuid, boolean, integer)',
    'data_reset_window_close(uuid, uuid, text)',
    'data_reset_plan_create(uuid, uuid, text, jsonb)',
    'data_reset_plan_confirm(uuid, uuid, text, text)',
    'data_reset_plan_approve(uuid, uuid, text)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.data_reset_audit_events_immutable() FROM service_role;

COMMIT;
