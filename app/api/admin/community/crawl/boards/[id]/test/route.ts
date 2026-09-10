import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { runCommunityTestCrawl } from "@/lib/community-crawler/core/run-test-crawl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await ctx.params;
  const boardId = id?.trim();
  if (!boardId) {
    return NextResponse.json({ ok: false, error: "board_id_required" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  try {
    const board = await getCommunityCrawlBoard(sb, boardId);
    if (!board) {
      return NextResponse.json({ ok: false, error: "board_not_found" }, { status: 404 });
    }
    const source = await getCommunityCrawlSource(sb, board.source_id);
    if (!source) {
      return NextResponse.json({ ok: false, error: "source_not_found" }, { status: 404 });
    }

    let topicName: string | null = null;
    const { data: topic } = await sb
      .from("community_topics")
      .select("name")
      .eq("id", board.dibay_topic_id)
      .maybeSingle();
    if (topic) topicName = String((topic as { name?: string }).name ?? "") || null;

    const result = await runCommunityTestCrawl({ sb, board, source, topicName });

    return NextResponse.json({
      ok: result.status !== "FAILED" || result.successCount > 0,
      result,
      // Explicit no-write contract for callers / QA.
      writes: {
        community_posts: 0,
        community_crawl_post_links: 0,
        media_storage: 0,
        crawl_runs: result.runId ? 1 : 0,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
