import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { runDeliveryAdSchedulePromoterBatch } from "@/lib/stores/advertising/delivery-ad-schedule-promoter";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function runSchedulePromoterJob(req: Request) {
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
    const result = await runDeliveryAdSchedulePromoterBatch(sb, { batchSize: 50 });
    const rm = getAuditRequestMeta(req);
    void appendAuditLog(sb, {
      actor_type: "system",
      actor_id: null,
      target_type: "cron_job",
      target_id: "delivery-ads-schedule-transitions",
      action: "delivery_ads.schedule_promoter_batch",
      after_json: {
        activated: result.activated,
        ended: result.ended,
        failed: result.failed,
        scanned: result.scanned,
      },
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
    return NextResponse.json({
      ok: true,
      activated: result.activated,
      ended: result.ended,
      failed: result.failed,
      scanned: result.scanned,
      results: result.results,
    });
  } catch (err) {
    console.error("[cron delivery-ads-schedule-transitions]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(String(err)) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return runSchedulePromoterJob(req);
}

export async function POST(req: Request) {
  return runSchedulePromoterJob(req);
}
