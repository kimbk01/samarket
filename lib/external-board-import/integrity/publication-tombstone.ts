/**
 * Publication tombstone / republish gate for external-board articles.
 * DIBAY post delete ≠ raw source identity delete.
 * Default Owner delete semantics = B (republish blocked).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ExternalBoardPublicationState =
  | "none"
  | "published"
  | "hidden"
  | "deleted"
  | "suppressed"
  | "republish_allowed";

export const REPUBLISH_BLOCKED_STATES: ReadonlySet<ExternalBoardPublicationState> = new Set([
  "hidden",
  "deleted",
  "suppressed",
]);

export function isRepublishBlocked(state: string | null | undefined): boolean {
  return REPUBLISH_BLOCKED_STATES.has((state || "none") as ExternalBoardPublicationState);
}

export function assertPublishAllowedByPublicationState(input: {
  publicationState: string | null | undefined;
  publishedPostId: string | null | undefined;
}):
  | { ok: true }
  | {
      ok: false;
      failureStage: "claim";
      failureCode: "republish_blocked" | "already_published";
      failureMessage: string;
      alreadyPublishedPostId?: string;
    } {
  const state = (input.publicationState || "none") as ExternalBoardPublicationState;
  if (isRepublishBlocked(state)) {
    return {
      ok: false,
      failureStage: "claim",
      failureCode: "republish_blocked",
      failureMessage: "삭제·숨김된 원문은 다시 게시할 수 없습니다. 「다시 게시 허용」 후 게시하세요.",
    };
  }
  if (input.publishedPostId && state !== "republish_allowed") {
    return {
      ok: false,
      failureStage: "claim",
      failureCode: "already_published",
      failureMessage: "Same source article already published.",
      alreadyPublishedPostId: String(input.publishedPostId),
    };
  }
  return { ok: true };
}

/** Soft-delete / hide Community post → default B tombstone (republish blocked). */
export async function suppressExternalBoardByCommunityPost(input: {
  sb: SupabaseClient;
  postId: string;
  state: "deleted" | "hidden" | "suppressed";
  actorId?: string | null;
  reason?: string;
}): Promise<{ updated: number }> {
  const now = new Date().toISOString();
  const { data, error } = await input.sb
    .from("external_board_articles")
    .update({
      publication_state: input.state,
      suppressed_at: now,
      suppression_reason: (input.reason || `community_post_${input.state}`).slice(0, 500),
      suppression_actor_id: input.actorId ?? null,
      // Keep identity + published_post_id for audit; ops stays published historically.
      updated_at: now,
    })
    .eq("published_post_id", input.postId)
    .select("id");
  if (error) {
    throw new Error(error.message);
  }
  return { updated: (data ?? []).length };
}

/** Explicit Admin action — only path that clears republish block. */
export async function allowExternalBoardRepublish(input: {
  sb: SupabaseClient;
  articleId: string;
  actorId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error } = await input.sb
    .from("external_board_articles")
    .update({
      publication_state: "republish_allowed",
      published_post_id: null,
      ops_status: "unpublished",
      edit_status: "collected",
      article_signal: "UNCHANGED",
      suppressed_at: null,
      suppression_reason: null,
      suppression_actor_id: input.actorId ?? null,
      updated_at: now,
    })
    .eq("id", input.articleId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function publicationStateOperatorLabel(state: string | null | undefined): string {
  switch (state) {
    case "published":
      return "게시됨";
    case "hidden":
      return "숨김 · 재게시 금지";
    case "deleted":
      return "삭제됨 · 재게시 금지";
    case "suppressed":
      return "게시 금지";
    case "republish_allowed":
      return "다시 게시 허용";
    default:
      return "미게시";
  }
}
