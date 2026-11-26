import { NextResponse } from "next/server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { runHourlyAnomalyWatch } from "@/lib/perf/hourly-anomaly-watch.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * D4 매시 이상 감시 — 매시 7분, 직전 1시간. 실시간 재시도 폭주·한 방 요청 몰림이 있으면 관리자 알림(대상별 하루 1건).
 * 설계: docs/audit/supabase-request-surge-2026-11-18/structural-analysis-and-design-2026-11-26.md §5 D4
 */
async function runWatch(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const blocked = rejectCronIfSideEffectsBlocked();
  if (blocked) return blocked;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const result = await runHourlyAnomalyWatch(sb);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron hourly-anomaly-watch]", message);
    return NextResponse.json({ ok: false, error: clientSafeInternalErrorMessage(message) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runWatch(req);
}

export async function POST(req: Request) {
  return runWatch(req);
}
