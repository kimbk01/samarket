import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { runCommunityRealCrawl } from "@/lib/community-crawler/core/run-real-crawl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 3;

/**
 * Community Crawl Dispatcher — one cron, due boards only.
 * Does NOT create per-board crons.
 */
async function runDispatcher(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const nowIso = new Date().toISOString();
  const { data: due, error } = await sb
    .from("community_crawl_boards")
    .select("id")
    .eq("enabled", true)
    .eq("schedule_enabled", true)
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const row of due ?? []) {
    const boardId = String((row as { id: string }).id);
    try {
      const board = await getCommunityCrawlBoard(sb, boardId);
      if (!board) continue;
      const source = await getCommunityCrawlSource(sb, board.source_id);
      if (!source || source.status !== "ACTIVE") continue;
      const crawl = await runCommunityRealCrawl({
        sb,
        board,
        source,
        runKind: "SCHEDULED",
      });
      results.push({
        boardId,
        status: crawl.status,
        inserted: crawl.insertedCount,
        updated: crawl.updatedCount,
        duplicate: crawl.duplicateCount,
        failed: crawl.failedCount,
      });
    } catch (e) {
      results.push({
        boardId,
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "system",
    actor_id: null,
    target_type: "cron_job",
    target_id: "community-crawl-dispatcher",
    action: "community_crawl.dispatcher_batch",
    after_json: { scanned: (due ?? []).length, results },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({
    ok: true,
    scanned: (due ?? []).length,
    results,
  });
}

export async function GET(req: Request) {
  try {
    return await runDispatcher(req);
  } catch (err) {
    console.error("[cron community-crawl-dispatcher]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(String(err)) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
