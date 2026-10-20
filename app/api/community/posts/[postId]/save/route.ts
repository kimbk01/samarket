import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";
import { isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const sb = getSupabaseServer();
    const { data: postRow } = await sb
      .from("community_posts")
      .select("user_id, status, is_deleted, is_hidden")
      .eq("id", id)
      .maybeSingle();
    const post = postRow as Record<string, unknown> | null;
    if (!post?.user_id || !isCommunityPostPubliclyVisible(post as never)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const authorId = String(post.user_id);
    if (await isBlockedEitherWay(auth.userId, authorId)) {
      return NextResponse.json({ ok: false, error: "blocked" }, { status: 403 });
    }

    const { data: ex } = await sb
      .from("community_post_saves")
      .select("id")
      .eq("post_id", id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    const saved = !ex;
    if (ex) {
      const { error: delErr } = await sb
        .from("community_post_saves")
        .delete()
        .eq("post_id", id)
        .eq("user_id", auth.userId);
      if (delErr) {
        const msg = delErr.message ?? "";
        if (msg.includes("community_post_saves") && msg.includes("does not exist")) {
          return NextResponse.json({ ok: false, error: "migration_required" }, { status: 503 });
        }
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
    } else {
      const { error } = await sb.from("community_post_saves").insert({ post_id: id, user_id: auth.userId });
      if (error) {
        const msg = error.message ?? "";
        if (msg.includes("community_post_saves") && msg.includes("does not exist")) {
          return NextResponse.json({ ok: false, error: "migration_required" }, { status: 503 });
        }
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, saved });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

/**
 * DELETE — 본인 저장 해제 전용(최종 설계 C.0.3 A6 · S27). POST 토글 규칙은 불변.
 * - 본인 행 삭제는 글 공개 여부(숨김·삭제)·차단 관계와 무관하게 허용(v2 D12).
 * - 행이 없어도 200(멱등). 다른 회원의 행에는 영향 없음(`user_id = 세션`).
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const id = (await resolveCanonicalCommunityPostId(raw)) ?? raw;
    const sb = getSupabaseServer();
    const { error: delErr } = await sb
      .from("community_post_saves")
      .delete()
      .eq("post_id", id)
      .eq("user_id", auth.userId);
    if (delErr) {
      const msg = delErr.message ?? "";
      if (msg.includes("community_post_saves") && msg.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: "migration_required" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: "unsave_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, saved: false });
  } catch {
    return NextResponse.json({ ok: false, error: "unsave_failed" }, { status: 500 });
  }
}
