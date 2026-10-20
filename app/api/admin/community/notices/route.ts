import { NextRequest, NextResponse } from "next/server";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { ADMIN_LIST_MAX_OFFSET } from "@/lib/admin/pagination/parse-admin-list-page";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import {
  COMMUNITY_NOTICE_AUTHOR_NAME,
  COMMUNITY_NOTICE_LIST_SELECT,
  parseNoticeWindow,
} from "@/lib/admin/community-admin/community-notice-admin";
import { parseCommunityPinScope, setCommunityPostPin } from "@/lib/admin/community-admin/community-post-pin";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Tab = "live" | "scheduled" | "ended";

/**
 * GET /api/admin/community/notices?tab=live|scheduled|ended[&limit=20|50|100&offset=n]
 * R7: `limit` 을 주면 서버 페이지(`total` = exact count, range) — 없으면 기존처럼 최근 100건.
 * 「게시 중」의 종료 조건도 DB 에서 거른다 (메모리 필터 시 total 과 행이 어긋나므로).
 * → { ok, tab, total, limit, offset, notices: Row[], pinned: Row[] (지금 고정된 글 — 공지 포함), pinLimits: { feed: {limit,count}, topic: {limit, counts: {topicId: n}} } }
 * Row: community_posts 필드 + author_label, pinned_by_label
 */
