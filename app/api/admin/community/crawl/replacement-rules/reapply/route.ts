import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getCommunityCrawlBoard } from "@/lib/community-crawler/admin-crawl-store";
import { reapplyCommunityCrawlReplacementRules } from "@/lib/community-crawler/replacement/replacement-rule-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Explicit reapply — does not run on rule save. MANUAL override items skipped. */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const boardId = String(body.board_id ?? "").trim();
  if (!boardId) {
    return NextResponse.json({ ok: false, error: "board_id_required" }, { status: 400 });
  }

  try {
    const board = await getCommunityCrawlBoard(sb, boardId);
    if (!board) {
      return NextResponse.json({ ok: false, error: "board_not_found" }, { status: 404 });
    }
    const result = await reapplyCommunityCrawlReplacementRules(sb, {
      sourceId: board.source_id,
      boardId: board.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
