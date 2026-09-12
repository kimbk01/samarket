import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { runAutoBoardImportDispatcher } from "@/lib/community-board-import/run-auto-board-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Clean-room board-import AUTO dispatcher.
 * Due authority: mode=AUTO sources → fetch → boardImportCanonicalPublisher.publish only.
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

  const out = await runAutoBoardImportDispatcher({
    sb,
    maxBoards: 5,
    maxArticlesPerBoard: 15,
  });

  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "system",
    actor_id: null,
    target_type: "cron_job",
    target_id: "board-import-auto-dispatcher",
    action: "board_import.auto_dispatcher_batch",
    after_json: out,
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, ...out });
}

export async function GET(req: Request) {
  try {
    return await runDispatcher(req);
  } catch (err) {
    console.error("[cron board-import-auto-dispatcher]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(String(err)) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
