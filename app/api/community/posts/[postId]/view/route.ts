import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return NextResponse.json({ ok: false }, { status: 404 });
    const sb = getSupabaseServer();
    const { data: row } = await sb.from("community_posts").select("view_count").eq("id", id).maybeSingle();
    const vc = Number((row as { view_count?: number } | null)?.view_count ?? 0);
    await sb.from("community_posts").update({ view_count: vc + 1 }).eq("id", id);
    return NextResponse.json({ ok: true, view_count: vc + 1 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
