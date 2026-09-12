import type { BoardImportOpsStatus } from "@/lib/community-board-import/product-lock";

/**
 * Operable failure audit — ops status stays 미게시/게시됨/실패.
 * Developer crawler statuses (CANDIDATE_ONLY, REVIEW_REQUIRED, …) are forbidden in Admin product language.
 */

export const BOARD_IMPORT_FAILURE_STAGES = [
  "BOARD_CHECK",
  "ARTICLE_DISCOVERY",
  "ARTICLE_FETCH",
  "ARTICLE_PARSE",
  "TRANSFORM",
  "MEDIA",
  "AUTHOR",
  "TARGET",
  "COMMUNITY_WRITE",
  "PUBLISH_LINK",
  "PUBLISH",
] as const;

export type BoardImportFailureStage = (typeof BOARD_IMPORT_FAILURE_STAGES)[number];

export type BoardImportFailureAudit = {
  failure_stage: BoardImportFailureStage;
  failure_code: string;
  /** Human-readable; never raw stack traces in Admin UI. */
  failure_message: string;
  failed_at: string;
};

export type BoardImportPublishedTruth = {
  /** Canonical Community post id when published. */
  communityPostId: string | null;
  /** True only if post exists AND normal Community read path can resolve it. */
  readableOnCommunity: boolean;
};

export function resolveOpsStatus(input: {
  failure: BoardImportFailureAudit | null;
  published: BoardImportPublishedTruth;
}): BoardImportOpsStatus {
  if (input.failure) return "failed";
  if (input.published.communityPostId && input.published.readableOnCommunity) {
    return "published";
  }
  return "unpublished";
}

export function makeFailureAudit(input: {
  stage: BoardImportFailureStage;
  code: string;
  message: string;
  at?: Date;
}): BoardImportFailureAudit {
  return {
    failure_stage: input.stage,
    failure_code: input.code,
    failure_message: input.message,
    failed_at: (input.at ?? new Date()).toISOString(),
  };
}
