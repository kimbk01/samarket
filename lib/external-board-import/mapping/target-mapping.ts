import type { ExternalBoardSourceRow } from "@/lib/external-board-import/types";

export type TargetMapping = {
  topicId: string | null;
  topicSlug: string | null;
  locationId: string | null;
  regionLabel: string | null;
};

/**
 * SOURCE board identity ≠ DIBAY target category/location.
 * Missing mapping is a publish blocker (failure_stage=mapping).
 */
export function resolveTargetMapping(source: ExternalBoardSourceRow): {
  ok: true;
  mapping: TargetMapping;
} | {
  ok: false;
  failureCode: string;
  failureMessage: string;
} {
  const topicSlug = source.target_topic_slug?.trim() || null;
  const topicId = source.target_topic_id?.trim() || null;
  if (!topicSlug && !topicId) {
    return {
      ok: false,
      failureCode: "target_topic_required",
      failureMessage: "DIBAY target topic mapping is required before publish.",
    };
  }
  return {
    ok: true,
    mapping: {
      topicId,
      topicSlug,
      locationId: source.target_location_id?.trim() || null,
      regionLabel: source.target_region_label?.trim() || null,
    },
  };
}
