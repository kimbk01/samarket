import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 매장 오너: 본인 매장 정산 목록 */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: stores, error: sErr } = await sb
    .from("stores")
    .select("id, store_name, slug")
    .eq("owner_user_id", userId);

  if (sErr) {
    console.error("[store-settlements] stores", sErr);
    return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  }

  const storeList = stores ?? [];
  const storeIds = storeList.map((s) => s.id as string);
  if (storeIds.length === 0) {
    return NextResponse.json({ ok: true, settlements: [], stores: [] });
  }

  const { data: rows, error } = await sb
    .from("store_settlements")
    .select(
      "id, store_id, order_id, gross_amount, fee_amount, settlement_amount, settlement_status, settlement_due_date, paid_at, hold_reason, created_at"
    )
    .in("store_id", storeIds)
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    if (error.message?.includes("store_settlements") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[store-settlements]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const settlements = rows ?? [];
  const orderIds = [...new Set(settlements.map((r) => r.order_id as string))];
  const orderNos: Record<string, string> = {};
  if (orderIds.length) {
    const { data: orders } = await sb.from("store_orders").select("id, order_no").in("id", orderIds);
    for (const o of orders ?? []) orderNos[o.id as string] = (o.order_no as string) ?? "";
  }

  const nameByStore: Record<string, string> = {};
  for (const s of storeList) nameByStore[s.id as string] = (s.store_name as string) ?? "";

  return NextResponse.json({
    ok: true,
    stores: storeList,
    settlements: settlements.map((r) => ({
      ...r,
      store_name: nameByStore[r.store_id as string] ?? "",
      order_no: orderNos[r.order_id as string] ?? "",
    })),
  });
}
