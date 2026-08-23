import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { expireStoreOrderPopularityProjectionBatch } from "@/lib/stores/discovery/store-order-popularity-projection";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runPopularityExpireJob(req: Request) {
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
    const result = await expireStoreOrderPopularityProjectionBatch(sb, { batchSize: 500 });
    const rm = getAuditRequestMeta(req);
    void appendAuditLog(sb, {
      actor_type: "system",
      actor_id: null,
      target_type: "cron_job",
      target_id: "stores-discovery-popularity-expire",
      action: "stores.discovery_popularity_expire_batch",
      after_json: result,
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron stores-discovery-popularity-expire]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(String(err)) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return runPopularityExpireJob(req);
}

export async function POST(req: Request) {
  return runPopularityExpireJob(req);
}
