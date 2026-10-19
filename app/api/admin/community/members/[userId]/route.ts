/**
 * GET /api/admin/community/members/{userId} — 작성자 시트 (설계 §C-10). 읽기 전용.
 * query: limit(구역별 최근 행 수, 기본 20 · 최대 50)
 * → { ok, userId, profile, summary, posts, comments, reportsReceived, reportsMade, sanctions, points, promotions, sectionErrors }
 *   구역 값이 null = 「확인 불가」 (0/빈 목록으로 대체하지 않는다).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { communityAdminUuidOrNull } from "@/lib/admin/community-admin/community-admin-period";
import { COMMUNITY_POINT_RELATED_TYPES } from "@/lib/admin/community-admin/community-admin-read-contract";
import { communityReadError } from "@/lib/admin/community-admin/community-admin-read-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 받은 신고 조회 시 대상 id 목록 상한 (PostgREST URL 길이 보호) */
const TARGET_ID_CAP = 200;

type Res<T> = { data: T | null; error: { message?: string } | null };

export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const gate = await requireCommunityAdmin("read");
  if (!gate.ok) return gate.response;
  const { userId: raw } = await ctx.params;
  const userId = communityAdminUuidOrNull(raw);
  if (!userId) return communityReadError("invalid_user_id", 400);
  const limRaw = Math.floor(Number(req.nextUrl.searchParams.get("limit")));
  const limit = Number.isFinite(limRaw) && limRaw > 0 ? Math.min(limRaw, 50) : 20;

  const sb = gate.sb;
  const sectionErrors: string[] = [];
  const take = <T,>(name: string, r: Res<T>): T | null => {
    if (r.error) {
      sectionErrors.push(`${name}:${r.error.message ?? "error"}`);
      return null;
    }
    return r.data;
  };
  const countOf = async (name: string, run: () => PromiseLike<{ count: number | null; error: { message?: string } | null }>) => {
    try {
      const { count, error } = await run();
      if (error) {
        sectionErrors.push(`${name}:${error.message ?? "error"}`);
        return null;
      }
      return typeof count === "number" ? count : 0;
    } catch (e) {
      sectionErrors.push(`${name}:${e instanceof Error ? e.message : "error"}`);
      return null;
    }
  };
  const head = { count: "exact" as const, head: true };

  const [profileRes, principalRes, postIdsRes, commentIdsRes] = await Promise.all([
    sb
      .from("profiles")
      .select("id, nickname, username, dibay_id, avatar_url, created_at, status, member_status, points")
      .eq("id", userId)
      .maybeSingle(),
    sb.from("community_import_principal").select("user_id").eq("user_id", userId).maybeSingle(),
    sb.from("community_posts").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(TARGET_ID_CAP),
    sb
      .from("community_comments")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(TARGET_ID_CAP),
  ]);
  const profile = take("profile", profileRes as Res<Record<string, unknown>>);
  if (!profileRes.error && !profile) return communityReadError("not_found", 404);
  const isImportPrincipal = Boolean((principalRes as Res<unknown>).data);

  const postIds = ((take("post_ids", postIdsRes as Res<{ id: string }[]>) ?? []) as { id: string }[]).map((r) => r.id);
  const commentIds = ((take("comment_ids", commentIdsRes as Res<{ id: string }[]>) ?? []) as { id: string }[]).map(
    (r) => r.id
  );
  const receivedOr = [
    `and(target_type.eq.user,target_id.eq.${userId})`,
    ...(postIds.length ? [`and(target_type.eq.post,target_id.in.(${postIds.join(",")}))`] : []),
    ...(postIds.length ? [`and(target_type.is.null,post_id.in.(${postIds.join(",")}))`] : []),
    ...(commentIds.length ? [`and(target_type.eq.comment,target_id.in.(${commentIds.join(",")}))`] : []),
  ].join(",");

  const nowIso = new Date().toISOString();
  const [
    postsTotal,
    postsActive,
    postsHidden,
    postsDeleted,
    commentsTotal,
    commentsHidden,
    commentsDeleted,
    reportsReceivedCount,
    reportsMadeCount,
    postsRes,
    commentsRes,
    receivedRes,
    madeRes,
    sanctionsRes,
    pointsRes,
    promoRes,
  ] = await Promise.all([
    countOf("posts_total", () => sb.from("community_posts").select("id", head).eq("user_id", userId)),
    countOf("posts_active", () => sb.from("community_posts").select("id", head).eq("user_id", userId).eq("status", "active")),
    countOf("posts_hidden", () => sb.from("community_posts").select("id", head).eq("user_id", userId).eq("status", "hidden")),
    countOf("posts_deleted", () =>
      sb.from("community_posts").select("id", head).eq("user_id", userId).eq("status", "deleted")
    ),
    countOf("comments_total", () => sb.from("community_comments").select("id", head).eq("user_id", userId)),
    countOf("comments_hidden", () =>
      sb.from("community_comments").select("id", head).eq("user_id", userId).eq("status", "hidden")
    ),
    countOf("comments_deleted", () =>
      sb.from("community_comments").select("id", head).eq("user_id", userId).eq("status", "deleted")
    ),
    countOf("reports_received", () => sb.from("community_reports").select("id", head).or(receivedOr)),
    countOf("reports_made", () => sb.from("community_reports").select("id", head).eq("user_id", userId)),
    sb
      .from("community_posts")
      .select("id, title, status, origin_kind, topic_slug, report_count, comment_count, created_at, published_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    sb
      .from("community_comments")
      .select("id, post_id, parent_id, content, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    sb
      .from("community_reports")
      .select("id, target_type, target_id, post_id, user_id, reason, status, created_at, processed_at")
      .or(receivedOr)
      .order("created_at", { ascending: false })
      .limit(limit),
    sb
      .from("community_reports")
      .select("id, target_type, target_id, post_id, reason, status, created_at, processed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    sb.from("sanctions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
    sb
      .from("point_ledger")
      .select("*")
      .eq("user_id", userId)
      .in("related_type", [...COMMUNITY_POINT_RELATED_TYPES])
      .order("created_at", { ascending: false })
      .limit(limit),
    sb
      .from("point_promotion_orders")
      .select("id, target_type, target_id, target_title, placement, duration_days, point_cost, order_status, start_at, end_at, created_at")
      .eq("user_id", userId)
      .eq("domain", "community")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const sanctions = take("sanctions", sanctionsRes as Res<Record<string, unknown>[]>);
  const activeRestrictions =
    sanctions == null
      ? null
      : sanctions.filter(
          (s) =>
            s.scope === "community" &&
            s.sanction_type === "community_restriction" &&
            !s.revoked_at &&
            (!s.end_at || String(s.end_at) > nowIso)
        );
  const comments = take("comments", commentsRes as Res<Record<string, unknown>[]>);

  return NextResponse.json({
    ok: true,
    userId,
    isImportPrincipal,
    profile,
    summary: {
      posts: { total: postsTotal, active: postsActive, hidden: postsHidden, deleted: postsDeleted },
      comments: { total: commentsTotal, hidden: commentsHidden, deleted: commentsDeleted },
      reportsReceived: reportsReceivedCount,
      /** 받은 신고는 최근 글·댓글 각 200건 기준 */
      reportsReceivedTargetCap: TARGET_ID_CAP,
      reportsMade: reportsMadeCount,
      activeRestrictions,
      warningCount:
        sanctions == null ? null : sanctions.filter((s) => s.scope === "community" && s.sanction_type === "warning").length,
    },
    posts: take("posts", postsRes as Res<Record<string, unknown>[]>),
    comments:
      comments == null
        ? null
        : comments.map((c) => ({ ...c, content: typeof c.content === "string" ? c.content.slice(0, 200) : c.content })),
    reportsReceived: take("reports_received_rows", receivedRes as Res<Record<string, unknown>[]>),
    reportsMade: take("reports_made_rows", madeRes as Res<Record<string, unknown>[]>),
    sanctions,
    points: take("points", pointsRes as Res<Record<string, unknown>[]>),
    promotions: take("promotions", promoRes as Res<Record<string, unknown>[]>),
    sectionErrors,
  });
}
