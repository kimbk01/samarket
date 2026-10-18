/**
 * GET /api/admin/store-orders/list — 관리자 매장 주문 조회 (서버 페이지네이션).
 * Query: tab, order_status, store_name, order_no, buyer, period, from, to, fulfillment,
 *        payment_status, store_id, order_id, buyer_user_id, queue=admin_attention,
 *        page, page_size, as_of
 *
 * Rows + total + tab counts = one RPC (`admin_store_orders_page`). Read-only.
 * Legacy `GET /api/admin/store-orders` (limit-based) stays for the delivery dashboard callers.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { parseAdminStoreOrdersQuery } from "@/lib/admin/store-orders/admin-store-orders-contract";
import { loadAdminStoreOrdersPage } from "@/lib/admin/store-orders/load-admin-store-orders-page";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503, headers: NO_STORE });
  }

  const q = parseAdminStoreOrdersQuery(req.nextUrl.searchParams);
  const out = await loadAdminStoreOrdersPage(sb, q);
  if (!out.ok) {
    console.error("[admin store-orders list]", out.error, out.message);
    return NextResponse.json(
      { ok: false, error: out.error },
      { status: out.error === "rpc_missing" ? 503 : 500, headers: NO_STORE }
    );
  }
  return NextResponse.json({ ok: true, ...out.result }, { headers: NO_STORE });
}
