import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getCommunityCrawlBoard, getCommunityCrawlSource } from "@/lib/community-crawler/admin-crawl-store";
import { getCommunityCrawlItem } from "@/lib/community-crawler/crawl-item-store";
import { resolveCommunityCrawlPublishEligibility } from "@/lib/community-crawler/publish-eligibility";
import { publishCommunityCrawlFullContent } from "@/lib/community-crawler/publish-full-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V2-1 operational publish: crawl item → community_posts (FULL_CONTENT).
 * Does not mutate source_* snapshot. No community_post_images (V2-5).
 * Eligibility SSOT: resolveCommunityCrawlPublishEligibility (mode=manual).
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

    const board = await getCommunityCrawlBoard(sb, item.board_id);
    const source = board ? await getCommunityCrawlSource(sb, board.source_id) : null;
    if (!board || !source) {
      return NextResponse.json({ ok: false, error: "board_or_source_missing" }, { status: 404 });
    }

    const eligibility = await resolveCommunityCrawlPublishEligibility(sb, {
      source,
      board,
      item,
      mode: "manual",
    });
    if (!eligibility.ok) {
      if (
        eligibility.reason === "ALREADY_PUBLISHED" ||
        eligibility.reason === "ALREADY_LINKED"
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "already_published",
            communityPostId: eligibility.detail ?? item.published_post_id,
          },
          { status: 409 }
        );
      }
      if (
        eligibility.reason === "SOURCE_POLICY_NOT_ALLOWED" ||
        eligibility.reason === "SOURCE_NOT_ACTIVE"
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "BLOCKED_POLICY",
            detail: eligibility.detail ?? eligibility.reason,
            policyStatus: source.policy_status,
          },
          { status: 403 }
        );
      }
      if (eligibility.reason === "AUTHOR_MISSING") {
        return NextResponse.json({ ok: false, error: "AUTHOR_POOL_EMPTY" }, { status: 400 });
      }
      return NextResponse.json(
        {
          ok: false,
          error: eligibility.reason,
          detail: eligibility.detail,
        },
        { status: 400 }
      );
    }

    // Snapshot before publish — must remain unchanged after writer.
    const sourceSnapshot = {
      source_title: item.source_title,
      source_body_normalized: item.source_body_normalized,
      source_cover_candidate_url: item.source_cover_candidate_url,
      source_body_images: item.source_body_images,
      canonical_url: item.canonical_url,
    };

    const result = await publishCommunityCrawlFullContent(sb, {
      boardId: item.board_id,
      canonicalUrl: item.canonical_url,
      sourcePostId: item.source_post_id,
      sourcePublishedAt: item.source_published_at,
      title: eligibility.title,
      content: eligibility.content,
      displayAuthorName: eligibility.displayAuthorName,
      displayAuthorAvatarUrl: item.display_author_avatar_url,
      createdAtIso: item.display_date,
      viewCount: item.display_view_seed,
    });

    if (!result.ok) {
      const error =
        result.error === "already_imported" ? "already_published" : result.error;
      return NextResponse.json(
        { ...result, error },
        { status: result.httpStatus ?? 500 }
      );
    }

    await sb
      .from("community_crawl_items")
      .update({
        status: "PUBLISHED",
        published_post_id: result.communityPostId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    const after = await getCommunityCrawlItem(sb, id);
    if (
      after &&
      (after.source_title !== sourceSnapshot.source_title ||
        after.source_body_normalized !== sourceSnapshot.source_body_normalized ||
        after.canonical_url !== sourceSnapshot.canonical_url)
    ) {
      return NextResponse.json(
        { ok: false, error: "source_snapshot_mutated" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      communityPostId: result.communityPostId,
      postLinkId: result.postLinkId,
      itemId: item.id,
      publishMode: result.publishMode,
      pointReward: 0,
      mediaDelta: 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