export async function GET(req: NextRequest) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;
  const { sb } = admin;

  const tabRaw = (req.nextUrl.searchParams.get("tab") || "live").trim();
  const tab: Tab = tabRaw === "scheduled" || tabRaw === "ended" ? tabRaw : "live";
  const now = new Date().toISOString();

  const sp = req.nextUrl.searchParams;
  const paged = sp.has("limit");
  const limit = paged ? normalizeAdminListPageSize(sp.get("limit")) : 100;
  const offRaw = Math.floor(Number(sp.get("offset") ?? 0));
  const offset = paged && Number.isFinite(offRaw) && offRaw > 0 ? Math.min(offRaw, ADMIN_LIST_MAX_OFFSET) : 0;

  let q = sb
    .from("community_posts")
    .select(COMMUNITY_NOTICE_LIST_SELECT, paged ? { count: "exact" } : undefined)
    .eq("is_notice", true);
  if (tab === "live") {
    // 시작·종료 조건 모두 DB 에서 (or 필터 1개 안에 and(or, or)).
    q = q
      .eq("status", "active")
      .or(
        `and(or(notice_starts_at.is.null,notice_starts_at.lte."${now}"),or(notice_ends_at.is.null,notice_ends_at.gt."${now}"))`
      );
  } else if (tab === "scheduled") {
    q = q.eq("status", "active").gt("notice_starts_at", now);
  } else {
    q = q.or(`notice_ends_at.lte."${now}",status.neq.active`);
  }
  const ordered = q.order("created_at", { ascending: false });
  const noticesP = paged ? ordered.range(offset, offset + limit - 1) : ordered.limit(100);
  const pinnedP = sb
    .from("community_posts")
    .select(COMMUNITY_NOTICE_LIST_SELECT)
    .not("pinned_at", "is", null)
    .eq("status", "active")
    .or(`pinned_until.is.null,pinned_until.gt."${now}"`)
    .order("pin_scope", { ascending: true })
    .order("pin_rank", { ascending: true })
    .order("pinned_at", { ascending: false })
    .limit(100);

  const [noticesRes, pinnedRes] = await Promise.all([noticesP, pinnedP]);
  if (noticesRes.error) return NextResponse.json({ ok: false, error: noticesRes.error.message }, { status: 500 });
  if (pinnedRes.error) return NextResponse.json({ ok: false, error: pinnedRes.error.message }, { status: 500 });

  const notices = (noticesRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  const total = paged ? (noticesRes as { count?: number | null }).count ?? notices.length : notices.length;
  const pinned = (pinnedRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  const ids = [...notices, ...pinned].flatMap((r) => [String(r.user_id ?? ""), String(r.pinned_by ?? "")]);
  const identityMap = await loadAdminMemberIdentityMap(sb, ids);
  const decorate = (r: Record<string, unknown>) => {
    const uid = String(r.user_id ?? "");
    const pb = String(r.pinned_by ?? "");
    return {
      ...r,
      author_label: formatAdminMemberLabel(identityMap.get(uid) ?? null),
      pinned_by_label: pb ? formatAdminMemberLabel(identityMap.get(pb) ?? null) : null,
    };
  };

  const topicCounts: Record<string, number> = {};
  let feedCount = 0;
  for (const p of pinned) {
    if (p.pin_scope === "feed") feedCount += 1;
    else if (p.pin_scope === "topic" && p.topic_id) {
      const k = String(p.topic_id);
      topicCounts[k] = (topicCounts[k] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    ok: true,
    tab,
    total,
    limit,
    offset,
    notices: notices.map(decorate),
    pinned: pinned.map(decorate),
    pinLimits: { feed: { limit: 3, count: feedCount }, topic: { limit: 2, counts: topicCounts } },
  });
}

/**
 * POST /api/admin/community/notices
 * body: { title, content, topicId, topicSlug, startsAt?: ISO|null, endsAt?: ISO|null,
 *         pin?: { scope: 'feed'|'topic', until?: ISO|null, rank?: number }, reason?: string }
 * 공지는 피드 상단(전체 피드 + 해당 카테고리)에 노출 기간 동안 표시된다. 카테고리(topic)는 DB 상 필수.
 * → 201 { ok, post, pin?: {ok, limit, count} | {ok:false, error, limit?} }
 */
export async function POST(req: NextRequest) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;
  const { sb } = admin;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  if (!content.trim()) return NextResponse.json({ ok: false, error: "content_required" }, { status: 400 });
  const topicId = typeof body.topicId === "string" ? body.topicId.trim() : "";
  const topicSlug = typeof body.topicSlug === "string" ? body.topicSlug.trim().toLowerCase() : "";
  if (!topicId || !topicSlug) return NextResponse.json({ ok: false, error: "topic_required" }, { status: 400 });

  const win = parseNoticeWindow(body.startsAt, body.endsAt);
  if (!win.ok) return NextResponse.json({ ok: false, error: win.error }, { status: 400 });

  let pinReq: { scope: "feed" | "topic"; until: string | null; rank: number } | null = null;
  if (body.pin && typeof body.pin === "object") {
    const pin = body.pin as Record<string, unknown>;
    const scope = parseCommunityPinScope(pin.scope);
    if (!scope) return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
    let until: string | null = null;
    if (typeof pin.until === "string" && pin.until.trim()) {
      const t = Date.parse(pin.until);
      if (Number.isNaN(t)) return NextResponse.json({ ok: false, error: "invalid_until" }, { status: 400 });
      until = new Date(t).toISOString();
    }
    const rank = Number(pin.rank ?? 0);
    pinReq = { scope, until, rank: Number.isFinite(rank) ? Math.max(0, Math.min(100, Math.floor(rank))) : 0 };
  }

  const { getPhilifeNeighborhoodSectionSlugServer } = await import(
    "@/lib/community-feed/philife-neighborhood-section"
  );
  const { resolveTopicMeta } = await import("@/lib/community-feed/queries");
  const { deriveCommunityPostCategoryBucket } = await import(
    "@/lib/neighborhood/derive-community-post-category-bucket"
  );
  const { summarizeCommunityPostContent } = await import("@/lib/philife/interleaved-body-markdown");
  const { COMMUNITY_PUBLIC_REGION_FALLBACK } = await import("@/lib/addresses/community-public-region-label");

  const sectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
  const meta = await resolveTopicMeta(sectionSlug, topicSlug);
  if (!meta || meta.is_feed_sort || meta.id !== topicId) {
    return NextResponse.json({ ok: false, error: "invalid_topic" }, { status: 400 });
  }
  if (meta.allow_meetup) return NextResponse.json({ ok: false, error: "meetup_topic_forbidden" }, { status: 400 });
  const { data: sec } = await sb
    .from("community_sections")
    .select("id, slug")
    .eq("slug", sectionSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (!sec) return NextResponse.json({ ok: false, error: "section_missing" }, { status: 500 });

  const insertRow = {
    user_id: admin.userId,
    section_id: (sec as { id: string }).id,
    section_slug: (sec as { slug: string }).slug,
    topic_id: meta.id,
    topic_slug: topicSlug,
    title,
    content,
    summary: summarizeCommunityPostContent(content),
    region_label: COMMUNITY_PUBLIC_REGION_FALLBACK,
    category: deriveCommunityPostCategoryBucket({ topicOrCategoryRaw: topicSlug, isMeetup: false }),
    is_question: false,
    is_meetup: false,
    status: "active",
    is_sample_data: false,
    origin_kind: "admin",
    display_author_name: COMMUNITY_NOTICE_AUTHOR_NAME,
    is_notice: true,
    notice_starts_at: win.startsAt,
    notice_ends_at: win.endsAt,
  };
  const { data: inserted, error } = await sb
    .from("community_posts")
    .insert(insertRow)
    .select(COMMUNITY_NOTICE_LIST_SELECT)
    .single();
  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });
  }
  const post = inserted as unknown as Record<string, unknown>;
  const postId = String(post.id);
  const reason = normalizeCommunityAdminReason(body.reason);

  let pinResult: Record<string, unknown> | null = null;
  if (pinReq) {
    const r = await setCommunityPostPin(sb, {
      postId,
      actorId: admin.userId,
      ...pinReq,
      reason: reason ?? "공지 고정",
    });
    pinResult = r.ok
      ? { ok: true, limit: r.limit, count: r.count }
      : { ok: false, error: r.error, ...(r.limit != null ? { limit: r.limit } : {}) };
  }

  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "community_post",
    targetId: postId,
    action: "community_notice.create",
    reason,
    before: null,
    after: { ...insertRow, pin: pinReq, pin_result: pinResult },
  });

  return NextResponse.json(
    { ok: true, post, ...(pinResult ? { pin: pinResult } : {}), auditOk: audit.ok },
    { status: 201 }
  );
}
