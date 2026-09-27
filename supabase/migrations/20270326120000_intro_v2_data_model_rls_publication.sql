-- INTRO V2 Phase 1 — data model, constraints, RLS, published manifest, V1 draft backfill.
-- Additive. Does NOT mutate admin_settings.startup_product_intro_v1.
-- V1 displayDurationMs=0 is NOT guessed into TIMER 2500.
-- Runtime authority = is_live publication snapshot only.

BEGIN;

CREATE OR REPLACE FUNCTION public.intro_v2_persistable_ref_ok(p text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v text;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN
    RETURN false;
  END IF;
  v := lower(btrim(p));
  IF v LIKE 'blob:%' OR v LIKE 'filesystem:%' THEN
    RETURN false;
  END IF;
  IF position('localhost' in v) > 0
     OR position('127.0.0.1' in v) > 0
     OR position('[::1]' in v) > 0 THEN
    RETURN false;
  END IF;
  IF v LIKE 'http://%' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.intro_v2_text_array_ok(p jsonb, allowed text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  item jsonb;
  seen text[] := ARRAY[]::text[];
  v text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p)
  LOOP
    IF jsonb_typeof(item) <> 'string' THEN
      RETURN false;
    END IF;
    v := item #>> '{}';
    IF NOT (v = ANY (allowed)) THEN
      RETURN false;
    END IF;
    IF v = ANY (seen) THEN
      CONTINUE;
    END IF;
    seen := array_append(seen, v);
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.intro_v2_targeting_ok(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  k text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN false;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p)
  LOOP
    IF k NOT IN ('audiences', 'platforms', 'deviceClasses') THEN
      RETURN false;
    END IF;
  END LOOP;
  IF NOT (p ? 'audiences' AND p ? 'platforms' AND p ? 'deviceClasses') THEN
    RETURN false;
  END IF;
  RETURN public.intro_v2_text_array_ok(
           p->'audiences',
           ARRAY['guest', 'authenticated', 'new', 'returning']
         )
     AND public.intro_v2_text_array_ok(
           p->'platforms',
           ARRAY['ios', 'android', 'web']
         )
     AND public.intro_v2_text_array_ok(
           p->'deviceClasses',
           ARRAY[
             'PHONE_ANDROID',
             'PHONE_IOS',
             'TABLET_ANDROID',
             'TABLET_IPAD',
             'DESKTOP_WINDOWS',
             'WEB_DESKTOP',
             'UNKNOWN'
           ]
         );
END;
$$;

CREATE OR REPLACE FUNCTION public.intro_v2_targeting_matches(
  p_targeting jsonb,
  p_audience text,
  p_platform text,
  p_device_class text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.intro_v2_targeting_ok(p_targeting) THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_targeting->'audiences') > 0
     AND NOT (p_targeting->'audiences' ? p_audience) THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_targeting->'platforms') > 0
     AND NOT (p_targeting->'platforms' ? p_platform) THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_targeting->'deviceClasses') > 0
     AND NOT (p_targeting->'deviceClasses' ? p_device_class) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.intro_v2_external_host_ok(p_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  host text;
BEGIN
  IF p_url IS NULL OR p_url !~* '^https://' THEN
    RETURN false;
  END IF;
  IF p_url ~* '^(javascript|data|file|vbscript):' THEN
    RETURN false;
  END IF;
  host := lower(split_part(split_part(regexp_replace(p_url, '^https://', '', 'i'), '/', 1), '?', 1));
  host := rtrim(split_part(host, ':', 1), '.');
  RETURN host IN ('samarket.vercel.app', 'dibay.app', 'www.dibay.app');
END;
$$;

CREATE OR REPLACE FUNCTION public.intro_v2_cta_ok(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  k text;
  dest jsonb;
  dest_type text;
BEGIN
  IF p IS NULL THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(p) <> 'object' THEN
    RETURN false;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p)
  LOOP
    IF k NOT IN ('enabled', 'destination') THEN
      RETURN false;
    END IF;
  END LOOP;
  IF jsonb_typeof(p->'enabled') <> 'boolean' THEN
    RETURN false;
  END IF;
  IF (p->>'enabled') = 'false' THEN
    RETURN true;
  END IF;
  dest := p->'destination';
  IF dest IS NULL OR jsonb_typeof(dest) <> 'object' THEN
    RETURN false;
  END IF;
  dest_type := dest->>'type';
  IF dest_type NOT IN (
    'COMMUNITY', 'TRADE', 'DELIVERY', 'MESSENGER', 'MY_PAGE',
    'STORE', 'PRODUCT', 'LISTING', 'POST', 'CHAT_ROOM', 'EVENT',
    'INTERNAL_PATH', 'EXTERNAL_URL'
  ) THEN
    RETURN false;
  END IF;
  IF dest_type = 'EXTERNAL_URL' THEN
    RETURN public.intro_v2_external_host_ok(dest->>'url');
  END IF;
  IF dest_type = 'INTERNAL_PATH' THEN
    RETURN (dest->>'path') ~ '^/[^/]'
       AND (dest->>'path') !~* '^/(admin|stores/owner)(/|$)';
  END IF;
  IF dest_type IN ('COMMUNITY', 'TRADE', 'DELIVERY', 'MESSENGER', 'MY_PAGE') THEN
    RETURN true;
  END IF;
  RETURN coalesce(btrim(dest->>'id'), '') <> '';
END;
$$;

CREATE OR REPLACE FUNCTION public.intro_v2_layer_ok(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  k text;
  layer_type text;
  z numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN false;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p)
  LOOP
    IF k NOT IN (
      'id', 'type', 'zIndex', 'anchor', 'xPct', 'yPct', 'widthPct',
      'minWidthPct', 'maxWidthPct', 'opacity', 'rotation', 'safeArea',
      'aspectPolicy', 'assetId', 'text', 'animation'
    ) THEN
      RETURN false;
    END IF;
  END LOOP;
  IF coalesce(btrim(p->>'id'), '') = '' THEN
    RETURN false;
  END IF;
  layer_type := p->>'type';
  IF layer_type NOT IN ('BACKGROUND', 'IMAGE', 'LOGO', 'TEXT', 'CTA', 'DECORATION') THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p->'zIndex') <> 'number' THEN
    RETURN false;
  END IF;
  z := (p->>'zIndex')::numeric;
  IF z < 0 OR z > 1000 THEN
    RETURN false;
  END IF;
  IF coalesce(p->>'anchor', '') NOT IN (
    'top_left', 'top_center', 'top_right',
    'center_left', 'center', 'center_right',
    'bottom_left', 'bottom_center', 'bottom_right'
  ) THEN
    RETURN false;
  END IF;
  IF (p ? 'xPct' AND ((p->>'xPct')::numeric < 0 OR (p->>'xPct')::numeric > 100))
     OR (p ? 'yPct' AND ((p->>'yPct')::numeric < 0 OR (p->>'yPct')::numeric > 100))
     OR (p ? 'widthPct' AND ((p->>'widthPct')::numeric < 0 OR (p->>'widthPct')::numeric > 100))
     OR (p ? 'opacity' AND ((p->>'opacity')::numeric < 0 OR (p->>'opacity')::numeric > 1)) THEN
    RETURN false;
  END IF;
  IF layer_type IN ('BACKGROUND', 'IMAGE', 'LOGO', 'DECORATION')
     AND coalesce(btrim(p->>'assetId'), '') = '' THEN
    RETURN false;
  END IF;
  IF layer_type = 'TEXT' AND coalesce(btrim(p->>'text'), '') = '' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.intro_v2_layers_ok(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  item jsonb;
  seen text[] := ARRAY[]::text[];
  id text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p)
  LOOP
    IF NOT public.intro_v2_layer_ok(item) THEN
      RETURN false;
    END IF;
    id := item->>'id';
    IF id = ANY (seen) THEN
      RETURN false;
    END IF;
    seen := array_append(seen, id);
  END LOOP;
  RETURN true;
