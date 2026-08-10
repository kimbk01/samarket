import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { neighborhoodPostTopicUiSlug } from "@/lib/neighborhood/philife-neighborhood-topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community/engine/posts
 * 관리자 — 커뮤니티 글 목록
 * Topic filter authority = `topic_slug` only.
 * Query `category` is a legacy alias for topic slug (not DB enum identity).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  const categoryAlias = sp.get("category")?.trim().toLowerCase() || "";
  const topicSlugParam = sp.get("topicSlug")?.trim().toLowerCase() || "";
  /** Topic identity filter — never filter the legacy enum `category` column */
  const topicFilter = topicSlugParam || categoryAlias;
  const locationId = sp.get("locationId")?.trim() || "";
  const reportedOnly = sp.get("reportedOnly") === "1";
  const status = sp.get("status")?.trim() || "";
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
      "id, user_id, location_id, category, topic_id, topic_slug, title, status, is_reported, like_count, comment_count, view_count, created_at, updated_at, region_label, is_sample_data"
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (topicFilter) q = q.eq("topic_slug", topicFilter);
  if (locationId) q = q.eq("location_id", locationId);
  if (reportedOnly) q = q.eq("is_reported", true);
  if (status && ["active", "hidden", "deleted"].includes(status)) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const posts = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const uiSlug = neighborhoodPostTopicUiSlug({
      category: r.category,
      topic_slug: r.topic_slug,
    });
    return {
      ...r,
      topicSlug: uiSlug,
    };
  });
  return NextResponse.json({ ok: true, posts });
}
