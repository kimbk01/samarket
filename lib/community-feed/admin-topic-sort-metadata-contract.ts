/**
 * Admin Topics API — sort-slot metadata is not a product writer under Community Nav SSOT.
 *
 * CONTRACT:
 * - Create always persists content topics: is_feed_sort=false, feed_sort_mode=null.
 * - Patch rejects attempts to turn on sort metadata (is_feed_sort=true / feed_sort_mode popular|recommended).
 * - Patch may still clear sort metadata (false / null) for content rows.
 * - Sort-slot slugs (popular|recommend|recommended) cannot be created/renamed via this API.
 * - Reuses isPhilifeNeighborhoodSortSlotSlug — no new slug list / enum / DB.
 */

import { parseCommunityTopicFeedSortMode } from "@/lib/community-feed/feed-sort-mode";
import { isPhilifeNeighborhoodSortSlotSlug } from "@/lib/neighborhood/philife-topic-slug-rules";

export const ADMIN_TOPIC_SORT_METADATA_NOT_WRITABLE = "sort_metadata_not_writable" as const;
export const ADMIN_TOPIC_SORT_SLOT_SLUG_FORBIDDEN = "sort_slot_slug_not_writable" as const;

export function adminTopicCreateSortMetadata(): {
  is_feed_sort: false;
  feed_sort_mode: null;
} {
  return { is_feed_sort: false, feed_sort_mode: null };
}

export function assertAdminTopicSlugNotSortSlot(
  slug: string
): { ok: true } | { ok: false; error: typeof ADMIN_TOPIC_SORT_SLOT_SLUG_FORBIDDEN } {
  if (isPhilifeNeighborhoodSortSlotSlug(slug)) {
    return { ok: false, error: ADMIN_TOPIC_SORT_SLOT_SLUG_FORBIDDEN };
  }
  return { ok: true };
}

/**
 * Mutates `patch` only for allowed clear operations; rejects reactivation of sort metadata.
 */
export function applyAdminTopicPatchSortMetadata(
  body: { is_feed_sort?: unknown; feed_sort_mode?: unknown },
  patch: Record<string, unknown>
):
  | { ok: true }
  | { ok: false; error: typeof ADMIN_TOPIC_SORT_METADATA_NOT_WRITABLE } {
  const wantsOn =
    body.is_feed_sort === true ||
    parseCommunityTopicFeedSortMode(body.feed_sort_mode) != null;
  if (wantsOn) {
    return { ok: false, error: ADMIN_TOPIC_SORT_METADATA_NOT_WRITABLE };
  }

  if (body.is_feed_sort === false) {
    patch.is_feed_sort = false;
    patch.feed_sort_mode = null;
  }
  if (body.feed_sort_mode === null) {
    patch.feed_sort_mode = null;
    patch.is_feed_sort = false;
  }
  return { ok: true };
}
