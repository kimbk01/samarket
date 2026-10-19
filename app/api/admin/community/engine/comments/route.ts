import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { collectCommunityPostIdsForTopicSlug } from "@/lib/admin-community/collect-post-ids-for-topic";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";
import { communityAdminStartOfTodayIso } from "@/lib/admin-community/home-summary";
import { resolveCommunityCommentRowKind } from "@/lib/community-feed/community-report-display-target";
import {
  COMMENT_STATUSES,
  COMMUNITY_LIST_PROFILE_MATCH_LIMIT,
  buildCommunitySearchOr,
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
 * Known: topic filter IN≤500 — preserved P2/PERF, not fixed here.
 * q: 댓글 내용 ilike · 작성자 닉네임(→ user id) · UUID 면 댓글 id/post_id/user_id 정확 일치.
 * status=active|hidden|deleted · limit(기본 50, 최대 200) · offset
 * → { ok, comments, total, limit, offset, topicFilterTruncated }
 */
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

  let postIdsForTopic: string[] | null = null;
  let topicFilterTruncated = false;
  if (topicSlug && !commentId) {
    try {
      const collected = await collectCommunityPostIdsForTopicSlug(sb, topicSlug);
      postIdsForTopic = collected.ids;
      topicFilterTruncated = collected.truncated;
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }
    if (!postIdsForTopic.length) {
      return empty();
    }
  }

  let reportedCommentIds: string[] | null = null;
  if (reportedFilter === "1" || reportedFilter === "true" || reportedFilter === "only") {
    const { data: reportRows, error: reportErr } = await sb
      .from("community_reports")
      .select("target_id")
      .eq("target_type", "comment")
      .in("status", ["open", "reviewing"]);
    if (reportErr) {
      return NextResponse.json({ ok: false, error: reportErr.message }, { status: 500 });
    }
    reportedCommentIds = [
      ...new Set(
        (reportRows ?? [])
          .map((r) => String((r as { target_id?: string }).target_id ?? "").trim())
          .filter(Boolean)
      ),
    ];
    if (!reportedCommentIds.length) {
      return empty();
    }
  }

  // 작성자 닉네임 검색 → profiles id 후보
  let matchedAuthorIds: string[] = [];
  if (!commentId && search.pattern && !search.uuid) {
    const { data: profs, error: pErr } = await sb
      .from("profiles")
      .select("id")
      .ilike("nickname", search.pattern)
      .limit(COMMUNITY_LIST_PROFILE_MATCH_LIMIT);
    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    matchedAuthorIds = ((profs ?? []) as Array<{ id?: string }>).map((p) => String(p.id ?? "")).filter(Boolean);
  }

  let q = sb
    .from("community_comments")
    .select(
      "id, post_id, parent_id, user_id, content, status, like_count, is_hidden, is_deleted, created_at, updated_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (commentId) {
    q = q.eq("id", commentId).limit(1);
  } else {
    q = q.range(offset, offset + limit - 1);
    if (postId) q = q.eq("post_id", postId);
    if (postIdsForTopic) {
      if (postIdsForTopic.length <= 200) {
        q = q.in("post_id", postIdsForTopic);
      } else {
        q = q.in("post_id", postIdsForTopic.slice(0, 500));
        if (postIdsForTopic.length > 500) topicFilterTruncated = true;
      }
    }
    if (userId) q = q.eq("user_id", userId);
    if (status) q = q.eq("status", status);
    if (createdFrom) q = q.gte("created_at", createdFrom);
    if (createdTo) q = q.lte("created_at", createdTo);
    if (typeFilter === "comment") q = q.is("parent_id", null);
    if (typeFilter === "reply") q = q.not("parent_id", "is", null);
    if (reportedCommentIds) {
      if (reportedCommentIds.length <= 200) {
        q = q.in("id", reportedCommentIds);
      } else {
        q = q.in("id", reportedCommentIds.slice(0, 500));
      }
    }
    const searchOr = buildCommunitySearchOr({
      search,
      textColumns: ["content"],
      userColumn: "user_id",
      matchedUserIds: matchedAuthorIds,
      uuidColumns: ["id", "post_id", "user_id"],
    });
    if (searchOr) q = q.or(searchOr);
  }

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
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
    total: typeof count === "number" ? count : null,
    limit,
    offset,
    topicFilterTruncated: topicFilterTruncated || false,
  });
}
