import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { COMMUNITY_CRAWL_REAL_CRAWL_AVAILABLE } from "@/lib/community-crawler/crawl-ssot";
import { enrichCommunityCrawlItemsForAdmin } from "@/lib/community-crawler/admin-item-ops-dto";
import { runCommunityRealCrawl } from "@/lib/community-crawler/core/run-real-crawl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** REAL crawl → durable community_crawl_items. Not TEST preview. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  if (!COMMUNITY_CRAWL_REAL_CRAWL_AVAILABLE) {
    return NextResponse.json({ ok: false, error: "real_crawl_unavailable" }, { status: 501 });
  }

  const { id } = await ctx.params;
  const boardId = id?.trim();
  if (!boardId) {
    return NextResponse.json({ ok: false, error: "board_id_required" }, { status: 400 });
  }

  let maxPosts: number | undefined;
  try {
    const body = (await req.json()) as { maxPosts?: number };
    if (typeof body.maxPosts === "number") maxPosts = body.maxPosts;
  } catch {
    /* empty OK */
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  try {
    const board = await getCommunityCrawlBoard(sb, boardId);
    if (!board) return NextResponse.json({ ok: false, error: "board_not_found" }, { status: 404 });
    const source = await getCommunityCrawlSource(sb, board.source_id);
    if (!source) return NextResponse.json({ ok: false, error: "source_not_found" }, { status: 404 });

    const result = await runCommunityRealCrawl({
      sb,
      board,
      source,
      runKind: "MANUAL",
      maxPostsOverride: maxPosts,
    });

    const items = await enrichCommunityCrawlItemsForAdmin(sb, result.items);

    return NextResponse.json({
      ok: result.status !== "FAILED" || result.items.length > 0,
      result,
      items,
      writes: {
        community_crawl_items:
          result.insertedCount + result.updatedCount + result.duplicateCount,
        community_posts: 0,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
