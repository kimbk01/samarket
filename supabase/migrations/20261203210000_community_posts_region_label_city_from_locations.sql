-- CUT 1: Community public region_label → City-only from structured locations.city
-- Evidence: historical writer stored TITLE via resolveUserAddressTitle into region_label.
-- Safe backfill only when location_id → locations.city exists (no comma-split of TITLE).
-- Rows without location_id remain fail-closed at read time (formatCommunityPublicRegionLabel).

UPDATE public.community_posts AS cp
SET region_label = left(btrim(l.city), 80),
    updated_at = now()
FROM public.locations AS l
WHERE cp.location_id = l.id
  AND l.city IS NOT NULL
  AND btrim(l.city) <> ''
  AND (
    cp.region_label IS DISTINCT FROM left(btrim(l.city), 80)
  );
