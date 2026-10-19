import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { neighborhoodPostTopicUiSlug } from "@/lib/neighborhood/philife-neighborhood-topics";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";
import { parseCommunityAdminPeriod } from "@/lib/admin/community-admin/community-admin-period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_SELECT =
  "id, user_id, location_id, category, topic_id, topic_slug, title, status, is_reported, report_count, like_count, comment_count, view_count, created_at, published_at, updated_at, region_label, is_sample_data, " +
  "origin_kind, display_author_name, public_attribution_name, is_notice, pinned_at, pinned_until, pin_scope";
const LIST_SELECT_LEGACY =
  "id, user_id, location_id, category, topic_id, topic_slug, title, status, is_reported, report_count, like_count, comment_count, view_count, created_at, updated_at, region_label, is_sample_data";

const ORIGINS = new Set(["member", "imported", "admin"]);

/** PostgREST or() 문법을 깨는 문자 제거 (검색어 주입 방지) */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * GET /api/admin/community/engine/posts
 * query:
 *   status=active|hidden|deleted · reported=1 (또는 reportedOnly=1) · q(제목·본문) · origin=member|imported|admin
 *   topicSlug (legacy alias: category) · userId (alias: authorId) · postId · locationId
 *   period=today|7d|30d|custom (+from,to = YYYY-MM-DD 마닐라 날짜) — 서버가 Asia/Manila [from,to) 로 바꾼다.
 *   (이전 방식 createdFrom/createdTo ISO 도 계속 받는다)
 *   limit(≤100, 기본 50) · offset
 * → { ok, posts, total, limit, offset }
 * Topic filter authority = `topic_slug` only. Enriches author as nickname | username (batch profiles).
 */
export async function GET(req: NextRequest) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  // `category` query = legacy alias for topic slug (enum column 필터 아님)
  const categoryAlias = sp.get("category")?.trim().toLowerCase() || "";
  const topicSlugParam = sp.get("topicSlug")?.trim().toLowerCase() || "";
  const topicFilter = topicSlugParam || categoryAlias;
  const locationId = sp.get("locationId")?.trim() || "";
  const userId = (sp.get("userId") || sp.get("authorId") || "").trim();
  const postId = sp.get("postId")?.trim() || "";
  const reportedOnly = sp.get("reportedOnly") === "1" || sp.get("reported") === "1";
  const status = sp.get("status")?.trim() || "";
  const origin = sp.get("origin")?.trim().toLowerCase() || "";
  const search = sanitizeSearch(sp.get("q") ?? "");

  const period = parseCommunityAdminPeriod(
    { period: sp.get("period"), from: sp.get("from"), to: sp.get("to") },
    { defaultPeriod: "all" }
  );
  if (!period.ok) return NextResponse.json({ ok: false, error: period.error }, { status: 400 });
  const createdFromIso = period.fromIso ?? (sp.get("createdFrom")?.trim() || "");
  const createdToExclusive = period.toIso ?? "";
  const createdToInclusive = period.toIso ? "" : sp.get("createdTo")?.trim() || "";

  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 100);
  const offset = Math.min(Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0), 10_000);

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const build = (select: string, legacy: boolean) => {
    let q = sb
      .from("community_posts")
      .select(select, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (postId) q = q.eq("id", postId);
    if (topicFilter) q = q.eq("topic_slug", topicFilter);
    if (locationId) q = q.eq("location_id", locationId);
    if (userId) q = q.eq("user_id", userId);
    if (reportedOnly) q = q.eq("is_reported", true);
    if (status && ["active", "hidden", "deleted"].includes(status)) q = q.eq("status", status);
    if (!legacy && origin && ORIGINS.has(origin)) q = q.eq("origin_kind", origin);
    if (search) q = q.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    if (createdFromIso) q = q.gte("created_at", createdFromIso);
    if (createdToExclusive) q = q.lt("created_at", createdToExclusive);
    if (createdToInclusive) q = q.lte("created_at", createdToInclusive);
    return q;
  };

  let { data, error, count } = await build(LIST_SELECT, false);
  if (error && /published_at|origin_kind|display_author_name|public_attribution|is_notice|pin/i.test(String(error.message ?? ""))) {
    const legacy = await build(LIST_SELECT_LEGACY, true);
    data = legacy.data;
    error = legacy.error;
    count = legacy.count;
  }
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const raw = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const identityMap = await loadAdminMemberIdentityMap(
    sb,
    raw.map((row) => String(row.user_id ?? ""))
  );

  const posts = raw.map((r) => {
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
  return NextResponse.json({ ok: true, posts, total: typeof count === "number" ? count : null, limit, offset });
}
