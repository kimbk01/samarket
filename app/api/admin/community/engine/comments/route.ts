import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";
import { communityAdminStartOfTodayIso } from "@/lib/admin-community/home-summary";
import { resolveCommunityCommentRowKind } from "@/lib/community-feed/community-report-display-target";
import {
  COMMENT_STATUSES,
  isCommunityListUuid,
  parseCommunityListPage,
  parseCommunityListSearch,
  pickAllowed,
} from "@/lib/admin/community-admin/community-list-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community/engine/comments
 * Authority: community_comments only (not trade `comments`).
 * Supports commentId locator, type (comment|reply), reported filter.
 * q: 댓글 내용 ilike · 작성자 닉네임 · UUID 면 댓글 id/post_id/user_id 정확 일치.
 * status=active|hidden|deleted · limit(기본 50, 최대 200) · offset
 * → { ok, comments, total, limit, offset, topicFilterTruncated }
 * R7: 목록 필터(글·주제·작성자·상태·기간·종류·신고 대기·검색)·정렬(created_at DESC, id DESC)·페이지·total 은
 *     DB RPC `admin_community_comments_page` 한 번 — 예전 주제 글 id 500·신고 댓글 id 500·닉네임 후보 200 상한 없음.
 *     `topicFilterTruncated` 는 응답 모양 호환용(항상 false).
 */
const COMMENTS_PAGE_RPC = "admin_community_comments_page";
const COMMENT_ROW_SELECT =
  "id, post_id, parent_id, user_id, content, status, like_count, is_hidden, is_deleted, created_at, updated_at";

