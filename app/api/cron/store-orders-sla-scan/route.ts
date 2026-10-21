import { NextResponse } from "next/server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 주문 SLA 경고 스캔 — `scan_store_order_sla_warnings` (미접수 5분·조리 ETA 초과·배달 60분 초과·환불 요청 60분 초과)
 * 결과는 store_orders.sla_warning_* / needs_admin_attention → 관리자 주문 큐.
 * 운영 DB 에 pg_cron 이 없어 Vercel 크론이 호출한다. 기준 시각 이전 주문은 함수 안에서 제외(20270602110000).
 */
async function runStoreOrdersSlaScan(req: Request) {
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

  const { error } = await sb.rpc("scan_store_order_sla_warnings");
  if (error) {
    console.error("[cron store-orders-sla-scan]", error);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(error.message) },
      { status: 500 }
    );
  }
  // 관리자 배달 운영 상태(`admin_delivery_operations_health`)의 sla_scan 하트비트 — 성공 실행만 기록.
  const { error: hbErr } = await sb.rpc("touch_delivery_operation_job_heartbeat", {
    p_job_key: "sla_scan",
    p_ok: true,
    p_detail: { source: "vercel_cron" },
  });
  if (hbErr) console.error("[cron store-orders-sla-scan] heartbeat", hbErr);
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  return runStoreOrdersSlaScan(req);
}

export async function POST(req: Request) {
  return runStoreOrdersSlaScan(req);
}
