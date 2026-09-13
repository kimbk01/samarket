import type { SupabaseClient } from "@supabase/supabase-js";

const CLAIM_TTL_MS = 120_000;

export type ClaimResult =
  | { ok: true; claimed: true }
  | { ok: false; failureStage: "claim"; failureCode: string; failureMessage: string; alreadyPublishedPostId?: string };

/**
 * Race-safe publish lease. Duplicate / already-published is not a hard failure for ops.
 */
export async function claimExternalBoardPublish(
  sb: SupabaseClient,
  articleId: string,
  publishedPostId: string | null
): Promise<ClaimResult> {
  if (publishedPostId) {
    return {
      ok: false,
      failureStage: "claim",
      failureCode: "already_published",
      failureMessage: "This source article already has a Community post.",
      alreadyPublishedPostId: publishedPostId,
    };
  }

  const now = Date.now();
  const expires = new Date(now + CLAIM_TTL_MS).toISOString();
  const { data: existing } = await sb
    .from("external_board_publish_claims")
    .select("*")
    .eq("article_id", articleId)
    .maybeSingle();

  if (existing) {
    const exp = new Date(String((existing as { expires_at: string }).expires_at)).getTime();
    if (exp > now) {
      return {
        ok: false,
        failureStage: "claim",
        failureCode: "claim_held",
        failureMessage: "Another publish claim is active for this article.",
      };
    }
    await sb.from("external_board_publish_claims").delete().eq("article_id", articleId);
  }

  const { error } = await sb.from("external_board_publish_claims").insert({
    article_id: articleId,
    claimed_at: new Date(now).toISOString(),
    claimed_by: "canonical-publisher",
    expires_at: expires,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return {
        ok: false,
        failureStage: "claim",
        failureCode: "claim_race",
        failureMessage: "Publish claim lost the race.",
      };
    }
    return {
      ok: false,
      failureStage: "claim",
      failureCode: "claim_error",
      failureMessage: error.message,
    };
  }
  return { ok: true, claimed: true };
}

export async function releaseExternalBoardPublishClaim(sb: SupabaseClient, articleId: string): Promise<void> {
  await sb.from("external_board_publish_claims").delete().eq("article_id", articleId);
}
