import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { isStoreOrderEventVisibleToBuyer } from "@/lib/stores/store-order-event-audience";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 구매자 또는 해당 매장 오너: 주문 이벤트 타임라인(append-only 원장 조회).
 * 구매자 요청(buyer_user_id 일치) 시 매장 전용 이벤트(metadata.audience=owner 등)는 제외.
 * 오너만 접근 시(구매자 아님) 전체 원장 반환 — 운영 타임라인.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, buyer_user_id, store_id")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const buyerOk = String(order.buyer_user_id ?? "").trim() === userId;
  const sid = String(order.store_id ?? "").trim();
  const ownerGate = sid ? await getStoreIfOwner(sb, userId, sid) : { ok: false as const, error: "forbidden", status: 403 };

  if (!buyerOk && !ownerGate.ok) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data: rows, error: eErr } = await sb
    .from("store_order_events")
    .select(
      "id, order_id, store_id, actor_user_id, actor_role, event_type, from_status, to_status, message, metadata, created_at"
    )
    .eq("order_id", oid)
    .order("created_at", { ascending: true });

  if (eErr) {
    if (/does not exist|Could not find the table/i.test(String(eErr.message))) {
      return NextResponse.json({ ok: true, events: [] });
    }
    console.error("[GET store-order-events]", eErr);
    return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });
  }

  const list = rows ?? [];
  const events = buyerOk ? list.filter(isStoreOrderEventVisibleToBuyer) : list;

  return NextResponse.json({
    ok: true,
    events,
  });
}
