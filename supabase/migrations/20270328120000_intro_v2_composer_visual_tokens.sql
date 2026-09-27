-- Intro V2 Composer visual tokens — additive JSONB keys only.
-- Does not rewrite Phase 1 tables, RLS, publications, or schema_version.
-- Old snapshots without these keys remain valid.

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
    IF k NOT IN (
      'enabled', 'destination',
      'label', 'xPct', 'yPct', 'widthPct', 'heightPct',
      'fontSizePct', 'fontWeight', 'cornerRadiusPct', 'opacity', 'align'
    ) THEN
      RETURN false;
    END IF;
  END LOOP;
  IF jsonb_typeof(p->'enabled') <> 'boolean' THEN
    RETURN false;
  END IF;
  IF (p ? 'xPct' AND ((p->>'xPct')::numeric < 0 OR (p->>'xPct')::numeric > 100))
     OR (p ? 'yPct' AND ((p->>'yPct')::numeric < 0 OR (p->>'yPct')::numeric > 100))
     OR (p ? 'widthPct' AND ((p->>'widthPct')::numeric < 0 OR (p->>'widthPct')::numeric > 100))
     OR (p ? 'heightPct' AND ((p->>'heightPct')::numeric < 0 OR (p->>'heightPct')::numeric > 100))
     OR (p ? 'fontSizePct' AND ((p->>'fontSizePct')::numeric < 0.5 OR (p->>'fontSizePct')::numeric > 20))
     OR (p ? 'fontWeight' AND ((p->>'fontWeight')::numeric < 100 OR (p->>'fontWeight')::numeric > 900))
     OR (p ? 'cornerRadiusPct' AND ((p->>'cornerRadiusPct')::numeric < 0 OR (p->>'cornerRadiusPct')::numeric > 50))
     OR (p ? 'opacity' AND ((p->>'opacity')::numeric < 0 OR (p->>'opacity')::numeric > 1)) THEN
    RETURN false;
  END IF;
  IF p ? 'align' AND coalesce(p->>'align', '') NOT IN ('left', 'center', 'right') THEN
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
      'id', 'type', 'zIndex', 'anchor', 'xPct', 'yPct', 'widthPct', 'heightPct',
      'minWidthPct', 'maxWidthPct', 'opacity', 'rotation', 'safeArea',
      'aspectPolicy', 'assetId', 'text', 'animation',
      'name', 'fontSizePct', 'fontWeight', 'lineHeight', 'textAlign', 'maxWidthPct'
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
     OR (p ? 'heightPct' AND ((p->>'heightPct')::numeric < 0 OR (p->>'heightPct')::numeric > 100))
     OR (p ? 'opacity' AND ((p->>'opacity')::numeric < 0 OR (p->>'opacity')::numeric > 1))
     OR (p ? 'fontSizePct' AND ((p->>'fontSizePct')::numeric < 0.5 OR (p->>'fontSizePct')::numeric > 20))
     OR (p ? 'fontWeight' AND ((p->>'fontWeight')::numeric < 100 OR (p->>'fontWeight')::numeric > 900))
     OR (p ? 'lineHeight' AND ((p->>'lineHeight')::numeric < 0.8 OR (p->>'lineHeight')::numeric > 3))
     OR (p ? 'maxWidthPct' AND ((p->>'maxWidthPct')::numeric < 0 OR (p->>'maxWidthPct')::numeric > 100)) THEN
    RETURN false;
  END IF;
  IF p ? 'textAlign' AND coalesce(p->>'textAlign', '') NOT IN ('left', 'center', 'right') THEN
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

COMMENT ON FUNCTION public.intro_v2_layer_ok(jsonb) IS
  'Intro V2 layer JSON. Additive Composer fields: name, heightPct, fontSizePct, fontWeight, lineHeight, textAlign, maxWidthPct.';

COMMENT ON FUNCTION public.intro_v2_cta_ok(jsonb) IS
  'Intro V2 CTA JSON. Additive Composer visual tokens. Destination ID remains authority.';