END;
$$;

CREATE TABLE IF NOT EXISTS public.intro_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL
    CHECK (kind IN ('image', 'gif', 'video', 'poster')),
  storage_path text NOT NULL
    CHECK (public.intro_v2_persistable_ref_ok(storage_path)),
  public_url text NULL
    CHECK (public_url IS NULL OR public.intro_v2_persistable_ref_ok(public_url)),
  mime text NULL,
  bytes bigint NULL CHECK (bytes IS NULL OR bytes >= 0),
  sha256 text NULL CHECK (sha256 IS NULL OR sha256 ~* '^[0-9a-f]{64}$'),
  width integer NULL CHECK (width IS NULL OR width > 0),
  height integer NULL CHECK (height IS NULL OR height > 0),
  duration_ms integer NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
  loop boolean NOT NULL DEFAULT false,
  poster_asset_id uuid NULL REFERENCES public.intro_assets (id) ON DELETE SET NULL,
  decode_status text NOT NULL DEFAULT 'pending'
    CHECK (decode_status IN ('pending', 'ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.intro_assets IS
  'Intro V2 media catalog metadata only. No upload pipeline in Phase 1. Persistable refs only.';

CREATE TABLE IF NOT EXISTS public.intro_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'expired', 'archived')),
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  priority integer NOT NULL DEFAULT 0,
  targeting jsonb NOT NULL DEFAULT '{"audiences":[],"platforms":[],"deviceClasses":[]}'::jsonb
    CHECK (public.intro_v2_targeting_ok(targeting)),
  frequency_mode text NOT NULL DEFAULT 'every_launch'
    CHECK (frequency_mode IN ('every_launch', 'once_ever', 'once_per_day', 'once_per_session')),
  deep_link_policy text NOT NULL DEFAULT 'honor'
    CHECK (deep_link_policy IN ('honor', 'ignore', 'defer')),
  draft_revision integer NOT NULL DEFAULT 1 CHECK (draft_revision >= 1),
  published_publication_id uuid NULL,
  requires_admin_confirmation boolean NOT NULL DEFAULT false,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT intro_campaigns_schedule_check CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at
  ),
  CONSTRAINT intro_campaigns_no_playback_policy CHECK (true)
);

