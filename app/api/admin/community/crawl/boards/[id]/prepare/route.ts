import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { PREPARE_CRAWL_MAX_POSTS, runCommunityTestCrawl } from "@/lib/community-crawler/core/run-test-crawl";
import { TRAVEL_PH_NEXT_DATA_COVER_PATH } from "@/lib/community-crawler/core/next-data-cover";
import { buildPreparedCrawlItem } from "@/lib/community-crawler/prepare-crawl-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * STEP5: fetch ≥10 previews with DIBAY display policy applied (import-time).
 * Never writes community_posts / post_links / media.
 * Public publish remains blocked while source.policy_status !== ALLOWED.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await ctx.params;
  const boardId = id?.trim();
  if (!boardId) {
    return NextResponse.json({ ok: false, error: "board_id_required" }, { status: 400 });
  }

  let maxPosts = PREPARE_CRAWL_MAX_POSTS;
  try {
    const body = (await req.json()) as { maxPosts?: number };
    if (typeof body.maxPosts === "number" && Number.isFinite(body.maxPosts)) {
      maxPosts = Math.min(PREPARE_CRAWL_MAX_POSTS, Math.max(10, Math.floor(body.maxPosts)));
    }
  } catch {
    /* empty body OK */
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

    const result = await runCommunityTestCrawl({
      sb,
      board,
      source,
      topicName,
      recordRun: true,
      maxPostsOverride: maxPosts,
    });

    const prepared = result.previews.map((p) =>
      buildPreparedCrawlItem({ preview: p, policyStatus: source.policy_status })
    );
    const withCover = prepared.filter((p) => Boolean(p.representativeImageUrl)).length;
    const authors = new Set(prepared.map((p) => p.displayAuthorName));
    const dates = new Set(prepared.map((p) => p.displayDateIso ?? ""));
    const views = new Set(prepared.map((p) => p.viewCount));

    return NextResponse.json({
      ok: result.status !== "FAILED" || prepared.length > 0,
      result,
      prepared,
      summary: {
        fetched: result.fetchedCount,
        valid: prepared.length,
        prepared: prepared.length,
        withCover,
        uniqueAuthors: authors.size,
        uniqueDates: [...dates].filter(Boolean).length,
        uniqueViews: views.size,
        coverPathProven: TRAVEL_PH_NEXT_DATA_COVER_PATH,
        sourcePolicy: source.policy_status,
        publicPublish: source.policy_status === "ALLOWED" ? "ALLOWED" : "BLOCKED_POLICY",
        mediaPublish: source.policy_status === "ALLOWED" ? "ALLOWED_REHOST" : "BLOCKED_POLICY",
        authorPolicy: board.author_policy,
        datePolicy: board.date_policy,
        viewPolicy: board.view_policy,
      },
      writes: {
        community_posts: 0,
        community_crawl_post_links: 0,
        media_storage: 0,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
