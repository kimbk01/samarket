import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId, requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  findBannedWord,
  getCommunityFeedOps,
  getLatestCommentTimeForUser,
} from "@/lib/community-feed/community-ops-settings";
import { listCommunityPostComments, resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import {
  addNeighborhoodDevSampleComment,
  getNeighborhoodDevSampleCommentRows,
  getNeighborhoodDevSamplePost,
} from "@/lib/neighborhood/dev-sample-data";
import { fetchBlockedAuthorIdsForViewer } from "@/lib/neighborhood/social-filter";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
  safeErrorMessage,
} from "@/lib/http/api-route";
import { logServerPerf } from "@/lib/performance/samarket-perf";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const startedAt = Date.now();
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return jsonError("postId가 필요합니다.", 400);
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
    .select("id, user_id, status, is_deleted, is_hidden, location_id")
    .eq("id", id)
    .maybeSingle();
  const row = postRow as {
    id?: string;
    user_id?: string;
    status?: string;
    is_deleted?: boolean;
    is_hidden?: boolean;
    location_id?: string | null;
  } | null;
  const ownerId = String(row?.user_id ?? "");
  const viewer = viewerUserId?.trim() ?? "";
  const isOwner = viewer.length > 0 && ownerId === viewer;
  if (
    !row?.id ||
    row.is_deleted === true ||
    row.is_hidden === true ||
    String(row.location_id ?? "").trim() === "" ||
    (!isOwner && String(row.status ?? "").trim().toLowerCase() !== "active")
  ) {
    return jsonError("not_found", 404);
  }
  if (viewer.length > 0) {
    const blocked = await fetchBlockedAuthorIdsForViewer(sb, viewer);
    if (blocked.has(ownerId)) {
      return jsonError("not_found", 404);
    }
  }
  const list = await listCommunityPostComments(id);
  logServerPerf("community-comments.get", {
    postId: id,
    branch: "db",
    count: list.length,
    elapsedMs: Date.now() - startedAt,
  });
  return jsonOk({ comments: list });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-comment:create:${getRateLimitKey(req, auth.userId)}`,
    limit: 12,
    windowMs: 60_000,
    message: "댓글 작성 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_comment_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return jsonError("postId가 필요합니다.", 400);

  const parsed = await parseJsonBody<{ content?: string; parentId?: string | null }>(req, "JSON 필요");
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const content = body.content?.trim();
  if (!content) return jsonError("내용을 입력하세요.", 400);

  const ops = await getCommunityFeedOps();
  if (content.length > ops.max_comment_length) {
    return NextResponse.json(
      { ok: false, error: `댓글은 ${ops.max_comment_length}자 이하로 입력하세요.` },
      { status: 400 }
    );
  }
  if (findBannedWord(content, ops.banned_words)) {
    return jsonError("금칙어가 포함되어 있습니다.", 400);
  }

  try {
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return jsonError("글을 찾을 수 없습니다.", 404);
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
        if (!inserted) return jsonError("실패", 500);
        return jsonOk({ id: inserted.id, fallback: "dev_samples" });
      }
    }
    const sb = getSupabaseServer();

    if (ops.min_comment_interval_sec > 0) {
      const lastAt = await getLatestCommentTimeForUser(auth.userId);
      if (lastAt) {
        const diffSec = (Date.now() - new Date(lastAt).getTime()) / 1000;
        if (diffSec < ops.min_comment_interval_sec) {
          return NextResponse.json(
            { ok: false, error: `댓글은 ${ops.min_comment_interval_sec}초 간격으로만 작성할 수 있습니다.` },
            { status: 429 }
          );
        }
      }
    }
    const { data: post } = await sb
      .from("community_posts")
      .select("id, user_id, is_deleted, location_id, status, is_hidden")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();
    const prow = post as {
      id?: string;
      user_id?: string;
      is_deleted?: boolean;
      location_id?: string | null;
      status?: string;
    } | null;
    if (
      !prow?.id ||
      prow.is_deleted === true ||
      prow.status === "deleted" ||
      prow.status === "hidden" ||
      prow.location_id == null ||
      String(prow.location_id).trim() === ""
    ) {
      return jsonError("글을 찾을 수 없습니다.", 404);
    }
    const blocked = await fetchBlockedAuthorIdsForViewer(sb, auth.userId);
    if (blocked.has(String(prow.user_id ?? ""))) {
      return jsonError("차단 관계에서는 댓글을 작성할 수 없습니다.", 403);
    }

    const parentId = body.parentId?.trim() || null;
    let depth = 0;
    if (parentId) {
      const { data: prow } = await sb.from("community_comments").select("depth").eq("id", parentId).maybeSingle();
      const d = Number((prow as { depth?: number } | null)?.depth ?? 0);
      depth = Math.min(3, d + 1);
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
      return jsonError(safeErrorMessage(error, "댓글 저장에 실패했습니다."), 500, {
        code: "community_comment_insert_failed",
      });
    }
    return jsonOk({ id: (ins as { id: string }).id });
  } catch (error) {
    return jsonError(safeErrorMessage(error, "댓글 저장에 실패했습니다."), 500, {
      code: "community_comment_unexpected_error",
    });
  }
}
