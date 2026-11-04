/**
 * Community Paid Exposure feed projection — point_promotion_orders authority.
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 * DO NOT: require post_ads for new active pins.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdFeedPost, AdType } from "@/lib/ads/types";
import {
  MEMBER_IDENTITY_PROFILE_SELECT,
  memberDisplayLabelFromRow,
  type MemberIdentityProfileFields,
} from "@/lib/users/public-member-identity";
import { formatCommunityPublicRegionLabel } from "@/lib/addresses/community-public-region-label";

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
  /**
   * 재감사 S-1 (C-1): 예전에는 광고 중 주문 `limit`(20)개를 먼저 자른 뒤 주제로 걸러, 다른 주제의 최근 주문이 20개를 넘으면
   * 그 주제 탭에 상위노출이 0개가 됐다. 후보는 넉넉히(최대 200개, 최근 결제 순) 읽고 공개·주제 조건을 거른 **뒤** `limit` 개로 자른다.
   */
  const candidateWindow = 200;

  const { data: orders, error } = await sb
    .from("point_promotion_orders")
    .select("id, target_id, user_id, start_at, end_at, point_cost, product_id")
    .eq("domain", "community")
    .eq("order_status", "active")
    .lte("start_at", nowIso)
    .gte("end_at", nowIso)
    .order("start_at", { ascending: false })
    .limit(candidateWindow);

  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }

  const candidateRows = (orders ?? []) as {
    id: string;
    target_id: string;
    user_id: string;
    start_at: string;
    end_at: string;
  }[];
  if (candidateRows.length === 0) return { ok: true, ads: [] };

  const candidatePostIds = [...new Set(candidateRows.map((r) => String(r.target_id)).filter(Boolean))];
  const { data: posts, error: postErr } = await sb
    .from("community_posts")
    .select(
      "id, title, summary, content, region_label, category, topic_slug, user_id, is_hidden, status"
    )
    .in("id", candidatePostIds);

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

  /** 공개 글 · 주제 조건을 통과한 주문만, 최근 결제 순으로 `limit` 개 */
  const rows = candidateRows
    .filter((row) => {
      const post = postById.get(String(row.target_id));
      if (!post) return false;
      const topicSlug = String(post.topic_slug ?? "").trim() || String(post.category ?? "").trim();
      return !topicFilter || topicMatches(topicSlug, topicFilter);
    })
    .slice(0, limit);
  if (rows.length === 0) return { ok: true, ads: [] };
  const postIds = [...new Set(rows.map((r) => String(r.target_id)).filter(Boolean))];

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
      .select(MEMBER_IDENTITY_PROFILE_SELECT)
      .in("id", userIds);
    for (const p of (profs ?? []) as MemberIdentityProfileFields[]) {
      const id = String(p.id ?? "");
      if (!id) continue;
      nicknameById.set(id, memberDisplayLabelFromRow(p, { userId: id }));
    }
  }

  const ads: AdFeedPost[] = [];
  for (const row of rows) {
    const post = postById.get(String(row.target_id));
    if (!post) continue;

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
      locationLabel: formatCommunityPublicRegionLabel({
        regionLabel: String(post.region_label ?? "").trim(),
      }),
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

/** 광고 ② PB-21 (2026-11-04): 광고 중인 글 id 전체를 읽는 안전 상한(넘으면 기록만 하고 자른다) */
export const COMMUNITY_ACTIVE_PROMOTION_IDS_SAFETY_MAX = 500;

/**
 * 광고 ② PB-21 (2026-11-04): 커뮤니티 광고 중인 글 **id 전체**를 가볍게(글 id · 결제 시각만) 읽는다.
 * 예전 `fetchActiveCommunityPaidExposureFeedPosts` 는 기본 20개로 잘라 21번째 광고 글부터 표시가 없었다.
 * 순서 = 최근 결제(start_at) 내림차순 — 화면은 위쪽 1개(`PROMOTED_TOP_PINS_MAX`)만 카드 값으로, 나머지는 일반 자리에 표시한다.
 * @param topicFilter — COMMUNITY_TOPIC slug; 빈 값 = 전체 주제
 */
export async function fetchActiveCommunityPromotedPostIds(
  sb: SupabaseClient,
  opts?: { topicFilter?: string; safetyMax?: number }
): Promise<
  | { ok: true; items: { postId: string; startAt: string }[]; truncated: boolean }
  | { ok: false; reason: string; message?: string }
> {
  const nowIso = new Date().toISOString();
  const safetyMax = Math.max(1, opts?.safetyMax ?? COMMUNITY_ACTIVE_PROMOTION_IDS_SAFETY_MAX);
  const topicFilter = (opts?.topicFilter ?? "").trim();

  const { data: orders, error } = await sb
    .from("point_promotion_orders")
    .select("target_id, start_at")
    .eq("domain", "community")
    .eq("order_status", "active")
    .lte("start_at", nowIso)
    .gte("end_at", nowIso)
    .order("start_at", { ascending: false })
    .limit(safetyMax + 1);
  if (error) return { ok: false, reason: "error", message: error.message };

  let rows = ((orders ?? []) as { target_id?: string | null; start_at?: string | null }[])
    .map((r) => ({ postId: String(r.target_id ?? "").trim(), startAt: String(r.start_at ?? "") }))
    .filter((r) => r.postId);
  const truncated = rows.length > safetyMax;
  if (truncated) {
    console.warn("[community-promotion] active order ids exceed safety max", { safetyMax });
    rows = rows.slice(0, safetyMax);
  }
  if (rows.length === 0) return { ok: true, items: [], truncated };

  /** 같은 글의 주문이 둘이면 최근 결제 1건만 */
  const seen = new Set<string>();
  rows = rows.filter((r) => (seen.has(r.postId) ? false : (seen.add(r.postId), true)));

  /** 주소 길이 한도 — id 100개씩 나눠 읽는다 */
  const postRows: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => r.postId);
    const { data: posts, error: postErr } = await sb
      .from("community_posts")
      .select("id, category, topic_slug, is_hidden, status")
      .in("id", chunk);
    if (postErr) return { ok: false, reason: "error", message: postErr.message };
    postRows.push(...((posts ?? []) as Record<string, unknown>[]));
  }

  const visible = new Map<string, string>();
  for (const p of postRows) {
    const id = String(p.id ?? "");
    if (!id || p.is_hidden === true) continue;
    const st = String(p.status ?? "").toLowerCase();
    if (st && st !== "active" && st !== "published") continue;
    visible.set(id, String(p.topic_slug ?? "").trim() || String(p.category ?? "").trim());
  }
  const items = rows.filter((r) => {
    const topic = visible.get(r.postId);
    if (topic === undefined) return false;
    return !topicFilter || topicMatches(topic, topicFilter);
  });
  return { ok: true, items, truncated };
}
