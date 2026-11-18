import { NextResponse } from "next/server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { runRequestBudgetWatch } from "@/lib/perf/request-budget-watch.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 요청 예산 운영 감시 — 하루 1회(09:00 PHT). Supabase 호출 계수기 집계를 예산(lib/perf/request-budget.ts)과 비교해
 * 넘친 경우에만 관리자 알림 1건. 설계: docs/request-budget-ssot.md
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
    const result = await runRequestBudgetWatch(sb);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron request-budget-watch]", message);
    return NextResponse.json({ ok: false, error: clientSafeInternalErrorMessage(message) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runWatch(req);
}

export async function POST(req: Request) {
  return runWatch(req);
}
