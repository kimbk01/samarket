import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { getCommunityCrawlItem } from "@/lib/community-crawler/crawl-item-store";
import { materializeAndPublishItem } from "@/lib/community-crawler/core/materialize-item-persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Canonical Admin [DIBAY 적용]:
 * Materializes persona ONCE (if not already done), rehosts media, and publishes.
 * Does not mutate source_* snapshot.
 * Writes via materializeAndPublishItem -> publishCommunityCrawlFullContent
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

    if (source.policy_status !== "ALLOWED") {
      return NextResponse.json(
        {
          ok: false,
          error: "BLOCKED_POLICY",
          detail: `source.policy_status=${source.policy_status}`,
        },
        { status: 403 }
      );
    }
    if (source.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, error: "SOURCE_NOT_ACTIVE" },
        { status: 403 }
      );
    }

    // Source snapshot before publish — must remain unchanged
    const sourceSnapshot = {
      source_title: item.source_title,
      source_body_normalized: item.source_body_normalized,
      source_cover_candidate_url: item.source_cover_candidate_url,
      source_body_images: item.source_body_images,
      canonical_url: item.canonical_url,
    };

    const result = await materializeAndPublishItem(sb, {
      item,
      board,
      source,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, detail: result.detail },
        { status: result.httpStatus ?? 400 }
      );
    }

    // Verify snapshot was not mutated
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
      initialViewSeed: result.initialViewSeed,
      displayAuthorName: result.displayAuthorName,
      displayDate: result.displayDate,
      mediaDelta: result.mediaDelta,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