COMMENT ON TABLE public.intro_campaigns IS
  'Intro V2 campaign draft authority. Runtime never composes from these rows. Status lowercase.';

CREATE UNIQUE INDEX IF NOT EXISTS intro_campaigns_v1_source_uidx
  ON public.intro_campaigns ((source->>'v1_key'))
  WHERE source ? 'v1_key';

CREATE INDEX IF NOT EXISTS intro_campaigns_status_priority_idx
  ON public.intro_campaigns (status, priority DESC, starts_at ASC NULLS FIRST, id);

CREATE TABLE IF NOT EXISTS public.intro_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.intro_campaigns (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  name text NOT NULL DEFAULT '',
  advance_mode text NOT NULL
    CHECK (advance_mode IN ('timer', 'media_end', 'cta_only', 'manual')),
  duration_ms integer NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
  max_hold_ms integer NULL CHECK (max_hold_ms IS NULL OR max_hold_ms >= 0),
  transition text NOT NULL DEFAULT 'none'
    CHECK (transition IN ('none', 'fade', 'fade_in_expand', 'expand_fade_out')),
  skip_policy text NOT NULL DEFAULT 'deny'
    CHECK (skip_policy IN ('allow', 'deny')),
  interaction_mode text NOT NULL DEFAULT 'none'
    CHECK (interaction_mode IN ('none', 'tap_advance', 'tap_cta', 'tap_layer')),
  interaction_layer_id text NULL,
  layers jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (public.intro_v2_layers_ok(layers)),
  cta jsonb NULL
    CHECK (public.intro_v2_cta_ok(cta)),
  background_color text NOT NULL DEFAULT '#ffffff'
    CHECK (background_color ~* '^#([0-9A-F]{6}|[0-9A-F]{8})$'),
  background_asset_id uuid NULL REFERENCES public.intro_assets (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, sort_order)
);

