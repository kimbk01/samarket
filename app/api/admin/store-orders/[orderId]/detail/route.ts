/**
 * GET /api/admin/store-orders/[orderId]/detail — 공통 주문 상세 모달 (읽기 전용).
 * Items (with option lines), money breakdown (gift-certificate ledger authoritative), cancel-request
 * ledger and the order's audit rows. Events / delivery timeline / commission row: GET …/history.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminStoreOrderDetail } from "@/lib/admin/store-orders/load-admin-store-order-detail";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  // v4 W1 API-07 — 구매자 연락처·주소(PII) 조회 = `business` 권한 키.
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!UUID_RE.test(oid)) return NextResponse.json({ ok: false, error: "invalid_order_id" }, { status: 400, headers: NO_STORE });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503, headers: NO_STORE });

  const out = await loadAdminStoreOrderDetail(sb, oid);
  if (!out.ok) {
    if (out.error === "query_failed") console.error("[admin store-order detail]", out.message);
    return NextResponse.json(
      { ok: false, error: out.error },
      { status: out.error === "order_not_found" ? 404 : 500, headers: NO_STORE }
    );
  }
  return NextResponse.json({ ok: true, ...out.detail }, { headers: NO_STORE });
}
