import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listBoardImportArticles, listBoardImportSources } from "@/lib/community-board-import/store";
import { fetchBoardArticles } from "@/lib/community-board-import/fetch-board-articles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const url = new URL(req.url);
  const sourceBoardId = url.searchParams.get("sourceBoardId")?.trim();
  if (!sourceBoardId) {
    return NextResponse.json({ ok: false, error: "source_board_id_required" }, { status: 400 });
  }
  try {
    const sb = getSupabaseServer();
    const articles = await listBoardImportArticles(sb, sourceBoardId);
    return NextResponse.json({ ok: true, articles, publishWriter: "NOT_IMPLEMENTED" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "list_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as { sourceBoardId?: string; maxArticles?: number };
    const sourceBoardId = String(body.sourceBoardId ?? "").trim();
    if (!sourceBoardId) {
      return NextResponse.json({ ok: false, error: "source_board_id_required" }, { status: 400 });
    }
    const sb = getSupabaseServer();
    const sources = await listBoardImportSources(sb);
    const source = sources.find((s) => s.id === sourceBoardId);
    if (!source) {
      return NextResponse.json({ ok: false, error: "source_not_found" }, { status: 404 });
    }
    if (!source.target_topic_id) {
      return NextResponse.json({ ok: false, error: "target_required" }, { status: 400 });
    }
    const result = await fetchBoardArticles({
      sb,
      source,
      maxArticles: body.maxArticles,
    });
    const articles = await listBoardImportArticles(sb, sourceBoardId);
    return NextResponse.json({
      ok: true,
      ...result,
      articles,
      publishWriter: "NOT_IMPLEMENTED",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