COMMENT ON TABLE public.intro_scenes IS
  'Intro V2 draft scenes. Advance 0 is never inferred. Incomplete advance allowed only on unconfirmed draft.';

CREATE INDEX IF NOT EXISTS intro_scenes_campaign_idx
  ON public.intro_scenes (campaign_id, sort_order);

CREATE TABLE IF NOT EXISTS public.intro_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.intro_campaigns (id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision >= 1),
  manifest jsonb NOT NULL,
  asset_checksums jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  is_live boolean NOT NULL DEFAULT false,
  UNIQUE (campaign_id, revision)
);

COMMENT ON TABLE public.intro_publications IS
  'Immutable published Intro V2 snapshots. Draft edits must not mutate these rows.';

CREATE UNIQUE INDEX IF NOT EXISTS intro_publications_one_live_per_campaign_uidx
  ON public.intro_publications (campaign_id)
  WHERE is_live;

CREATE INDEX IF NOT EXISTS intro_publications_live_idx
  ON public.intro_publications (is_live, campaign_id)
  WHERE is_live;

CREATE TABLE IF NOT EXISTS public.intro_device_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.intro_campaigns (id) ON DELETE CASCADE,
  scene_id uuid NULL REFERENCES public.intro_scenes (id) ON DELETE CASCADE,
  device_family text NOT NULL
    CHECK (device_family IN ('PHONE', 'TABLET', 'DESKTOP')),
  layers jsonb NULL
    CHECK (layers IS NULL OR public.intro_v2_layers_ok(layers)),
  background_asset_id uuid NULL REFERENCES public.intro_assets (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, device_family, scene_id)
);

COMMENT ON TABLE public.intro_device_overrides IS
  'Optional DeviceClass-family overrides. PHONE/TABLET/DESKTOP only. Not 600dp/UA/width.';

ALTER TABLE public.intro_campaigns
  DROP CONSTRAINT IF EXISTS intro_campaigns_published_publication_fk;
ALTER TABLE public.intro_campaigns
  ADD CONSTRAINT intro_campaigns_published_publication_fk
  FOREIGN KEY (published_publication_id)
  REFERENCES public.intro_publications (id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.intro_v2_scene_advance_ok()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  unconfirmed boolean;
BEGIN
  SELECT (c.status = 'draft' AND c.requires_admin_confirmation)
    INTO unconfirmed
  FROM public.intro_campaigns c
  WHERE c.id = NEW.campaign_id;

  IF NEW.advance_mode = 'timer' THEN
    IF NEW.duration_ms IS NULL OR NEW.duration_ms < 1 THEN
      IF unconfirmed AND NEW.duration_ms IS NULL THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'timer_duration_required' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.max_hold_ms IS NULL OR NEW.max_hold_ms < 1 THEN
      IF unconfirmed AND NEW.max_hold_ms IS NULL THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'max_hold_ms_required' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.interaction_mode = 'tap_layer'
     AND coalesce(btrim(NEW.interaction_layer_id), '') = '' THEN
    RAISE EXCEPTION 'interaction_layer_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.interaction_layer_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(NEW.layers) el
       WHERE el->>'id' = NEW.interaction_layer_id
     ) THEN
    RAISE EXCEPTION 'interaction_layer_missing' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS intro_scenes_advance_trg ON public.intro_scenes;
CREATE TRIGGER intro_scenes_advance_trg
  BEFORE INSERT OR UPDATE ON public.intro_scenes
  FOR EACH ROW
  EXECUTE FUNCTION public.intro_v2_scene_advance_ok();

