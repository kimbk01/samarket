/**
 * Popup / Ads creative storage lifecycle (policy notes — no new storage engine).
 *
 * SOURCE: POPUP_CREATIVE_SOURCE_MAX_BYTES (8MB) before sharp optimize.
 * CANONICAL: DIBAY_CANONICAL_POPUP_CREATIVE_SIZE WebP in platform-popup-creatives.
 * REPLACE: replacePlatformPopupReadyCreative — prior object removed only when
 *   unreferenced; referenced assets must not hard-delete.
 * LISTS: use thumbnails / optimized public URL — never dump full source originals.
 * RETENTION: unbounded original retention is forbidden; optimize-on-upload is required.
 */

export const ADS_CREATIVE_STORAGE_POLICY = {
  popupBucket: "platform-popup-creatives",
  sourceMaxBytes: 8 * 1024 * 1024,
  listUsesOptimizedOnly: true,
  hardDeleteReferencedForbidden: true,
} as const;
