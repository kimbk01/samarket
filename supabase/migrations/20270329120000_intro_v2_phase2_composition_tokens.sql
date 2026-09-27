-- Intro V2 Phase 2 composition tokens — additive JSONB keys only.
-- Does not rewrite Phase 1 tables, RLS, publications, or schema_version.
-- Does not ALTER TABLE. Scene transition extras stay in campaign.source.phase2.

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
  has_asset boolean;
  has_color boolean;
  decoration_kind text;
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
      'name', 'visible', 'fontToken', 'fontSizePct', 'fontWeight', 'lineHeight',
      'textAlign', 'wrap', 'maxLines',
      'color', 'fillColor', 'strokeColor', 'strokeWidthPct', 'cornerRadiusPct',
      'decorationKind'
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
     OR (p ? 'minWidthPct' AND ((p->>'minWidthPct')::numeric < 0 OR (p->>'minWidthPct')::numeric > 100))
     OR (p ? 'maxWidthPct' AND ((p->>'maxWidthPct')::numeric < 0 OR (p->>'maxWidthPct')::numeric > 100))
     OR (p ? 'opacity' AND ((p->>'opacity')::numeric < 0 OR (p->>'opacity')::numeric > 1))
     OR (p ? 'rotation' AND ((p->>'rotation')::numeric < -360 OR (p->>'rotation')::numeric > 360))
     OR (p ? 'fontSizePct' AND ((p->>'fontSizePct')::numeric < 0.5 OR (p->>'fontSizePct')::numeric > 20))
     OR (p ? 'fontWeight' AND ((p->>'fontWeight')::numeric < 100 OR (p->>'fontWeight')::numeric > 900))
     OR (p ? 'lineHeight' AND ((p->>'lineHeight')::numeric < 0.8 OR (p->>'lineHeight')::numeric > 3))
     OR (p ? 'maxLines' AND ((p->>'maxLines')::numeric < 1 OR (p->>'maxLines')::numeric > 20))
     OR (p ? 'strokeWidthPct' AND ((p->>'strokeWidthPct')::numeric < 0 OR (p->>'strokeWidthPct')::numeric > 20))
     OR (p ? 'cornerRadiusPct' AND ((p->>'cornerRadiusPct')::numeric < 0 OR (p->>'cornerRadiusPct')::numeric > 50)) THEN
    RETURN false;
  END IF;
  IF p ? 'textAlign' AND coalesce(p->>'textAlign', '') NOT IN ('left', 'center', 'right') THEN
    RETURN false;
  END IF;
  IF p ? 'fontToken' AND coalesce(p->>'fontToken', '') NOT IN ('title', 'body', 'caption') THEN
    RETURN false;
  END IF;
  IF p ? 'aspectPolicy' AND coalesce(p->>'aspectPolicy', '') NOT IN ('contain', 'cover', 'fill', 'none') THEN
    RETURN false;
  END IF;
  IF p ? 'decorationKind' AND coalesce(p->>'decorationKind', '') NOT IN ('shape', 'sticker', 'divider') THEN
    RETURN false;
  END IF;
  IF p ? 'visible' AND jsonb_typeof(p->'visible') <> 'boolean' THEN
    RETURN false;
  END IF;
  IF p ? 'wrap' AND jsonb_typeof(p->'wrap') <> 'boolean' THEN
    RETURN false;
  END IF;
  IF p ? 'safeArea' AND jsonb_typeof(p->'safeArea') <> 'boolean' THEN
    RETURN false;
  END IF;

  has_asset := coalesce(btrim(p->>'assetId'), '') <> '';
  has_color := coalesce(btrim(p->>'color'), '') <> '' OR coalesce(btrim(p->>'fillColor'), '') <> '';
  decoration_kind := coalesce(p->>'decorationKind', '');

  IF layer_type IN ('IMAGE', 'LOGO') AND NOT has_asset THEN
    RETURN false;
  END IF;
  IF layer_type = 'BACKGROUND' AND NOT has_asset AND NOT has_color THEN
    RETURN false;
  END IF;
  IF layer_type = 'DECORATION' AND decoration_kind = 'sticker' AND NOT has_asset THEN
    RETURN false;
  END IF;
  IF layer_type = 'TEXT' AND coalesce(btrim(p->>'text'), '') = '' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.intro_v2_layer_ok(jsonb) IS
  'Intro V2 layer JSON. Phase 2 additive composition keys. BACKGROUND may be color-or-asset. IMAGE/LOGO still require assetId.';