CREATE OR REPLACE FUNCTION public.intro_v2_publication_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_live THEN
      RAISE EXCEPTION 'live_publication_delete_forbidden' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.manifest IS DISTINCT FROM OLD.manifest
     OR NEW.asset_checksums IS DISTINCT FROM OLD.asset_checksums
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR NEW.published_by IS DISTINCT FROM OLD.published_by THEN
    RAISE EXCEPTION 'publication_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS intro_publications_immutable_trg ON public.intro_publications;
CREATE TRIGGER intro_publications_immutable_trg
  BEFORE UPDATE OR DELETE ON public.intro_publications
  FOR EACH ROW
  EXECUTE FUNCTION public.intro_v2_publication_immutable();

CREATE OR REPLACE FUNCTION public.intro_v2_pause_unpublishes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IN ('paused', 'expired', 'archived') THEN
    UPDATE public.intro_publications
    SET is_live = false
    WHERE campaign_id = NEW.id
      AND is_live;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS intro_campaigns_pause_unpublish_trg ON public.intro_campaigns;
CREATE TRIGGER intro_campaigns_pause_unpublish_trg
  AFTER UPDATE OF status ON public.intro_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.intro_v2_pause_unpublishes();

DROP TRIGGER IF EXISTS intro_assets_set_updated_at ON public.intro_assets;
CREATE TRIGGER intro_assets_set_updated_at
  BEFORE UPDATE ON public.intro_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS intro_campaigns_set_updated_at ON public.intro_campaigns;
CREATE TRIGGER intro_campaigns_set_updated_at
  BEFORE UPDATE ON public.intro_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS intro_scenes_set_updated_at ON public.intro_scenes;
CREATE TRIGGER intro_scenes_set_updated_at
  BEFORE UPDATE ON public.intro_scenes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS intro_overrides_set_updated_at ON public.intro_device_overrides;
CREATE TRIGGER intro_overrides_set_updated_at
  BEFORE UPDATE ON public.intro_device_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.intro_v2_device_family(p_device_class text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_device_class IN ('PHONE_ANDROID', 'PHONE_IOS') THEN 'PHONE'
    WHEN p_device_class IN ('TABLET_ANDROID', 'TABLET_IPAD') THEN 'TABLET'
    WHEN p_device_class IN ('DESKTOP_WINDOWS', 'WEB_DESKTOP') THEN 'DESKTOP'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.intro_v2_build_manifest(p_campaign_id uuid, p_publication_id uuid, p_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  c public.intro_campaigns%ROWTYPE;
  scene_json jsonb;
  asset_json jsonb;
  override_json jsonb;
BEGIN
  SELECT * INTO c FROM public.intro_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign_not_found';
  END IF;
  IF c.requires_admin_confirmation THEN
    RAISE EXCEPTION 'requires_admin_confirmation' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'name', s.name,
           'sortOrder', s.sort_order,
           'advanceMode', s.advance_mode,
           'durationMs', s.duration_ms,
           'maxHoldMs', s.max_hold_ms,
           'transition', s.transition,
           'skipPolicy', s.skip_policy,
           'interactionMode', s.interaction_mode,
           'interactionLayerId', s.interaction_layer_id,
           'layers', s.layers,
           'cta', s.cta,
           'backgroundColor', s.background_color,
           'backgroundAssetId', s.background_asset_id
         ) ORDER BY s.sort_order ASC, s.id ASC), '[]'::jsonb)
    INTO scene_json
  FROM public.intro_scenes s
  WHERE s.campaign_id = p_campaign_id;

  IF scene_json = '[]'::jsonb THEN
    RAISE EXCEPTION 'scenes_required' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'kind', a.kind,
           'storagePath', a.storage_path,
           'publicUrl', a.public_url,
           'mime', a.mime,
           'bytes', a.bytes,
           'sha256', a.sha256,
           'width', a.width,
           'height', a.height,
           'durationMs', a.duration_ms,
           'loop', a.loop,
           'decodeStatus', a.decode_status
         )), '[]'::jsonb)
    INTO asset_json
  FROM public.intro_assets a
  WHERE a.id IN (
    SELECT s.background_asset_id FROM public.intro_scenes s
    WHERE s.campaign_id = p_campaign_id AND s.background_asset_id IS NOT NULL
    UNION
    SELECT NULLIF(el->>'assetId', '')::uuid
    FROM public.intro_scenes s,
         jsonb_array_elements(s.layers) el
    WHERE s.campaign_id = p_campaign_id
      AND NULLIF(el->>'assetId', '') IS NOT NULL
    UNION
    SELECT o.background_asset_id FROM public.intro_device_overrides o
    WHERE o.campaign_id = p_campaign_id AND o.background_asset_id IS NOT NULL
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'deviceFamily', o.device_family,
           'sceneId', o.scene_id,
           'layers', o.layers,
           'backgroundAssetId', o.background_asset_id
         ) ORDER BY o.device_family, o.scene_id), '[]'::jsonb)
    INTO override_json
  FROM public.intro_device_overrides o
  WHERE o.campaign_id = p_campaign_id;

  RETURN jsonb_build_object(
    'schemaVersion', 2,
    'publicationId', p_publication_id,
    'revision', p_revision,
    'campaign', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'priority', c.priority,
      'timezone', c.timezone,
      'startsAt', c.starts_at,
      'endsAt', c.ends_at
    ),
    'schedule', jsonb_build_object(
      'startsAt', c.starts_at,
      'endsAt', c.ends_at,
      'timezone', c.timezone
    ),
    'targeting', c.targeting,
    'frequencyMode', c.frequency_mode,
    'frequency', jsonb_build_object('mode', c.frequency_mode),
    'deepLinkPolicy', c.deep_link_policy,
    'scenes', scene_json,
    'assets', asset_json,
    'deviceOverrides', override_json
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.intro_v2_publish_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  next_rev integer;
  pub_id uuid := gen_random_uuid();
  manifest jsonb;
