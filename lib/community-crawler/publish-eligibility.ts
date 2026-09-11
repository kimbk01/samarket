/**
 * Canonical publish eligibility for Community crawler (Admin + AUTO_PUBLISH).
 * Permission/draft rules must not be weakened for orchestration convenience.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommunityCrawlBoardRow,
  CommunityCrawlItemRow,
  CommunityCrawlSourceRow,
} from "@/lib/community-crawler/crawl-ssot";
import { findExistingCommunityCrawlPostLink } from "@/lib/community-crawler/manual-import-writer";
import { validateFullContentDraftForPublish } from "@/lib/community-crawler/publish-full-content-draft";

export type CommunityCrawlPublishMode = "auto" | "manual";

export type CommunityCrawlPublishSkipReason =
  | "SOURCE_NOT_ACTIVE"
  | "SOURCE_POLICY_NOT_ALLOWED"
  | "BOARD_NOT_AUTO_PUBLISH"
  | "ALREADY_PUBLISHED"
  | "ALREADY_LINKED"
  | "AUTHOR_MISSING"
  | "DRAFT_INVALID"
  | "ITEM_MISSING";

export type CommunityCrawlPublishEligibility =
  | {
      ok: true;
      title: string;
      content: string;
      displayAuthorName: string;
    }
  | {
      ok: false;
      reason: CommunityCrawlPublishSkipReason;
      detail?: string;
      /** run_events classification within existing CHECK constraint */
      eventClassification: "PUBLISH_BLOCKED_POLICY" | "DUPLICATE" | "FAILED";
    };

/**
 * Shared eligibility SSOT.
 * - mode "auto": also requires board.ingest_mode === AUTO_PUBLISH
 * - mode "manual": Admin path; AUTO_PUBLISH mode not required
 */
export async function resolveCommunityCrawlPublishEligibility(
  sb: SupabaseClient,
  input: {
    source: CommunityCrawlSourceRow;
    board: CommunityCrawlBoardRow;
    item: CommunityCrawlItemRow;
    mode: CommunityCrawlPublishMode;
  }
): Promise<CommunityCrawlPublishEligibility> {
  const { source, board, item, mode } = input;

  if (!item?.id) {
    return {
      ok: false,
      reason: "ITEM_MISSING",
      eventClassification: "FAILED",
    };
  }

  if (source.status !== "ACTIVE") {
    return {
      ok: false,
      reason: "SOURCE_NOT_ACTIVE",
      eventClassification: "PUBLISH_BLOCKED_POLICY",
    };
  }

  if (source.policy_status !== "ALLOWED") {
    return {
      ok: false,
      reason: "SOURCE_POLICY_NOT_ALLOWED",
      detail: `policy_status=${source.policy_status}`,
      eventClassification: "PUBLISH_BLOCKED_POLICY",
    };
  }

  if (mode === "auto" && board.ingest_mode !== "AUTO_PUBLISH") {
    return {
      ok: false,
      reason: "BOARD_NOT_AUTO_PUBLISH",
      detail: `ingest_mode=${board.ingest_mode}`,
      eventClassification: "PUBLISH_BLOCKED_POLICY",
    };
  }

  if (item.published_post_id) {
    return {
      ok: false,
      reason: "ALREADY_PUBLISHED",
      detail: item.published_post_id,
      eventClassification: "DUPLICATE",
    };
  }

  const existing = await findExistingCommunityCrawlPostLink(sb, {
    boardId: item.board_id,
    sourcePostId: item.source_post_id,
    canonicalUrl: item.canonical_url,
  });
  if (existing) {
    return {
      ok: false,
      reason: "ALREADY_LINKED",
      detail: existing.communityPostId,
      eventClassification: "DUPLICATE",
    };
  }

  const displayAuthorName = (item.display_author_name || "").trim();
  if (!displayAuthorName) {
    return {
      ok: false,
      reason: "AUTHOR_MISSING",
      eventClassification: "PUBLISH_BLOCKED_POLICY",
    };
  }

  const title = (item.dibay_title || item.source_title || "").trim();
  const content = (item.dibay_body || "").trim();
  const draft = validateFullContentDraftForPublish({
    draftTitle: title,
    draftContent: content,
  });
  if (!draft.ok) {
    return {
      ok: false,
      reason: "DRAFT_INVALID",
      detail: draft.error,
      eventClassification: "FAILED",
    };
  }

  return { ok: true, title, content, displayAuthorName };
}
