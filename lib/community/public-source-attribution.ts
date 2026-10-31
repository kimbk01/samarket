/**
 * Public attribution authority = community_posts policy columns only.
 * NOT origin_kind / import skin.
 *
 * Allowed Public copy: "출처: <name>" / "원문 보기"
 * Forbidden: 크롤링 글 / Imported / External post / crawler badge
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ImportedContentBlock,
  sanitizeImportedContentBlocks,
  sanitizeMemberContentBlocks,
} from "@/lib/community/imported-content-blocks";
import {
  COMMUNITY_FEED_TOP_SELECT_TAIL,
  type CommunityFeedTopRowFields,
} from "@/lib/community-feed/community-feed-top-posts";

export type PublicSourceAttribution = {
  sourceName: string;
  canonicalUrl: string | null;
  sourcePublishedAt: string | null;
};

/**
 * Load Public attribution from community_posts policy columns only.
 */
export async function loadPublicSourceAttributionFromPost(
  sb: SupabaseClient,
  communityPostId: string
): Promise<PublicSourceAttribution | null> {
  const postId = communityPostId.trim();
  if (!postId) return null;

  const { data, error } = await sb
    .from("community_posts")
    .select("public_attribution_name, public_attribution_url")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    const m = String(error.message ?? "").toLowerCase();
    if (m.includes("public_attribution") || m.includes("does not exist") || m.includes("schema cache")) {
      return null;
    }
    return null;
  }

  const name = String((data as { public_attribution_name?: string | null } | null)?.public_attribution_name ?? "").trim();
  const urlRaw = (data as { public_attribution_url?: string | null } | null)?.public_attribution_url;
  const url = urlRaw != null && String(urlRaw).trim() ? String(urlRaw).trim() : null;
  if (!name && !url) return null;
  return {
    sourceName: name || "출처",
    canonicalUrl: url,
    sourcePublishedAt: null,
  };
}

/**
 * Detail-page extras of one post in a single read: the public 출처 block and, for imported posts,
 * the structured body (`content_blocks`). Before that column exists the attribution read still works.
 */
export async function loadPostAttributionAndBlocks(
  sb: SupabaseClient,
  communityPostId: string
): Promise<{
  attribution: PublicSourceAttribution | null;
  contentBlocks: ImportedContentBlock[] | null;
  /** 공지·고정 원천 필드 (M10) — 컬럼 미적용 DB 면 null */
  topFields: CommunityFeedTopRowFields | null;
}> {
  const postId = communityPostId.trim();
  if (!postId) return { attribution: null, contentBlocks: null, topFields: null };
  const BASE = "public_attribution_name, public_attribution_url, origin_kind, content_blocks";
  let { data, error } = await sb
    .from("community_posts")
    .select(BASE + ", topic_slug" + COMMUNITY_FEED_TOP_SELECT_TAIL)
    .eq("id", postId)
    .maybeSingle();
  let hasTopFields = !error;
  if (error) {
    hasTopFields = false;
    ({ data, error } = await sb.from("community_posts").select(BASE).eq("id", postId).maybeSingle());
  }
  if (error) {
    return { attribution: await loadPublicSourceAttributionFromPost(sb, postId), contentBlocks: null, topFields: null };
  }
  const row = (data ?? {}) as unknown as {
    public_attribution_name?: string | null;
    public_attribution_url?: string | null;
    origin_kind?: string | null;
    content_blocks?: unknown;
  } & CommunityFeedTopRowFields;
  const name = String(row.public_attribution_name ?? "").trim();
  const url = row.public_attribution_url != null && String(row.public_attribution_url).trim() ? String(row.public_attribution_url).trim() : null;
  /** 가져온 글 = 원문 구조, 회원 글 = 서식 본문(Owner 승인 ①). 그 밖(관리자 작성 등)은 블록 없음 */
  const blocks =
    row.origin_kind === "imported"
      ? sanitizeImportedContentBlocks(row.content_blocks)
      : row.origin_kind === "member" || row.origin_kind == null
        ? sanitizeMemberContentBlocks(row.content_blocks)
        : [];
  return {
    attribution: name || url ? { sourceName: name || "출처", canonicalUrl: url, sourcePublishedAt: null } : null,
    contentBlocks: blocks.length ? blocks : null,
    topFields: hasTopFields ? row : null,
  };
}

export function resolvePublishAttribution(input: {
  attributionRequired: boolean;
  attributionDisplayName: string | null;
  siteName: string;
  canonicalSourceUrl: string;
}): { publicAttributionName: string | null; publicAttributionUrl: string | null } {
  if (!input.attributionRequired) {
    return { publicAttributionName: null, publicAttributionUrl: null };
  }
  const name =
    String(input.attributionDisplayName ?? "").trim() ||
    String(input.siteName ?? "").trim() ||
    "출처";
  const url = String(input.canonicalSourceUrl ?? "").trim() || null;
  return { publicAttributionName: name, publicAttributionUrl: url };
}
