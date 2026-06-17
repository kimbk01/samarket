import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";
import { isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";
import {
  getNeighborhoodDevSamplePost,
  toggleNeighborhoodDevSamplePostLike,
} from "@/lib/neighborhood/dev-sample-data";
import { notifyCommunityPostLikeReceived } from "@/lib/notifications/community-social-inapp-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertPostEngagementAllowed(sb: ReturnType<typeof getSupabaseServer>, postId: string, userId: string) {
  const { data: postRow } = await sb
    .from("community_posts")
    .select("user_id, status, is_deleted, is_hidden")
    .eq("id", postId)
    .maybeSingle();
  const post = postRow as Record<string, unknown> | null;
  if (!post?.user_id) return { ok: false as const, status: 404, error: "not_found" };
  const authorId = String(post.user_id);
  const visible = isCommunityPostPubliclyVisible(post as never) || authorId === userId;
  if (!visible) return { ok: false as const, status: 404, error: "not_found" };
  if (await isBlockedEitherWay(userId, authorId)) {
    return { ok: false as const, status: 403, error: "community_like_blocked_relation" };
  }
  return { ok: true as const, authorId };
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(id)) {
      const next = toggleNeighborhoodDevSamplePostLike(id, auth.userId);
      if (!next) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      return NextResponse.json({ ok: true, liked: next.liked, like_count: next.like_count, fallback: "dev_samples" });
    }
    const sb = getSupabaseServer();
    const gate = await assertPostEngagementAllowed(sb, id, auth.userId);
    if (!gate.ok) {
      const msg =
        gate.error === "community_like_blocked_relation" ? "차단 관계에서는 공감할 수 없습니다." : gate.error;
      return NextResponse.json({ ok: false, error: msg, code: gate.error }, { status: gate.status });
    }

    const { data: ex } = await sb
      .from("community_post_likes")
      .select("id")
      .eq("post_id", id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    const liked = !ex;
    if (ex) {
      const { error: delErr } = await sb
        .from("community_post_likes")
        .delete()
        .eq("post_id", id)
        .eq("user_id", auth.userId);
      if (delErr) {
        return NextResponse.json({ ok: false, error: delErr.message ?? "like_failed" }, { status: 500 });
      }
    } else {
      const { error: insErr } = await sb
        .from("community_post_likes")
        .insert({ post_id: id, user_id: auth.userId });
      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message ?? "like_failed" }, { status: 500 });
      }
    }
    const { data: postAfter } = await sb.from("community_posts").select("like_count").eq("id", id).maybeSingle();
    const likeCount = Number((postAfter as { like_count?: number } | null)?.like_count ?? 0);

    if (liked && gate.authorId) {
      void notifyCommunityPostLikeReceived(sb, {
        postId: id,
        postAuthorUserId: gate.authorId,
        likerUserId: auth.userId,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, liked, like_count: likeCount });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
