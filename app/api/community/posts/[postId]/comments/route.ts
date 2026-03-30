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
import { getNeighborhoodPostDetail } from "@/lib/neighborhood/queries";
import { fetchBlockedAuthorIdsForViewer } from "@/lib/neighborhood/social-filter";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });
  const id = await resolveCanonicalCommunityPostId(raw);
  if (!id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const viewerUserId = await getOptionalAuthenticatedUserId();
  if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(id)) {
    const post = getNeighborhoodDevSamplePost(id);
    if (!post) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const rows = getNeighborhoodDevSampleCommentRows(id);
    return NextResponse.json({ ok: true, comments: rows, fallback: "dev_samples" });
  }
  const post = await getNeighborhoodPostDetail(id, { viewerUserId });
  if (!post) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const list = await listCommunityPostComments(id);
  return NextResponse.json({ ok: true, comments: list });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });

  let body: { content?: string; parentId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 필요" }, { status: 400 });
  }
  const content = body.content?.trim();
  if (!content) return NextResponse.json({ ok: false, error: "내용을 입력하세요." }, { status: 400 });

  const ops = await getCommunityFeedOps();
  if (content.length > ops.max_comment_length) {
    return NextResponse.json(
      { ok: false, error: `댓글은 ${ops.max_comment_length}자 이하로 입력하세요.` },
      { status: 400 }
    );
  }
  if (findBannedWord(content, ops.banned_words)) {
    return NextResponse.json({ ok: false, error: "금칙어가 포함되어 있습니다." }, { status: 400 });
  }

  try {
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
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
        if (!inserted) return NextResponse.json({ ok: false, error: "실패" }, { status: 500 });
        return NextResponse.json({ ok: true, id: inserted.id, fallback: "dev_samples" });
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
      return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
    }
    const blocked = await fetchBlockedAuthorIdsForViewer(sb, auth.userId);
    if (blocked.has(String(prow.user_id ?? ""))) {
      return NextResponse.json({ ok: false, error: "차단 관계에서는 댓글을 작성할 수 없습니다." }, { status: 403 });
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
      return NextResponse.json({ ok: false, error: error?.message ?? "실패" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: (ins as { id: string }).id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
