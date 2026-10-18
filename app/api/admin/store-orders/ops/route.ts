/**
 * GET /api/admin/store-orders/ops?screen=list|exceptions|cancellations|refunds&… — 관리자 주문 운영 목록.
 * Rows + total + tab counts = one RPC (`admin_store_order_ops_page`). Read-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  ADMIN_ORDER_OPS_SCREENS,
  parseAdminOrderOpsQuery,
  type AdminOrderOpsScreen,
} from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { loadAdminOrderOpsPage } from "@/lib/admin/store-orders/load-admin-store-order-ops";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  const screen = sp.get("screen") as AdminOrderOpsScreen;
  if (!(ADMIN_ORDER_OPS_SCREENS as readonly string[]).includes(screen)) {
    return NextResponse.json({ ok: false, error: "invalid_screen" }, { status: 400, headers: NO_STORE });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503, headers: NO_STORE });

  const out = await loadAdminOrderOpsPage(sb, parseAdminOrderOpsQuery(screen, sp));
  if (!out.ok) {
    console.error("[admin order ops]", out.error, out.message);
    return NextResponse.json({ ok: false, error: out.error }, { status: out.error === "rpc_missing" ? 503 : 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, ...out.result }, { headers: NO_STORE });
}
