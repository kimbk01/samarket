import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listBoardImportSources } from "@/lib/community-board-import/store";
import {
  runAutoBoardImport,
  runAutoBoardImportDispatcher,
} from "@/lib/community-board-import/run-auto-board-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Admin-triggered AUTO run — same publisher as cron / MANUAL publish.
 * Body: { sourceBoardId?: string, maxArticles?: number }
 * Without sourceBoardId: all mode=AUTO boards (dispatcher batch).
 */
export async function POST(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      sourceBoardId?: string;
      maxArticles?: number;
    };
    const sb = getSupabaseServer();
    const sourceBoardId = String(body.sourceBoardId ?? "").trim();

    if (!sourceBoardId) {
      const out = await runAutoBoardImportDispatcher({
        sb,
        maxBoards: 10,
        maxArticlesPerBoard: body.maxArticles,
      });
      return NextResponse.json({ ok: true, ...out });
    }

    const sources = await listBoardImportSources(sb);
    const source = sources.find((s) => s.id === sourceBoardId);
    if (!source) {
      return NextResponse.json({ ok: false, error: "source_not_found" }, { status: 404 });
    }
    if (source.mode !== "AUTO") {
      return NextResponse.json({ ok: false, error: "source_mode_not_auto" }, { status: 400 });
    }

    const result = await runAutoBoardImport({
      sb,
      source,
      maxArticles: body.maxArticles,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "auto_run_failed" },
      { status: 500 }
    );
  }
}
