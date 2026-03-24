import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 관리자: 전체 정산 목록 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: rows, error } = await sb
    .from("store_settlements")
    .select(
      "id, store_id, order_id, gross_amount, fee_amount, settlement_amount, settlement_status, settlement_due_date, paid_at, hold_reason, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (error.message?.includes("store_settlements") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin/store-settlements]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const storeIds = [...new Set(list.map((r) => r.store_id as string))];
  const names: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) names[s.id as string] = (s.store_name as string) ?? "";
  }

  const orderIds = [...new Set(list.map((r) => r.order_id as string))];
  const orderNos: Record<string, string> = {};
  if (orderIds.length) {
    const { data: orders } = await sb.from("store_orders").select("id, order_no").in("id", orderIds);
    for (const o of orders ?? []) orderNos[o.id as string] = (o.order_no as string) ?? "";
  }

  return NextResponse.json({
    ok: true,
    settlements: list.map((r) => ({
      ...r,
      store_name: names[r.store_id as string] ?? "",
      order_no: orderNos[r.order_id as string] ?? "",
    })),
  });
}
