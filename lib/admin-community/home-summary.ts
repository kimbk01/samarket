/**
 * Admin Community home — lightweight counts only (no analytics infra).
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";

export type AdminCommunityHomeSummary = {
  todayPosts: number;
  todayComments: number;
  pendingReports: number;
  hiddenPosts: number;
};

/** Start of today in Asia/Manila (UTC+8 product day). */
export function communityAdminStartOfTodayIso(): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${day}T00:00:00+08:00`;
}

export async function loadAdminCommunityHomeSummary(): Promise<AdminCommunityHomeSummary | null> {
  try {
    const sb = getSupabaseServer();
    const since = communityAdminStartOfTodayIso();

    const [postsRes, commentsRes, openRes, reviewingRes, hiddenRes] = await Promise.all([
      sb.from("community_posts").select("id", { count: "exact", head: true }).gte("created_at", since),
      sb.from("community_comments").select("id", { count: "exact", head: true }).gte("created_at", since),
      sb.from("community_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      sb.from("community_reports").select("id", { count: "exact", head: true }).eq("status", "reviewing"),
      sb.from("community_posts").select("id", { count: "exact", head: true }).eq("status", "hidden"),
    ]);

    if (postsRes.error || commentsRes.error || openRes.error || reviewingRes.error || hiddenRes.error) {
      return null;
    }

    return {
      todayPosts: postsRes.count ?? 0,
      todayComments: commentsRes.count ?? 0,
      pendingReports: (openRes.count ?? 0) + (reviewingRes.count ?? 0),
      hiddenPosts: hiddenRes.count ?? 0,
    };
  } catch {
    return null;
  }
}
