/**
 * 오너: order_id로 소유 매장(store_id, slug) 조회 — 통합 주문 채팅 진입용
 */
import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const orderId = req.nextUrl.searchParams.get("order_id")?.trim() ?? "";
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: ord, error: oErr } = await sb
    .from("store_orders")
    .select("store_id")
    .eq("id", orderId)
    .maybeSingle();
  if (oErr || !ord) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const sid = String((ord as { store_id: string }).store_id ?? "").trim();
  if (!sid) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { data: st, error: sErr } = await sb
    .from("stores")
    .select("id, owner_user_id, slug")
    .eq("id", sid)
    .maybeSingle();
  if (sErr || !st || String(st.owner_user_id) !== userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    store_id: st.id as string,
    slug: String((st as { slug?: string | null }).slug ?? "").trim(),
  });
}
