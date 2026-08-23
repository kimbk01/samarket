import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { runDiscoveryScheduleTransitionBatch } from "@/lib/stores/discovery/persist-discovery-schedule-projection";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runScheduleTransitionJob(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const result = await runDiscoveryScheduleTransitionBatch(sb, { batchSize: 100 });
    const rm = getAuditRequestMeta(req);
    void appendAuditLog(sb, {
      actor_type: "system",
      actor_id: null,
      target_type: "cron_job",
      target_id: "stores-discovery-schedule-transitions",
      action: "stores.discovery_schedule_transition_batch",
      after_json: result,
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron stores-discovery-schedule-transitions]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(String(err)) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return runScheduleTransitionJob(req);
}

export async function POST(req: Request) {
  return runScheduleTransitionJob(req);
}
