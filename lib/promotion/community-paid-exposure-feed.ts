/**
 * Community Paid Exposure feed projection — point_promotion_orders authority.
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 * DO NOT: require post_ads for new active pins.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdFeedPost, AdType } from "@/lib/ads/types";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

function excerptFromPostBody(raw: string, max = 180): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function topicMatches(postTopic: string, filterTopic: string): boolean {
  const a = postTopic.trim().toLowerCase();
  const b = filterTopic.trim().toLowerCase();
  if (!b || b === "all" || b === "recommended" || b === "recommend") return true;
  if (!a) return false;
  return a === b;
}

/**
 * Active community paid exposure rows for feed TOP pin.
 * @param topicFilter — COMMUNITY_TOPIC slug; empty = COMMUNITY_HOME (all topics)
 */
export async function fetchActiveCommunityPaidExposureFeedPosts(
  sb: SupabaseClient,
  opts?: { topicFilter?: string; limit?: number }
): Promise<{ ok: true; ads: AdFeedPost[] } | { ok: false; reason: string; message?: string }> {
  const nowIso = new Date().toISOString();
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));
  const topicFilter = (opts?.topicFilter ?? "").trim();

  const { data: orders, error } = await sb
    .from("point_promotion_orders")
    .select("id, target_id, user_id, start_at, end_at, point_cost, product_id")
    .eq("domain", "community")
    .eq("order_status", "active")
    .lte("start_at", nowIso)
    .gte("end_at", nowIso)
    .order("start_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }

  const rows = (orders ?? []) as {
    id: string;
    target_id: string;
    user_id: string;
    start_at: string;
    end_at: string;
  }[];
  if (rows.length === 0) return { ok: true, ads: [] };

  const postIds = [...new Set(rows.map((r) => String(r.target_id)).filter(Boolean))];
  const { data: posts, error: postErr } = await sb
    .from("community_posts")
    .select(
      "id, title, summary, content, region_label, category, topic_slug, user_id, is_hidden, status"
    )
    .in("id", postIds);

  if (postErr) {
    return { ok: false, reason: "error", message: postErr.message };
  }

  const postById = new Map<string, Record<string, unknown>>();
  for (const p of (posts ?? []) as Record<string, unknown>[]) {
    const id = String(p.id ?? "");
    if (!id) continue;
    if (p.is_hidden === true) continue;
    const st = String(p.status ?? "").toLowerCase();
    if (st && st !== "active" && st !== "published") continue;
    postById.set(id, p);
  }

  const imageByPostId = new Map<string, string[]>();
  if (postIds.length) {
    const { data: imgRows } = await sb
      .from("community_post_images")
      .select("post_id, image_url, sort_order")
      .in("post_id", postIds)
      .order("sort_order", { ascending: true });
    for (const row of (imgRows ?? []) as { post_id?: string; image_url?: string }[]) {
      const pid = String(row.post_id ?? "");
      const url = typeof row.image_url === "string" ? row.image_url.trim() : "";
      if (!pid || !url) continue;
      const list = imageByPostId.get(pid) ?? [];
      list.push(url);
      imageByPostId.set(pid, list);
    }
  }

  const userIds = [...new Set(rows.map((r) => String(r.user_id)).filter(Boolean))];
  const nicknameById = new Map<string, string>();
  if (userIds.length) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id, display_name, nickname, username")
      .in("id", userIds);
    for (const p of (profs ?? []) as {
      id?: string;
      display_name?: string | null;
      nickname?: string | null;
      username?: string | null;
    }[]) {
      const id = String(p.id ?? "");
      const base = String(p.display_name ?? p.nickname ?? "").trim();
      const uname = String(p.username ?? "").trim();
      const label =
        labelFromDisplayAndUsername(base || null, uname || null) || base || uname || id.slice(0, 8);
      nicknameById.set(id, label);
    }
  }

  const ads: AdFeedPost[] = [];
  for (const row of rows) {
    const post = postById.get(String(row.target_id));
    if (!post) continue;
    const topicSlug = String(post.topic_slug ?? "").trim() || String(post.category ?? "").trim();
    if (topicFilter && !topicMatches(topicSlug, topicFilter)) continue;

    const title = String(post.title ?? "").trim() || "(제목 없음)";
    const summaryRaw = String(post.summary ?? "").trim();
    const postSummary = summaryRaw || excerptFromPostBody(String(post.content ?? ""));
    const pid = String(row.target_id);
    ads.push({
      adId: String(row.id),
      postId: pid,
      postTitle: title,
      postSummary,
      postImages: imageByPostId.get(pid) ?? [],
      locationLabel: String(post.region_label ?? "").trim() || "—",
      boardKey: "plife",
      adType: "top_fixed" as AdType,
      priority: 0,
      startAt: row.start_at,
      endAt: row.end_at,
      advertiserName: nicknameById.get(String(row.user_id)) ?? "회원",
    });
  }

  return { ok: true, ads };
}
