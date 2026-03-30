import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import {
  getNeighborhoodDevSamplePost,
  toggleNeighborhoodDevSamplePostLike,
} from "@/lib/neighborhood/dev-sample-data";

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
    const { data: ex } = await sb
      .from("community_post_likes")
      .select("id")
      .eq("post_id", id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    const liked = !ex;
    if (ex) {
      await sb.from("community_post_likes").delete().eq("post_id", id).eq("user_id", auth.userId);
    } else {
      await sb.from("community_post_likes").insert({ post_id: id, user_id: auth.userId });
    }
    const { count } = await sb
      .from("community_post_likes")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id);
    return NextResponse.json({
      ok: true,
      liked,
      like_count: count ?? 0,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
