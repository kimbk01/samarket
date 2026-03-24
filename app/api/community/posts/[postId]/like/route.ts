import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";

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
    const { data: ex } = await sb
      .from("community_post_likes")
      .select("id")
      .eq("post_id", id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (ex) {
      await sb.from("community_post_likes").delete().eq("post_id", id).eq("user_id", auth.userId);
      const { data: p } = await sb.from("community_posts").select("like_count").eq("id", id).maybeSingle();
      return NextResponse.json({
        ok: true,
        liked: false,
        like_count: Number((p as { like_count?: number } | null)?.like_count ?? 0),
      });
    }
    await sb.from("community_post_likes").insert({ post_id: id, user_id: auth.userId });
    const { data: p } = await sb.from("community_posts").select("like_count").eq("id", id).maybeSingle();
    return NextResponse.json({
      ok: true,
      liked: true,
      like_count: Number((p as { like_count?: number } | null)?.like_count ?? 0),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
