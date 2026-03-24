import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  findBannedWord,
  getCommunityFeedOps,
  getLatestCommentTimeForUser,
} from "@/lib/community-feed/community-ops-settings";
import { listCommunityPostComments, resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });
  const id = await resolveCanonicalCommunityPostId(raw);
  if (!id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
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
    const sb = getSupabaseServer();
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });

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
    const { data: post } = await sb.from("community_posts").select("id").eq("id", id).eq("is_hidden", false).maybeSingle();
    if (!post) return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });

    const parentId = body.parentId?.trim() || null;
    const { data: ins, error } = await sb
      .from("community_comments")
      .insert({
        post_id: id,
        user_id: auth.userId,
        content,
        parent_id: parentId,
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
