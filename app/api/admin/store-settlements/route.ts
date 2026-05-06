import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoDayStartUtc(day: string): string | null {
  const s = day.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = new Date(`${s}T00:00:00.000Z`).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function isoDayEndUtc(day: string): string | null {
  const s = day.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = new Date(`${s}T23:59:59.999Z`).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** 관리자: 정산 목록 (필터·페이지네이션) */
export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const storeId = sp.get("store_id")?.trim() ?? "";
  const fromDay = sp.get("from")?.trim() ?? "";
  const toDay = sp.get("to")?.trim() ?? "";
  const settlementStatus = sp.get("settlement_status")?.trim() ?? "";
  const payoutStatus = sp.get("payout_status")?.trim() ?? ""; // paid | unpaid | (empty=all)
  const heldOnly = sp.get("held_only") === "1";
  const unpaidOnly = sp.get("unpaid_only") === "1";
  const refundOnly = sp.get("refund_only") === "1";
  const rawLimit = Number(sp.get("limit") ?? "500");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.round(rawLimit), 1), 500) : 500;

  let q = sb
    .from("store_settlements")
    .select(
      "id, store_id, order_id, gross_amount, fee_amount, settlement_amount, settlement_status, settlement_due_date, paid_at, hold_reason, created_at, platform_fee_percent, platform_fee_amount, fixed_fee_amount, delivery_income_amount, discount_burden_amount, refund_amount, net_settlement_amount, payout_method, payout_reference, payout_confirmed_at, payout_note"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (storeId) q = q.eq("store_id", storeId);

  const fromIso = fromDay ? isoDayStartUtc(fromDay) : null;
  const toIso = toDay ? isoDayEndUtc(toDay) : null;
  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lte("created_at", toIso);

  if (refundOnly) q = q.gt("refund_amount", 0);
  if (heldOnly) q = q.eq("settlement_status", "held");

  if (settlementStatus) {
    q = q.eq("settlement_status", settlementStatus);
  } else {
    if (unpaidOnly) q = q.in("settlement_status", ["scheduled", "processing", "held"]);
    else if (payoutStatus === "paid") q = q.eq("settlement_status", "paid");
    else if (payoutStatus === "unpaid") q = q.neq("settlement_status", "paid");
  }

  const { data: rows, error } = await q;

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
  const orderCompletedAt: Record<string, string | null> = {};
  if (orderIds.length) {
    const { data: orders } = await sb
      .from("store_orders")
      .select("id, order_no, order_status, updated_at")
      .in("id", orderIds);
    for (const o of orders ?? []) {
      const oid = o.id as string;
      orderNos[oid] = (o.order_no as string) ?? "";
      orderCompletedAt[oid] =
        String((o as { order_status?: string }).order_status ?? "") === "completed" &&
        typeof (o as { updated_at?: string }).updated_at === "string"
          ? String((o as { updated_at: string }).updated_at)
          : null;
    }
  }

  return NextResponse.json({
    ok: true,
    settlements: list.map((r) => {
      const oid = r.order_id as string;
      return {
        ...r,
        store_name: names[r.store_id as string] ?? "",
        order_no: orderNos[oid] ?? "",
        order_completed_at: orderCompletedAt[oid] ?? null,
      };
    }),
  });
}
