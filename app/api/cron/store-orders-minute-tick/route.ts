import { NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { runStoreOrdersMinuteTick } from "@/lib/stores/cron/store-orders-minute-tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 고정 바닥 1단계 — 매장 주문 1분 tick (미접수 자동 취소 + 사장님 접수 독촉).
 * 설계: docs/audit/supabase-request-surge-2026-11-18/cron-fixed-floor-design-2026-11-25.md §4 1단계.
 * 대기 주문이 없으면 Supabase 1번으로 끝난다.
 */
async function runMinuteTick(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const cronSideEffectsBlocked = rejectCronIfSideEffectsBlocked();
  if (cronSideEffectsBlocked) return cronSideEffectsBlocked;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const result = await runStoreOrdersMinuteTick(sb, getAuditRequestMeta(req));
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(req: Request) {
  return runMinuteTick(req);
}

export async function POST(req: Request) {
  return runMinuteTick(req);
}
