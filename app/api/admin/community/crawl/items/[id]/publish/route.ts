import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getCommunityCrawlBoard, getCommunityCrawlSource } from "@/lib/community-crawler/admin-crawl-store";
import { getCommunityCrawlItem } from "@/lib/community-crawler/crawl-item-store";
import { publishCommunityManualImportReferenceSummary } from "@/lib/community-crawler/manual-import-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Publish crawl item → community_posts via STEP4 canonical writer.
 * Blocked when source.policy_status !== ALLOWED (Owner: toggle alone ≠ license).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  try {
    const item = await getCommunityCrawlItem(sb, id);
    if (!item) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (item.published_post_id) {
      return NextResponse.json({
        ok: false,
        error: "already_published",
        communityPostId: item.published_post_id,
      }, { status: 409 });
    }

    const board = await getCommunityCrawlBoard(sb, item.board_id);
    const source = board ? await getCommunityCrawlSource(sb, board.source_id) : null;
    if (!board || !source) {
      return NextResponse.json({ ok: false, error: "board_or_source_missing" }, { status: 404 });
    }
    if (source.policy_status !== "ALLOWED") {
      return NextResponse.json(
        {
          ok: false,
          error: "BLOCKED_POLICY",
          detail: "Source policy_status is not ALLOWED; license/permission evidence required before publish",
          policyStatus: source.policy_status,
        },
        { status: 403 }
      );
    }
    if (!item.display_author_name?.trim()) {
      return NextResponse.json({ ok: false, error: "AUTHOR_POOL_EMPTY" }, { status: 400 });
    }
    if (!item.dibay_body?.trim() || item.dibay_body.trim().length < 20) {
      return NextResponse.json({ ok: false, error: "dibay_body_required" }, { status: 400 });
    }

    const result = await publishCommunityManualImportReferenceSummary(sb, {
      boardId: item.board_id,
      canonicalUrl: item.canonical_url,
      sourcePostId: item.source_post_id,
      sourcePublishedAt: item.source_published_at,
      sourceBodyMarkdown: item.source_body_normalized,
      title: item.dibay_title || item.source_title,
      content: item.dibay_body,
      displayAuthorName: item.display_author_name,
      displayAuthorAvatarUrl: item.display_author_avatar_url,
      createdAtIso: item.display_date,
      viewCount: item.display_view_seed,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: result.httpStatus ?? 500 });
    }

    await sb
      .from("community_crawl_items")
      .update({
        status: "PUBLISHED",
        published_post_id: result.communityPostId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    return NextResponse.json({
      ok: true,
      communityPostId: result.communityPostId,
      postLinkId: result.postLinkId,
      itemId: item.id,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
