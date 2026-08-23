import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tickDeliveryCoverageGlobalRebuild } from "@/lib/stores/discovery/tick-delivery-coverage-global-rebuild";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runCoverageRebuildTick(req: Request) {
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
    const result = await tickDeliveryCoverageGlobalRebuild(sb, 100);
    const rm = getAuditRequestMeta(req);
    void appendAuditLog(sb, {
      actor_type: "system",
      actor_id: null,
      target_type: "cron_job",
      target_id: "stores-discovery-coverage-rebuild",
      action: "stores.discovery_coverage_rebuild_tick",
      after_json: result,
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron stores-discovery-coverage-rebuild]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(String(err)) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return runCoverageRebuildTick(req);
}

export async function POST(req: Request) {
  return runCoverageRebuildTick(req);
}
