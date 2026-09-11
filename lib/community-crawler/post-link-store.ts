/**
 * Crawl item ↔ community_posts link lookup (dedupe identity).
 * Extracted from legacy manual-import-writer so canonical publish does not depend on it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function findExistingCommunityCrawlPostLink(
  sb: SupabaseClient,
  input: { boardId: string; sourcePostId: string | null; canonicalUrl: string }
): Promise<{ communityPostId: string; linkId: string } | null> {
  const boardId = input.boardId.trim();
  const sourcePostId = input.sourcePostId?.trim() || null;
  const canonicalUrl = input.canonicalUrl.trim();
  if (!boardId || (!sourcePostId && !canonicalUrl)) return null;

  if (sourcePostId) {
    const { data } = await sb
      .from("community_crawl_post_links")
      .select("id, community_post_id")
      .eq("board_id", boardId)
      .eq("source_post_id", sourcePostId)
      .maybeSingle();
    if (data?.community_post_id) {
      return { communityPostId: String(data.community_post_id), linkId: String(data.id) };
    }
  }
  if (canonicalUrl) {
    const { data } = await sb
      .from("community_crawl_post_links")
      .select("id, community_post_id")
      .eq("board_id", boardId)
      .eq("canonical_url", canonicalUrl)
      .maybeSingle();
    if (data?.community_post_id) {
      return { communityPostId: String(data.community_post_id), linkId: String(data.id) };
    }
  }
  return null;
}
