/**
 * Public attribution authority = community_posts policy columns only.
 * NOT origin_kind / import skin.
 *
 * Allowed Public copy: "출처: <name>" / "원문 보기"
 * Forbidden: 크롤링 글 / Imported / External post / crawler badge
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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
