SELECT jsonb_build_object(
  'tables', (
    SELECT jsonb_object_agg(c.relname, true)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'intro_%'
  ),
  'indexes', (
    SELECT jsonb_agg(jsonb_build_object('name', indexname, 'table', tablename) ORDER BY indexname)
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename LIKE 'intro_%'
  ),
  'constraints', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', t.relname,
      'name', con.conname,
      'type', con.contype
    ) ORDER BY t.relname, con.conname)
    FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname LIKE 'intro_%'
  ),
  'rls', (
    SELECT jsonb_object_agg(c.relname, jsonb_build_object('rls', c.relrowsecurity, 'force', c.relforcerowsecurity))
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'intro_%'
  ),
  'policies', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', tablename,
      'name', policyname,
      'cmd', cmd,
      'roles', roles
    ) ORDER BY tablename, policyname)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE 'intro_%'
  ),
  'rpcs', (
    SELECT jsonb_agg(jsonb_build_object(
      'identity', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      'security_definer', p.prosecdef
    ) ORDER BY p.proname)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_intro_published_manifest',
        'intro_v2_publish_campaign',
        'intro_v2_unpublish_campaign'
      )
  ),
  'grants', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', table_name,
      'grantee', grantee,
      'priv', privilege_type
    ) ORDER BY table_name, grantee, privilege_type)
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name LIKE 'intro_%'
      AND grantee IN ('anon', 'authenticated', 'service_role')
  ),
  'backfill', (
    SELECT jsonb_build_object(
      'campaigns', (SELECT count(*) FROM public.intro_campaigns WHERE source->>'v1_key' = 'startup_product_intro_v1'),
      'scenes', (
        SELECT count(*)
        FROM public.intro_scenes s
        JOIN public.intro_campaigns c ON c.id = s.campaign_id
        WHERE c.source->>'v1_key' = 'startup_product_intro_v1'
      ),
      'assets', (
        SELECT count(*) FROM public.intro_assets
        WHERE id = '2717968e-3492-4ead-b9c2-30a6b16f78b5'
      ),
      'live_publications', (SELECT count(*) FROM public.intro_publications WHERE is_live),
      'v1_campaign_status', (
        SELECT status FROM public.intro_campaigns
        WHERE source->>'v1_key' = 'startup_product_intro_v1'
        LIMIT 1
      ),
      'v1_requires_admin', (
        SELECT requires_admin_confirmation FROM public.intro_campaigns
        WHERE source->>'v1_key' = 'startup_product_intro_v1'
        LIMIT 1
      ),
      'v1_advance', (
        SELECT jsonb_build_object('mode', s.advance_mode, 'duration_ms', s.duration_ms, 'max_hold_ms', s.max_hold_ms)
        FROM public.intro_scenes s
        JOIN public.intro_campaigns c ON c.id = s.campaign_id
        WHERE c.source->>'v1_key' = 'startup_product_intro_v1'
        LIMIT 1
      ),
      'v1_admin_settings_untouched', (
        SELECT value_json #>> '{payload,displayDurationMs}'
        FROM public.admin_settings
        WHERE key = 'startup_product_intro_v1'
      )
    )
  ),
  'zero_intro', public.get_intro_published_manifest(now(), 'unknown', 'unknown', 'UNKNOWN', true)
);
