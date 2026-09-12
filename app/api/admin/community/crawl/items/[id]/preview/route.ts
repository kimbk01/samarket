import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { getCommunityCrawlItem } from "@/lib/community-crawler/crawl-item-store";
import { generateTransientItemPreview } from "@/lib/community-crawler/core/materialize-item-persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PURE READ preview: DB WRITE COUNT = 0.
 * In-memory transient preview calculation.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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

    const preview = await generateTransientItemPreview(sb, {
      item,
      board,
      source,
    });

    return NextResponse.json({ ok: true, preview });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