export async function GET(req: NextRequest) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  const commentId = sp.get("commentId")?.trim() || "";
  const postId = sp.get("postId")?.trim() || "";
  const topicSlug = sp.get("topicSlug")?.trim().toLowerCase() || "";
  const userId = sp.get("userId")?.trim() || "";
  const status = pickAllowed(sp.get("status"), COMMENT_STATUSES);
  const search = parseCommunityListSearch(sp.get("q"));
  const period = sp.get("period")?.trim().toLowerCase() || "";
  const typeFilter = sp.get("type")?.trim().toLowerCase() || "";
  const reportedFilter = sp.get("reported")?.trim().toLowerCase() || "";
  let createdFrom = sp.get("createdFrom")?.trim() || "";
  const createdTo = sp.get("createdTo")?.trim() || "";
  if (period === "today" && !createdFrom) {
    createdFrom = communityAdminStartOfTodayIso();
  }
  const { limit, offset } = parseCommunityListPage(sp);
  const empty = () =>
    NextResponse.json({ ok: true, comments: [], total: 0, limit, offset, topicFilterTruncated: false });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let rows: Array<Record<string, unknown>>;
  let total: number | null;
  if (commentId) {
    const { data, error, count } = await sb
      .from("community_comments")
      .select(COMMENT_ROW_SELECT, { count: "exact" })
      .eq("id", commentId)
      .limit(1);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    rows = (data ?? []) as Array<Record<string, unknown>>;
    total = typeof count === "number" ? count : null;
  } else {
    // 글·회원 id 가 UUID 가 아니면 일치하는 댓글이 없다
    if ((postId && !isCommunityListUuid(postId)) || (userId && !isCommunityListUuid(userId))) return empty();
    const reportedOnly = reportedFilter === "1" || reportedFilter === "true" || reportedFilter === "only";
    // 신고 대기 판정 = community_reports(eq("target_type", "comment") · open/reviewing) — RPC 안에서 EXISTS
    const { data: page, error: pageErr } = await sb.rpc(COMMENTS_PAGE_RPC, {
      p_post_id: postId || null,
      p_topic_slug: topicSlug || null,
      p_user_id: userId || null,
      p_status: status || null,
      p_from: createdFrom || null,
      p_to: createdTo || null,
      p_kind: typeFilter === "comment" || typeFilter === "reply" ? typeFilter : null,
      p_reported_only: reportedOnly,
      p_q_pattern: search.pattern,
      p_q_uuid: search.uuid,
      p_limit: limit,
      p_offset: offset,
    });
    if (pageErr) {
      return NextResponse.json({ ok: false, error: pageErr.message }, { status: 500 });
    }
    const res = (page ?? {}) as { total?: number; ids?: string[] };
    const ids = Array.isArray(res.ids) ? res.ids.map(String) : [];
    total = Number(res.total ?? 0);
    if (ids.length) {
      const { data, error } = await sb.from("community_comments").select(COMMENT_ROW_SELECT).in("id", ids);
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      const byId = new Map(((data ?? []) as Array<Record<string, unknown>>).map((r) => [String(r.id ?? ""), r]));
      rows = ids.map((id) => byId.get(id)).filter((r): r is Record<string, unknown> => Boolean(r));
    } else {
      rows = [];
    }
  }

  const uniquePostIds = [...new Set(rows.map((r) => String(r.post_id ?? "")).filter(Boolean))];
  const parentIds = [
    ...new Set(
      rows
        .map((r) => String(r.parent_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const commentIds = rows.map((r) => String(r.id ?? "")).filter(Boolean);

  const postMeta: Record<string, { title: string; topic_slug: string }> = {};
  if (uniquePostIds.length) {
    const { data: posts } = await sb
      .from("community_posts")
      .select("id, title, topic_slug")
      .in("id", uniquePostIds);
    for (const p of posts ?? []) {
      const row = p as { id?: string; title?: string | null; topic_slug?: string | null };
      const id = String(row.id ?? "");
      if (!id) continue;
      postMeta[id] = {
        title: String(row.title ?? ""),
        topic_slug: String(row.topic_slug ?? "").trim().toLowerCase(),
      };
    }
  }

  const parentMeta = new Map<string, { content: string; user_id: string }>();
  if (parentIds.length) {
    const { data: parents } = await sb
      .from("community_comments")
      .select("id, content, user_id")
      .in("id", parentIds);
    for (const p of parents ?? []) {
      const row = p as { id?: string; content?: string | null; user_id?: string | null };
      const id = String(row.id ?? "");
      if (!id) continue;
      parentMeta.set(id, {
        content: String(row.content ?? "").slice(0, 120),
        user_id: String(row.user_id ?? ""),
      });
    }
  }

  const reportCountByComment = new Map<string, number>();
  if (commentIds.length) {
    const { data: reportRows } = await sb
      .from("community_reports")
      .select("target_id, status")
      .eq("target_type", "comment")
      .in("target_id", commentIds);
    for (const rr of reportRows ?? []) {
      const tid = String((rr as { target_id?: string }).target_id ?? "").trim();
      if (!tid) continue;
      reportCountByComment.set(tid, (reportCountByComment.get(tid) ?? 0) + 1);
    }
  }

  const identityMap = await loadAdminMemberIdentityMap(
    sb,
    rows.map((r) => String(r.user_id ?? ""))
  );

  const comments = rows.map((r) => {
    const pid = String(r.post_id ?? "");
    const meta = postMeta[pid];
    const uid = String(r.user_id ?? "");
    const identity = uid ? identityMap.get(uid) : undefined;
    const parentId = r.parent_id != null && String(r.parent_id).trim() ? String(r.parent_id) : null;
    const kind = resolveCommunityCommentRowKind(parentId);
    const parent = parentId ? parentMeta.get(parentId) : undefined;
    const cid = String(r.id ?? "");
    const reportCount = reportCountByComment.get(cid) ?? 0;
    return {
      ...r,
      parent_id: parentId,
      kind,
      post_title: meta?.title ?? "",
      topic_slug: meta?.topic_slug ?? "",
      author_nickname: identity?.nickname ?? null,
      author_username: identity?.username ?? null,
      author_label: formatAdminMemberLabel(identity ?? null),
      parent_content_preview: parent?.content ?? null,
      report_count: reportCount,
      reported: reportCount > 0,
    };
  });

  return NextResponse.json({
    ok: true,
    comments,
    total,
    limit,
    offset,
    topicFilterTruncated: false,
  });
}
