/**
 * GET /api/admin/store-orders/ops/summary?scope=orders|cancel|refund&period=…&from=…&to=…&store_id=…
 * 주문 목록 현황 (주문 생성 기준) · 취소/환불 요약 (요청·처리 시각 기준). Read-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { ADMIN_ORDER_OPS_PERIODS, type AdminOrderOpsPeriod } from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { loadAdminOrderOpsSummary } from "@/lib/admin/store-orders/load-admin-store-order-ops";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (v: string | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope");
  if (scope !== "orders" && scope !== "cancel" && scope !== "refund") {
    return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400, headers: NO_STORE });
  }
  const periodRaw = String(sp.get("period") ?? "all");
  const period = ((ADMIN_ORDER_OPS_PERIODS as readonly string[]).includes(periodRaw) ? periodRaw : "all") as AdminOrderOpsPeriod;
  const storeRaw = String(sp.get("store_id") ?? "").trim();

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503, headers: NO_STORE });

  const out = await loadAdminOrderOpsSummary(sb, {
    scope,
    period,
    fromDay: day(sp.get("from")),
    toDay: day(sp.get("to")),
    storeId: UUID_RE.test(storeRaw) ? storeRaw : null,
  });
  if (!out.ok) {
    console.error("[admin order ops summary]", out.error, out.message);
    return NextResponse.json({ ok: false, error: out.error }, { status: out.error === "rpc_missing" ? 503 : 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, summary: out.result, fetchedAt: new Date().toISOString() }, { headers: NO_STORE });
}
