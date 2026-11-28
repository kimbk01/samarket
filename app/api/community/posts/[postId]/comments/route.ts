import { NextRequest } from "next/server";
import { assertCommunityWriteAllowed } from "@/lib/community/community-write-restriction";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session-require";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getCommunityCommentMaxLengthCached,
  getCommunityFeedOps,
  getLatestCommentTimeForUser,
} from "@/lib/community-feed/community-ops-settings";
import { guardBannedWords } from "@/lib/community-feed/banned-word-guard.server";
import { listCommunityPostComments, resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import {
  addNeighborhoodDevSampleComment,
  getNeighborhoodDevSampleCommentRows,
  getNeighborhoodDevSamplePost,
} from "@/lib/neighborhood/dev-sample-data";
import { fetchBlockedAuthorIdsForViewer } from "@/lib/neighborhood/social-filter";
import { fetchBlockDirectionsForViewerSb } from "@/lib/social/user-block-ssot";
import { tagSupabaseCallRequest } from "@/lib/perf/supabase-call-counter";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
  safeErrorMessage,
} from "@/lib/http/api-route";
import { logServerPerf } from "@/lib/performance/samarket-perf";
import { bumpNotificationTarget } from "@/lib/notifications/notification-targets";
import { notifyCommunityPostCommentReceived } from "@/lib/notifications/community-social-inapp-notify";
import {
  communityAcceptanceErrorCode,
  evaluateCommunityContentAcceptance,
} from "@/lib/community-points/content-acceptance";
import { applyCommunityPointRewardOnCommentWrite } from "@/lib/points/community-point-bridge";
import { loadCommunityImportPrincipalUserId } from "@/lib/community/community-import-principal";
import {
  isCommunityCommentPubliclyVisible,
  isCommunityPostPubliclyVisible,
} from "@/lib/community-engine/visibility";
import { COMMUNITY_COMMENT_MAX_DEPTH } from "@/lib/community/community-comment-limits";
import { keepAliveAfterResponse } from "@/lib/push/keep-alive-after-response";
import { isCommunityImportedOrigin } from "@/lib/community/community-post-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 오류는 코드만(`error`=`code`) + 값은 `params` — 문구는 화면이 `COMMUNITY_COMMENT_ERROR_KEYS` 로 고른다
 * (재감사 2026-11-27 · `docs/i18n-ssot.md` §3-3). DB 원문은 로그로만.
 */
