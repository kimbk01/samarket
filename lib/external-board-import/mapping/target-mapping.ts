import type { ExternalBoardSourceRow } from "@/lib/external-board-import/types";

export type TargetMapping = {
  topicId: string;
  topicSlug: string;
  locationId: string | null;
  regionLabel: string | null;
};

/**
 * SOURCE board identity ≠ DIBAY target.
 * Missing dibay_topic_id is a publish blocker — no free-text slug authority, no fallback topic.
 */
export function resolveTargetMapping(source: ExternalBoardSourceRow): {
  ok: true;
  mapping: TargetMapping;
} | {
  ok: false;
  failureCode: string;
  failureMessage: string;
} {
  const topicId = source.target_topic_id?.trim() || null;
  if (!topicId) {
    return {
      ok: false,
      failureCode: "dibay_topic_required",
      failureMessage: "게시할 DIBAY 주제를 선택하세요.",
    };
  }
  // slug is display/lookup aid only — may be filled after assertWriteEligibleTopicId
  const topicSlug = source.target_topic_slug?.trim() || "";
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
