/**
 * Durable per-URL / per-phase crawl run detail writer.
 * Aggregate counts remain on community_crawl_runs — not duplicated as authority here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const COMMUNITY_CRAWL_RUN_EVENT_CLASSIFICATIONS = [
  "SKIPPED_INVALID",
  "FAILED",
  "MEDIA_INVALID",
  "PUBLISH_BLOCKED_POLICY",
  "DUPLICATE",
  "INSERTED",
  "UPDATED",
] as const;

export type CommunityCrawlRunEventClassification =
  (typeof COMMUNITY_CRAWL_RUN_EVENT_CLASSIFICATIONS)[number];

export type CommunityCrawlRunEventPhase =
  | "DISCOVER"
  | "FETCH"
  | "VALIDATE"
  | "PARSE"
  | "NORMALIZE"
  | "MEDIA_RESOLVE"
  | "DEDUPE"
  | "UPSERT"
  | "PUBLISH";

export async function insertCommunityCrawlRunEvent(
  sb: SupabaseClient,
  input: {
    runId: string | null;
    sourceId: string;
    boardId: string;
    sourcePostId?: string | null;
    canonicalUrl?: string | null;
    phase: CommunityCrawlRunEventPhase;
    classification: CommunityCrawlRunEventClassification;
    errorCode?: string | null;
    errorMessage?: string | null;
    httpStatus?: number | null;
  }
): Promise<void> {
  if (!input.runId) return;
  const { error } = await sb.from("community_crawl_run_events").insert({
    run_id: input.runId,
    source_id: input.sourceId,
    board_id: input.boardId,
    source_post_id: input.sourcePostId?.trim() || null,
    canonical_url: input.canonicalUrl?.trim() || null,
    phase: input.phase,
    classification: input.classification,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    http_status: typeof input.httpStatus === "number" ? input.httpStatus : null,
  });
  if (error) {
    // Detail write must not abort the crawl; surface via console for ops.
    console.error("[community_crawl_run_events]", error.message);
  }
}
