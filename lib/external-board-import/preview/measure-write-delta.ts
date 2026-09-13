/**
 * Preview zero-write measurement.
 * Window: immediately before Preview request → immediately after Preview response.
 * Ingestion/snapshot before Preview is allowed; forbidden tables must not change during Preview.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PreviewWriteSnapshot = {
  communityPosts: number;
  mediaAssets: number;
  publishClaims: number;
  articlePublishedPostId: string | null;
  articleOpsStatus: string | null;
};

async function countTable(sb: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  if (error) return -1;
  return typeof count === "number" ? count : -1;
}

export async function capturePreviewWriteSnapshot(
  sb: SupabaseClient,
  articleId: string
): Promise<PreviewWriteSnapshot> {
  const [communityPosts, mediaAssets, publishClaims, articleRes] = await Promise.all([
    countTable(sb, "community_posts"),
    countTable(sb, "external_board_media_assets"),
    countTable(sb, "external_board_publish_claims"),
    sb
      .from("external_board_articles")
      .select("published_post_id, ops_status")
      .eq("id", articleId)
      .maybeSingle(),
  ]);

  const row = articleRes.data as { published_post_id?: string | null; ops_status?: string | null } | null;
  return {
    communityPosts,
    mediaAssets,
    publishClaims,
    articlePublishedPostId: row?.published_post_id != null ? String(row.published_post_id) : null,
    articleOpsStatus: row?.ops_status != null ? String(row.ops_status) : null,
  };
}

export function computePreviewWriteDelta(
  before: PreviewWriteSnapshot,
  after: PreviewWriteSnapshot
): { writeDelta: number; violations: string[] } {
  const violations: string[] = [];
  if (before.communityPosts >= 0 && after.communityPosts >= 0 && after.communityPosts !== before.communityPosts) {
    violations.push("community_posts");
  }
  if (before.mediaAssets >= 0 && after.mediaAssets >= 0 && after.mediaAssets !== before.mediaAssets) {
    violations.push("external_board_media_assets");
  }
  if (
    before.publishClaims >= 0 &&
    after.publishClaims >= 0 &&
    after.publishClaims !== before.publishClaims
  ) {
    violations.push("external_board_publish_claims");
  }
  if (after.articlePublishedPostId !== before.articlePublishedPostId) {
    violations.push("article.published_post_id");
  }
  if (after.articleOpsStatus !== before.articleOpsStatus) {
    violations.push("article.ops_status");
  }
  return { writeDelta: violations.length, violations };
}
