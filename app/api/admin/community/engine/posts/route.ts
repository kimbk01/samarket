import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { neighborhoodPostTopicUiSlug } from "@/lib/neighborhood/philife-neighborhood-topics";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";
import { communityAdminStartOfTodayIso } from "@/lib/admin-community/home-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community/engine/posts
 * Topic filter authority = `topic_slug` only.
 * Query `category` is a legacy alias for topic slug (not DB enum identity).
 * Enriches author as nickname | username (batch profiles).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  const categoryAlias = sp.get("category")?.trim().toLowerCase() || "";
  const topicSlugParam = sp.get("topicSlug")?.trim().toLowerCase() || "";
  const topicFilter = topicSlugParam || categoryAlias;
  const locationId = sp.get("locationId")?.trim() || "";
  const userId = sp.get("userId")?.trim() || "";
  const postId = sp.get("postId")?.trim() || "";
  const reportedOnly = sp.get("reportedOnly") === "1";
  const status = sp.get("status")?.trim() || "";
  const period = sp.get("period")?.trim().toLowerCase() || "";
  let createdFrom = sp.get("createdFrom")?.trim() || "";
  const createdTo = sp.get("createdTo")?.trim() || "";
  if (period === "today" && !createdFrom) {
    createdFrom = communityAdminStartOfTodayIso();
  }
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "30", 10) || 30, 1), 100);
  const offset = Math.min(Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0), 10_000);

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let q = sb
    .from("community_posts")
    .select(
      "id, user_id, location_id, category, topic_id, topic_slug, title, status, is_reported, report_count, like_count, comment_count, view_count, created_at, updated_at, region_label, is_sample_data"
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (postId) q = q.eq("id", postId);
  if (topicFilter) q = q.eq("topic_slug", topicFilter);
  if (locationId) q = q.eq("location_id", locationId);
  if (userId) q = q.eq("user_id", userId);
  if (reportedOnly) q = q.eq("is_reported", true);
  if (status && ["active", "hidden", "deleted"].includes(status)) q = q.eq("status", status);
  if (createdFrom) q = q.gte("created_at", createdFrom);
  if (createdTo) q = q.lte("created_at", createdTo);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const raw = data ?? [];
  const identityMap = await loadAdminMemberIdentityMap(
    sb,
    raw.map((row) => String((row as { user_id?: string }).user_id ?? ""))
  );

  const posts = raw.map((row) => {
    const r = row as Record<string, unknown>;
    const uid = String(r.user_id ?? "");
    const identity = uid ? identityMap.get(uid) : undefined;
    const uiSlug = neighborhoodPostTopicUiSlug({
      category: r.category,
      topic_slug: r.topic_slug,
    });
    return {
      ...r,
      topicSlug: uiSlug,
      author_nickname: identity?.nickname ?? null,
      author_username: identity?.username ?? null,
      author_label: formatAdminMemberLabel(identity ?? null),
    };
  });
  return NextResponse.json({ ok: true, posts });
}
