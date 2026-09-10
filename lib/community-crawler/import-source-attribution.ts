/**
 * Resolve imported post source attribution from community_crawl_post_links (+ source name).
 * Not stored in community_posts body — Detail UI only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CommunityImportSourceAttribution = {
  sourceName: string;
  canonicalUrl: string | null;
  sourcePublishedAt: string | null;
  boardName: string | null;
};

export async function loadCommunityImportSourceAttribution(
  sb: SupabaseClient,
  communityPostId: string
): Promise<CommunityImportSourceAttribution | null> {
  const postId = communityPostId.trim();
  if (!postId) return null;

  const { data: link, error } = await sb
    .from("community_crawl_post_links")
    .select("canonical_url, source_published_at, board_id")
    .eq("community_post_id", postId)
    .maybeSingle();
  if (error || !link) return null;

  const boardId = String((link as { board_id?: string }).board_id ?? "").trim();
  let sourceName = "";
  let boardName: string | null = null;
  if (boardId) {
    const { data: board } = await sb
      .from("community_crawl_boards")
      .select("name, source_id")
      .eq("id", boardId)
      .maybeSingle();
    if (board) {
      boardName = String((board as { name?: string }).name ?? "").trim() || null;
      const sourceId = String((board as { source_id?: string }).source_id ?? "").trim();
      if (sourceId) {
        const { data: source } = await sb
          .from("community_crawl_sources")
          .select("name")
          .eq("id", sourceId)
          .maybeSingle();
        sourceName = String((source as { name?: string } | null)?.name ?? "").trim();
      }
    }
  }

  const canonicalUrlRaw = (link as { canonical_url?: string | null }).canonical_url;
  const canonicalUrl =
    canonicalUrlRaw != null && String(canonicalUrlRaw).trim() ? String(canonicalUrlRaw).trim() : null;
  const pubRaw = (link as { source_published_at?: string | null }).source_published_at;
  const sourcePublishedAt =
    pubRaw != null && String(pubRaw).trim() ? String(pubRaw).trim() : null;

  if (!sourceName && !canonicalUrl) return null;
  return {
    sourceName: sourceName || "외부 출처",
    canonicalUrl,
    sourcePublishedAt,
    boardName,
  };
}
