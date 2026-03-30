import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import {
  getNeighborhoodDevSamplePost,
  getNeighborhoodDevSamplePostViewCount,
  incrementNeighborhoodDevSamplePostView,
} from "@/lib/neighborhood/dev-sample-data";

const VIEW_COUNT_COOLDOWN_MS = 60_000;
const viewHitMap = new Map<string, number>();

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.trim() ?? "";
  if (fwd) {
    const [first] = fwd.split(",");
    const ip = first?.trim();
    if (ip) return ip;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function shouldCountView(key: string): boolean {
  const now = Date.now();
  const last = viewHitMap.get(key) ?? 0;
  if (now - last < VIEW_COUNT_COOLDOWN_MS) return false;
  viewHitMap.set(key, now);

  if (viewHitMap.size > 5000) {
    for (const [k, at] of viewHitMap) {
      if (now - at > VIEW_COUNT_COOLDOWN_MS * 5) {
        viewHitMap.delete(k);
      }
    }
  }
  return true;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return NextResponse.json({ ok: false }, { status: 404 });
    const viewerId = await getOptionalAuthenticatedUserId();
    const actorKey = viewerId ? `u:${viewerId}` : `ip:${getClientIp(req)}`;
    if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(id)) {
      if (!shouldCountView(`post:${id}:${actorKey}`)) {
        return NextResponse.json({
          ok: true,
          view_count: getNeighborhoodDevSamplePostViewCount(id) ?? 0,
          deduped: true,
          fallback: "dev_samples",
        });
      }
      return NextResponse.json({
        ok: true,
        view_count: incrementNeighborhoodDevSamplePostView(id) ?? 0,
        fallback: "dev_samples",
      });
    }
    const sb = getSupabaseServer();
    if (!shouldCountView(`post:${id}:${actorKey}`)) {
      const { data: row } = await sb.from("community_posts").select("view_count").eq("id", id).maybeSingle();
      const vc = Number((row as { view_count?: number } | null)?.view_count ?? 0);
      return NextResponse.json({ ok: true, view_count: vc, deduped: true });
    }

    const { data: rpcData, error: rpcErr } = await sb.rpc("increment_community_post_view_count", { post_id: id });
    if (!rpcErr && rpcData != null && typeof rpcData === "number") {
      if (rpcData < 0) return NextResponse.json({ ok: false }, { status: 404 });
      return NextResponse.json({ ok: true, view_count: rpcData });
    }

    const { data: row } = await sb.from("community_posts").select("view_count").eq("id", id).maybeSingle();
    const vc = Number((row as { view_count?: number } | null)?.view_count ?? 0);
    await sb.from("community_posts").update({ view_count: vc + 1 }).eq("id", id);
    return NextResponse.json({ ok: true, view_count: vc + 1 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
