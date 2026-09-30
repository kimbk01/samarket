-- DIBAY INTRO / SYSTEM START — REBUILD 15 ABSOLUTE ZERO
-- Destructive. Owner-authorized. No salvage / no R15 import.
-- Historical migrations may recreate objects on clean DB; this migration must leave final state ZERO.

BEGIN;

-- Storage objects first
DELETE FROM storage.objects WHERE bucket_id IN ('dibay-intro', 'intro-show', 'opening-show-media');

-- Drop exclusive tables (CASCADE drops triggers/policies/FKs owned by them)
DROP TABLE IF EXISTS public.app_intro_live CASCADE;
DROP TABLE IF EXISTS public.app_intro_packs CASCADE;
DROP TABLE IF EXISTS public.app_intro_sealed_assets CASCADE;
DROP TABLE IF EXISTS public.app_intro_revisions CASCADE;
DROP TABLE IF EXISTS public.app_intro_publish_operations CASCADE;
DROP TABLE IF EXISTS public.app_intro_runtime_artifacts CASCADE;
DROP TABLE IF EXISTS public.app_intro_source_generations CASCADE;
DROP TABLE IF EXISTS public.app_intro_media CASCADE;
DROP TABLE IF EXISTS public.app_intro_documents CASCADE;
DROP TABLE IF EXISTS public.app_system_start_live CASCADE;
DROP TABLE IF EXISTS public.app_system_start_config CASCADE;

DROP TABLE IF EXISTS public.dibay_intro_live CASCADE;
DROP TABLE IF EXISTS public.dibay_intro_media CASCADE;
DROP TABLE IF EXISTS public.dibay_intro_revisions CASCADE;
DROP TABLE IF EXISTS public.dibay_intro_documents CASCADE;
DROP TABLE IF EXISTS public.dibay_intros CASCADE;

DROP TABLE IF EXISTS public.intro_publications CASCADE;
DROP TABLE IF EXISTS public.intro_scenes CASCADE;
DROP TABLE IF EXISTS public.intro_device_overrides CASCADE;
DROP TABLE IF EXISTS public.intro_campaigns CASCADE;
DROP TABLE IF EXISTS public.intro_assets CASCADE;

DROP TABLE IF EXISTS public.intro_v3_media_derivatives CASCADE;
DROP TABLE IF EXISTS public.intro_v3_media_sources CASCADE;

DROP TABLE IF EXISTS public.intro_show_live CASCADE;
DROP TABLE IF EXISTS public.intro_show_media_assets CASCADE;
DROP TABLE IF EXISTS public.intro_show_media CASCADE;
DROP TABLE IF EXISTS public.intro_show_revisions CASCADE;
DROP TABLE IF EXISTS public.intro_show_drafts CASCADE;
DROP TABLE IF EXISTS public.intro_show_campaigns CASCADE;

DROP TABLE IF EXISTS public.opening_media_derivatives CASCADE;
DROP TABLE IF EXISTS public.opening_media CASCADE;
DROP TABLE IF EXISTS public.opening_revisions CASCADE;
DROP TABLE IF EXISTS public.opening_drafts CASCADE;
DROP TABLE IF EXISTS public.opening_shows CASCADE;

-- Drop remaining intro/system_start/opening functions by name
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname ~* '(^intro_|_intro_|intro$|system_start|opening_)'
        OR p.proname IN (
          'get_intro_published_manifest',
          'intro_show_set_live',
          'set_opening_live'
        )
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Drop storage policies on intro/opening buckets (if any remain on objects)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        policyname ~* '(intro|opening|system.start|system_start|dibay.intro)'
        OR COALESCE(qual, '') ~* 'dibay-intro|intro-show|opening-show-media'
        OR COALESCE(with_check, '') ~* 'dibay-intro|intro-show|opening-show-media'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

DELETE FROM storage.buckets WHERE id IN ('dibay-intro', 'intro-show', 'opening-show-media');

-- Strip Intro-shaped admin_settings keys / presentation payloads.
-- KEEP: startup_config_v1 as boot authority (initialSurface only).
-- Shared admin_settings infrastructure is NOT dropped.
DO $$
BEGIN
  IF to_regclass('public.admin_settings') IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.admin_settings
  WHERE key IN (
    'cold_boot_intro_v1',
    'product_intro_v1',
    'system_start_v1',
    'opening_show_v1',
    'intro_show_v1',
    'dibay_intro_live',
    'app_intro_live'
  );

  UPDATE public.admin_settings
  SET
    value_json = jsonb_build_object(
      'payload', jsonb_build_object(
        'version', COALESCE(
          NULLIF(value_json->'payload'->>'version', '')::int,
          NULLIF(value_json->>'version', '')::int,
          2
        ),
        'initialSurface', COALESCE(
          NULLIF(value_json->'payload'->>'initialSurface', ''),
          NULLIF(value_json->>'initialSurface', ''),
          'community'
        ),
        'updatedAt', COALESCE(
          NULLIF(value_json->'payload'->>'updatedAt', ''),
          NULLIF(value_json->>'updatedAt', ''),
          to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      ),
      'updated_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    updated_at = timezone('utc', now())
  WHERE key = 'startup_config_v1';
END $$;

COMMIT;
