import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 오너: 본인 매장 정산 목록 (`?storeId=` 로 단일 매장 필터) */
export async function GET(req: Request) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const filterStoreId = new URL(req.url).searchParams.get("storeId")?.trim() ?? "";

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
  const ownedIds = new Set(storeList.map((s) => s.id as string));
  if (ownedIds.size === 0) {
    return NextResponse.json({ ok: true, settlements: [], stores: [], meta: {} });
  }

  if (filterStoreId && !ownedIds.has(filterStoreId)) {
    return NextResponse.json({ ok: false, error: "forbidden_store" }, { status: 403 });
  }

  const targetStoreIds = filterStoreId ? [filterStoreId] : [...ownedIds];

  const { data: rows, error } = await sb
    .from("store_settlements")
    .select(
      "id, store_id, order_id, gross_amount, fee_amount, settlement_amount, settlement_status, settlement_due_date, paid_at, hold_reason, created_at, platform_fee_percent, platform_fee_amount, fixed_fee_amount, delivery_income_amount, discount_burden_amount, refund_amount, net_settlement_amount, payout_method, payout_reference, payout_confirmed_at, payout_note"
    )
    .in("store_id", targetStoreIds)
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

  let meta: Record<string, unknown> = {};
  if (filterStoreId) {
    const commerce = await loadCommerceSettings(sb);
    meta = {
      store_name: nameByStore[filterStoreId] ?? "",
      settlement_fee_percent: (Number(commerce.settlementFeeBp) || 0) / 100,
      settlement_delay_days: commerce.settlementDelayDays,
    };
  }

  return NextResponse.json({
    ok: true,
    stores: storeList,
    meta,
    settlements: settlements.map((r) => ({
      ...r,
      store_name: nameByStore[r.store_id as string] ?? "",
      order_no: orderNos[r.order_id as string] ?? "",
    })),
  });
}