BEGIN
  IF uid IS NULL OR NOT public.is_platform_admin(uid) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.intro_scenes s WHERE s.campaign_id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scenes_required' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.intro_scenes s
    JOIN public.intro_campaigns c ON c.id = s.campaign_id
    WHERE s.campaign_id = p_campaign_id
      AND (
        c.requires_admin_confirmation
        OR (s.advance_mode = 'timer' AND coalesce(s.duration_ms, 0) < 1)
        OR (s.advance_mode <> 'timer' AND coalesce(s.max_hold_ms, 0) < 1)
      )
  ) THEN
    RAISE EXCEPTION 'publish_validation_failed' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(max(revision), 0) + 1
    INTO next_rev
  FROM public.intro_publications
  WHERE campaign_id = p_campaign_id;

  manifest := public.intro_v2_build_manifest(p_campaign_id, pub_id, next_rev);

  UPDATE public.intro_publications
  SET is_live = false
  WHERE campaign_id = p_campaign_id
    AND is_live;

  INSERT INTO public.intro_publications (
    id, campaign_id, revision, manifest, asset_checksums, published_by, is_live
  ) VALUES (
    pub_id,
    p_campaign_id,
    next_rev,
    manifest,
    coalesce(manifest->'assets', '[]'::jsonb),
    uid,
    true
  );

  UPDATE public.intro_campaigns
  SET published_publication_id = pub_id,
      draft_revision = draft_revision + 1,
      updated_by = uid
  WHERE id = p_campaign_id;

  RETURN manifest;
END;
$$;

