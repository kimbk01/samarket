/**
 * GET /api/admin/store-orders/[orderId]/history — 주문 상세 보조 조회 (읽기 전용).
 * - events: store_order_events (주문 상태 이력 · 취소/환불 이력)
 * - delivery: store_order_deliveries (배달 진행)
 * - commission: 수수료 원장 행 — 정산 화면과 같은 SQL (`store_commission_ledger_page`)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadStoreCommissionLedgerPage } from "@/lib/stores/commission/load-store-commission-ledger";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400, headers: NO_STORE });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503, headers: NO_STORE });

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_no")
    .eq("id", oid)
    .maybeSingle();
  if (oErr || !order) return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404, headers: NO_STORE });

  const [eventsRes, deliveryRes] = await Promise.all([
    sb
      .from("store_order_events")
      .select("id, event_type, from_status, to_status, actor_role, message, created_at")
      .eq("order_id", oid)
      .order("created_at", { ascending: true })
      .limit(200),
    sb
      .from("store_order_deliveries")
      .select("delivery_status, assigned_at, picked_up_at, delivered_at, failed_at, updated_at")
      .eq("order_id", oid)
      .maybeSingle(),
  ]);
  if (eventsRes.error) {
    return NextResponse.json({ ok: false, error: eventsRes.error.message }, { status: 500, headers: NO_STORE });
  }

  let commission = null;
  let commissionError: string | null = null;
  try {
    const page = await loadStoreCommissionLedgerPage(sb, {
      storeIds: [String(order.store_id)],
      fromIso: null,
      toIso: null,
      state: "all",
      orderNo: String(order.order_no),
      limit: 20,
      offset: 0,
    });
    commission = page.rows.find((r) => r.orderId === oid) ?? null;
  } catch (e) {
    commissionError = e instanceof Error ? e.message : "commission_load_failed";
  }

  return NextResponse.json(
    {
      ok: true,
      events: eventsRes.data ?? [],
      delivery: deliveryRes.data ?? null,
      commission,
      commission_error: commissionError,
    },
    { headers: NO_STORE }
  );
}
