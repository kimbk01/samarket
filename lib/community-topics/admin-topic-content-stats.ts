/**
 * Admin Topics list — single-query aggregate (no N+1).
 * comment_count is denormalized on community_posts.
 * reportCount = SUM(report_count) — aligns with community_reports increments on post report.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";

export type CommunityTopicContentStats = {
  postCount: number;
  commentCount: number;
  reportCount: number;
};

const EMPTY_STATS: CommunityTopicContentStats = {
  postCount: 0,
  commentCount: 0,
  reportCount: 0,
};

export async function loadCommunityTopicContentStatsBySlug(
  topicSlugs: string[]
): Promise<Record<string, CommunityTopicContentStats>> {
  const slugs = [...new Set(topicSlugs.map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const out: Record<string, CommunityTopicContentStats> = {};
  for (const slug of slugs) {
    out[slug] = { ...EMPTY_STATS };
  }
  if (!slugs.length) return out;

  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("community_posts")
      .select("topic_slug, comment_count, report_count")
      .eq("status", "active")
      .in("topic_slug", slugs);

    if (error || !Array.isArray(data)) return out;

    for (const row of data as Array<{
      topic_slug?: string | null;
      comment_count?: number | null;
      report_count?: number | null;
    }>) {
      const slug = String(row.topic_slug ?? "").trim().toLowerCase();
      if (!slug || !out[slug]) continue;
      out[slug].postCount += 1;
      out[slug].commentCount += Number(row.comment_count ?? 0) || 0;
      out[slug].reportCount += Number(row.report_count ?? 0) || 0;
    }
    return out;
  } catch {
    return out;
  }
}