CREATE OR REPLACE FUNCTION public.intro_v2_unpublish_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_platform_admin(uid) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.intro_publications
  SET is_live = false
  WHERE campaign_id = p_campaign_id
    AND is_live;
  RETURN jsonb_build_object('ok', true, 'campaignId', p_campaign_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_intro_published_manifest(
  p_now timestamptz DEFAULT now(),
  p_audience text DEFAULT 'unknown',
  p_platform text DEFAULT 'unknown',
  p_device_class text DEFAULT 'UNKNOWN',
  p_frequency_eligible boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  winner jsonb;
  family text;
BEGIN
  IF NOT coalesce(p_frequency_eligible, false) THEN
    RETURN jsonb_build_object('schemaVersion', 2, 'campaign', NULL);
  END IF;

  family := public.intro_v2_device_family(p_device_class);

  SELECT p.manifest
    INTO winner
  FROM public.intro_publications p
  WHERE p.is_live
    AND coalesce((p.manifest->'campaign'->>'priority')::integer, 0) IS NOT NULL
    AND (
      p.manifest #>> '{campaign,startsAt}' IS NULL
      OR (p.manifest #>> '{campaign,startsAt}')::timestamptz <= p_now
    )
    AND (
      p.manifest #>> '{campaign,endsAt}' IS NULL
      OR (p.manifest #>> '{campaign,endsAt}')::timestamptz >= p_now
    )
    AND public.intro_v2_targeting_matches(
      p.manifest->'targeting',
      coalesce(p_audience, 'unknown'),
      coalesce(p_platform, 'unknown'),
      coalesce(p_device_class, 'UNKNOWN')
    )
  ORDER BY
    coalesce((p.manifest->'campaign'->>'priority')::integer, 0) DESC,
    coalesce((p.manifest #>> '{campaign,startsAt}')::timestamptz, '-infinity'::timestamptz) ASC,
    (p.manifest->'campaign'->>'id') ASC
  LIMIT 1;

  IF winner IS NULL THEN
    RETURN jsonb_build_object('schemaVersion', 2, 'campaign', NULL);
  END IF;

  IF winner ? 'draft' OR winner ? 'draftRevision' OR winner ? 'updatedBy'
     OR winner ? 'requiresAdminConfirmation' THEN
    RAISE EXCEPTION 'draft_field_leak';
  END IF;

  IF family IS NOT NULL THEN
    winner := jsonb_set(
      winner,
      '{deviceOverrides}',
      coalesce((
        SELECT jsonb_agg(el)
        FROM jsonb_array_elements(coalesce(winner->'deviceOverrides', '[]'::jsonb)) el
        WHERE el->>'deviceFamily' = family
      ), '[]'::jsonb),
      true
    );
  ELSE
    winner := jsonb_set(winner, '{deviceOverrides}', '[]'::jsonb, true);
  END IF;

  RETURN winner;
END;
$$;

REVOKE ALL ON FUNCTION public.intro_v2_publish_campaign(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intro_v2_unpublish_campaign(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_intro_published_manifest(timestamptz, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intro_v2_publish_campaign(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.intro_v2_unpublish_campaign(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_intro_published_manifest(timestamptz, text, text, text, boolean)
  TO anon, authenticated, service_role;

ALTER TABLE public.intro_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.intro_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.intro_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_scenes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.intro_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.intro_device_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_device_overrides FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.intro_assets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.intro_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.intro_scenes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.intro_publications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.intro_device_overrides FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.intro_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.intro_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.intro_scenes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.intro_publications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.intro_device_overrides TO authenticated;

GRANT ALL ON TABLE public.intro_assets TO service_role;
GRANT ALL ON TABLE public.intro_campaigns TO service_role;
GRANT ALL ON TABLE public.intro_scenes TO service_role;
GRANT ALL ON TABLE public.intro_publications TO service_role;
GRANT ALL ON TABLE public.intro_device_overrides TO service_role;

DROP POLICY IF EXISTS intro_assets_admin_all ON public.intro_assets;
CREATE POLICY intro_assets_admin_all ON public.intro_assets
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS intro_campaigns_admin_all ON public.intro_campaigns;
CREATE POLICY intro_campaigns_admin_all ON public.intro_campaigns
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS intro_scenes_admin_all ON public.intro_scenes;
CREATE POLICY intro_scenes_admin_all ON public.intro_scenes
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS intro_publications_admin_all ON public.intro_publications;
CREATE POLICY intro_publications_admin_all ON public.intro_publications
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS intro_device_overrides_admin_all ON public.intro_device_overrides;
CREATE POLICY intro_device_overrides_admin_all ON public.intro_device_overrides
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- V1 → V2 backfill: DRAFT + requires_admin_confirmation. No live publication.
-- displayDurationMs=0 is destination-gated hold in V1 runtime (FD-P0-04). Do not invent TIMER.
INSERT INTO public.intro_assets (
  id, kind, storage_path, public_url, mime, decode_status
)
SELECT
  '2717968e-3492-4ead-b9c2-30a6b16f78b5'::uuid,
  'image',
  '_admin/startup/product/mobile/2717968e-3492-4ead-b9c2-30a6b16f78b5.webp',
  'https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/admin-notification-campaign-images/_admin/startup/product/mobile/2717968e-3492-4ead-b9c2-30a6b16f78b5.webp',
  'image/webp',
  'ready'
WHERE EXISTS (
  SELECT 1 FROM public.admin_settings
  WHERE key = 'startup_product_intro_v1'
)
  AND NOT EXISTS (
    SELECT 1 FROM public.intro_assets
    WHERE id = '2717968e-3492-4ead-b9c2-30a6b16f78b5'::uuid
  );

INSERT INTO public.intro_campaigns (
  name, status, timezone, priority, targeting, frequency_mode, deep_link_policy,
  requires_admin_confirmation, source
)
SELECT
  coalesce(s.value_json #>> '{payload,name}', 'startup_product_intro_v1'),
  'draft',
  'Asia/Manila',
  0,
  '{"audiences":[],"platforms":[],"deviceClasses":[]}'::jsonb,
  'every_launch',
  'honor',
  true,
  jsonb_build_object(
    'v1_key', 'startup_product_intro_v1',
    'v1_version', s.value_json #>> '{payload,version}',
    'v1_display_duration_ms', s.value_json #>> '{payload,displayDurationMs}',
    'advance_unconfirmed', true,
    'reason', 'v1_displayDurationMs_0_not_guessed_as_timer'
  )
FROM public.admin_settings s
WHERE s.key = 'startup_product_intro_v1'
  AND NOT EXISTS (
    SELECT 1 FROM public.intro_campaigns c
    WHERE c.source->>'v1_key' = 'startup_product_intro_v1'
  );

INSERT INTO public.intro_scenes (
  campaign_id, sort_order, name, advance_mode, duration_ms, max_hold_ms,
  transition, skip_policy, interaction_mode, layers, cta,
  background_color, background_asset_id
)
SELECT
  c.id,
  0,
  'v1_scene',
  'manual',
  NULL,
  NULL,
  CASE
    WHEN s.value_json #>> '{payload,animationIn}' = 'fade_in_expand' THEN 'fade_in_expand'
    ELSE 'fade'
  END,
  'deny',
  'none',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'v1-image',
      'type', 'IMAGE',
      'zIndex', 1,
      'anchor', 'center',
      'widthPct', 100,
      'aspectPolicy', 'contain',
      'assetId', '2717968e-3492-4ead-b9c2-30a6b16f78b5'
    )
  ),
  jsonb_build_object('enabled', false, 'destination', jsonb_build_object('type', 'COMMUNITY')),
  coalesce(s.value_json #>> '{payload,backgroundColor}', '#ffffff'),
  '2717968e-3492-4ead-b9c2-30a6b16f78b5'::uuid
FROM public.intro_campaigns c
JOIN public.admin_settings s ON s.key = 'startup_product_intro_v1'
WHERE c.source->>'v1_key' = 'startup_product_intro_v1'
  AND NOT EXISTS (
    SELECT 1 FROM public.intro_scenes sc WHERE sc.campaign_id = c.id
  );

COMMIT;