function commentError(code: string, status: number, params?: Record<string, number | string>) {
  return jsonError(code, { status, code }, params ? { params } : {});
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  /** 요청 예산 — 목록 읽기(GET)와 쓰기(POST)를 따로 센다. 셈만 · 동작 무관 (값은 7일 실측 뒤) */
  tagSupabaseCallRequest("get");
  const startedAt = Date.now();
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return jsonError("post_id_required", { status: 400, code: "post_id_required" });
  const id = await resolveCanonicalCommunityPostId(raw);
  if (!id) return jsonError("not_found", 404);
  const viewerUserId = await getOptionalAuthenticatedUserId();
  if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(id)) {
    const post = getNeighborhoodDevSamplePost(id);
    if (!post) return jsonError("not_found", 404);
    const rows = getNeighborhoodDevSampleCommentRows(id);
    logServerPerf("community-comments.get", {
      postId: id,
      branch: "dev_samples",
      count: rows.length,
      elapsedMs: Date.now() - startedAt,
    });
    return jsonOk({ comments: rows, fallback: "dev_samples" });
  }
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("server_config", 500);
  }
  const { data: postRow } = await sb
    .from("community_posts")
    .select("id, user_id, status, is_deleted, is_hidden, origin_kind")
    .eq("id", id)
    .maybeSingle();
  const row = postRow as {
    origin_kind?: string | null;
    id?: string;
    user_id?: string;
    status?: string;
    is_deleted?: boolean;
    is_hidden?: boolean;
  } | null;
  const ownerId = String(row?.user_id ?? "");
  const viewer = viewerUserId?.trim() ?? "";
  const isOwner = viewer.length > 0 && ownerId === viewer;
  // Align with like engagement: identity = community_posts.id; do not treat missing location_id as not_found.
  if (!row?.id || (!isOwner && !isCommunityPostPubliclyVisible(row))) {
    return jsonError("not_found", 404);
  }
  /**
   * 차단 방향을 이 요청에서 한 번 새로 읽어 글 작성자 차단 확인과 댓글 자리 표시가 같이 쓴다 (후속 C3).
   * 캐시하지 않는다 — 차단 직후 다시 읽을 때 바로 자리 표시가 바뀌어야 한다(재감사 2026-11-28).
   */
  const blockDirs = viewer.length > 0 ? await fetchBlockDirectionsForViewerSb(sb, viewer) : null;
  if (blockDirs && (blockDirs.blockedByMe.has(ownerId) || blockDirs.blockedMe.has(ownerId))) {
    return jsonError("not_found", 404);
  }
  let list: Awaited<ReturnType<typeof listCommunityPostComments>>;
  try {
    /** 가져온 글의 `user_id` 는 가져오기 계정 — 「작성자」 배지를 붙이지 않는다 */
    const postAuthorUserId = isCommunityImportedOrigin(row.origin_kind) ? null : ownerId;
    list = await listCommunityPostComments(id, viewerUserId, {
      postAuthorUserId,
      ...(blockDirs ? { blocks: blockDirs } : {}),
    });
  } catch (error) {
    /** 조회 실패를 빈 목록으로 감추지 않는다 — 화면이 재시도 버튼을 보인다 (감사 L12) */
    console.error("[community-comments GET] list failed", safeErrorMessage(error, "unexpected"));
    return commentError("comments_load_failed", 500);
  }
  const maxLength = await getCommunityCommentMaxLengthCached();
  logServerPerf("community-comments.get", {
    postId: id,
    branch: "db",
    count: list.comments.length,
    elapsedMs: Date.now() - startedAt,
  });
  return jsonOk({ comments: list.comments, count: list.count, max_length: maxLength });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  tagSupabaseCallRequest("post");
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  // 커뮤니티 활동 제한 (§E-6)
  const restricted = await assertCommunityWriteAllowed(auth.userId, "comment");
  if (restricted) return restricted;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("server_config", 500);
  }

  const signupGate = await requireSignupCompleteForUser(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId
  );
  if (!signupGate.ok) return signupGate.response;

  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId,
    "community_comment"
  );
  if (!profileGate.ok) return profileGate.response;

  const rateLimit = await enforceRateLimit({
    key: `community-comment:create:${getRateLimitKey(req, auth.userId)}`,
    limit: 12,
    windowMs: 60_000,
    message: "community_comment_rate_limited",
    code: "community_comment_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return commentError("post_id_required", 400);

  const parsed = await parseJsonBody<{ content?: string; parentId?: string | null }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const content = body.content?.trim();
  if (!content) return commentError("content_required", 400);
  const accepted = evaluateCommunityContentAcceptance(content, "comment");
  if (!accepted.ok) {
    return commentError(communityAcceptanceErrorCode(accepted.code), 400);
  }

  const ops = await getCommunityFeedOps();
  if (content.length > ops.max_comment_length) {
    return commentError("comment_too_long", 400, { max: ops.max_comment_length });
  }
  const filtered = await guardBannedWords({
    userId: auth.userId,
    surface: "community_comment",
    texts: [content],
    operatorWords: ops.banned_words,
    acceptLanguage: req.headers.get("accept-language"),
  });
  if (!filtered.ok) return commentError(filtered.code, filtered.status);

  try {
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return commentError("post_not_found", 404);
    if (process.env.NODE_ENV !== "production") {
      const post = getNeighborhoodDevSamplePost(id);
      if (post) {
        const inserted = addNeighborhoodDevSampleComment({
          postId: id,
          userId: auth.userId,
          authorName: auth.userId.slice(0, 8),
          content,
          parentId: body.parentId ?? null,
        });
        if (!inserted) return commentError("community_comment_insert_failed", 500);
        return jsonOk({ id: inserted.id, fallback: "dev_samples" });
      }
    }
    const sbAny = sb;

    if (ops.min_comment_interval_sec > 0) {
      const lastAt = await getLatestCommentTimeForUser(auth.userId);
      if (lastAt) {
        const diffSec = (Date.now() - new Date(lastAt).getTime()) / 1000;
        if (diffSec < ops.min_comment_interval_sec) {
          return commentError("comment_interval", 429, { sec: ops.min_comment_interval_sec });
        }
      }
    }
    const { data: post, error: postErr } = await sb
      .from("community_posts")
      .select("id, user_id, is_deleted, status, is_hidden")
      .eq("id", id)
      .maybeSingle();
    if (postErr) {
      console.error("[community-comments POST] post read failed", postErr.message);
      return commentError("post_not_found", 500);
    }
    const prow = post as {
      id?: string;
      user_id?: string;
      is_deleted?: boolean;
      status?: string;
      is_hidden?: boolean;
    } | null;
    // Same existence contract as like (`assertPostEngagementAllowed`): public visibility only.
    // Missing location_id must not fake not_found for a real community_posts.id (incl. imported).
    if (!prow?.id || !isCommunityPostPubliclyVisible(prow)) {
      return commentError("post_not_found", 404);
    }
    const blocked = await fetchBlockedAuthorIdsForViewer(sb, auth.userId);
    if (blocked.has(String(prow.user_id ?? ""))) {
      return commentError("community_comment_blocked_relation", 403);
    }

    const parentId = body.parentId?.trim() || null;
    let depth = 0;
    let parentCommentAuthorId: string | null = null;
    if (parentId) {
      const { data: parentRow } = await sb
        .from("community_comments")
        .select("user_id, post_id, depth, status, is_hidden, is_deleted")
        .eq("id", parentId)
        .maybeSingle();
      parentCommentAuthorId = String((parentRow as { user_id?: string } | null)?.user_id ?? "").trim() || null;
      const parentPostId = String((parentRow as { post_id?: string } | null)?.post_id ?? "").trim();
      /** 삭제·숨김 댓글에는 답글을 달 수 없다 (CM-R-01) */
      const parentVisible =
        parentRow != null &&
        isCommunityCommentPubliclyVisible(parentRow as never) &&
        (parentRow as { is_deleted?: boolean }).is_deleted !== true;
      if (!parentCommentAuthorId || parentPostId !== id || !parentVisible) {
        return commentError("community_comment_parent_not_found", 404);
      }
      if (blocked.has(parentCommentAuthorId)) {
        return commentError("community_comment_blocked_relation", 403);
      }
      const d = Number((parentRow as { depth?: number } | null)?.depth ?? 0);
      /** 답글 깊이 상한 = DB depth 3 — 화면과 데이터가 어긋나지 않게 초과는 거부 (CM-R-10) */
      if (d >= COMMUNITY_COMMENT_MAX_DEPTH) {
        return commentError("community_comment_depth_limit", 400);
      }
      depth = d + 1;
    }
    const { data: ins, error } = await sb
      .from("community_comments")
      .insert({
        post_id: id,
        user_id: auth.userId,
        content,
        parent_id: parentId,
        depth,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !ins) {
      console.error("[community-comments POST] insert failed", error?.message ?? "no_row");
      return commentError("community_comment_insert_failed", 500);
    }
    const postAuthorId = String(prow.user_id ?? "").trim();
    const principalId = await loadCommunityImportPrincipalUserId(sb);
    const recipientIsRealMember = Boolean(
      postAuthorId && (!principalId || postAuthorId !== principalId)
    );
    const commentId = (ins as { id: string }).id;
    if (postAuthorId && postAuthorId !== auth.userId && recipientIsRealMember) {
      void bumpNotificationTarget(sb, {
        userId: postAuthorId,
        targetType: "community_post",
        targetId: id,
        scope: "consumer",
        actorUserId: auth.userId,
      });
    }
    keepAliveAfterResponse(notifyCommunityPostCommentReceived(sb, {
      postId: id,
      postAuthorUserId: recipientIsRealMember ? postAuthorId : "",
      commenterUserId: auth.userId,
      commentPreview: content,
      commentId,
      parentCommentAuthorUserId: parentCommentAuthorId,
    }).catch(() => {}));
    await applyCommunityPointRewardOnCommentWrite({
      userId: auth.userId,
      postId: id,
      commentId,
      content,
    });
    return jsonOk({ id: commentId });
  } catch (error) {
    console.error("[community-comments POST] unexpected", safeErrorMessage(error, "unexpected"));
    return commentError("community_comment_unexpected_error", 500);
  }
}
