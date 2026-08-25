import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  loadStoreSettlementFinancialFacts,
  settlementPeriodDayToIso,
} from "@/lib/stores/load-store-settlement-financial-facts";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자: 정산 금융 사실 (Owner와 동일 projection · 서버 summary) */
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
  const payoutStatusRaw = sp.get("payout_status")?.trim() ?? "";
  const payoutStatus =
    payoutStatusRaw === "paid" || payoutStatusRaw === "unpaid" ? payoutStatusRaw : "";
  const heldOnly = sp.get("held_only") === "1";
  const unpaidOnly = sp.get("unpaid_only") === "1";
  const refundOnly = sp.get("refund_only") === "1";
  const orderNo = sp.get("order_no")?.trim() ?? "";
  const periodBasisRaw = sp.get("period_basis")?.trim() ?? "settlement_created";
  const periodBasis =
    periodBasisRaw === "order_completed" || periodBasisRaw === "paid_at"
      ? periodBasisRaw
      : "settlement_created";
  const rawLimit = Number(sp.get("limit") ?? "500");
  const pageLimit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.round(rawLimit), 1), 500) : 500;

  let storeIds: string[] = [];
  if (storeId) {
    storeIds = [storeId];
  } else {
    const { data: stores, error: sErr } = await sb.from("stores").select("id").limit(5000);
    if (sErr) {
      console.error("[admin/store-settlements] stores", sErr);
      return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
    }
    storeIds = (stores ?? []).map((s) => s.id as string);
  }

  const { fromIso, toIso } = settlementPeriodDayToIso(fromDay || null, toDay || null);

  const loaded = await loadStoreSettlementFinancialFacts(sb, {
    storeIds,
    fromIso,
    toIso,
    periodBasis,
    settlementStatus: settlementStatus || null,
    payoutStatus,
    heldOnly,
    unpaidOnly,
    refundOnly,
    orderNo: orderNo || null,
    includeBuyerDisplay: true,
    authorityLimit: 5000,
    pageLimit,
  });

  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.httpStatus });
  }

  return NextResponse.json({
    ok: true,
    summary: loaded.summary,
    total_matched: loaded.total_matched,
    truncated: loaded.truncated,
    period_basis: periodBasis,
    period_field:
      periodBasis === "order_completed"
        ? "order_completed_recognition"
        : periodBasis === "paid_at"
          ? "store_settlements.paid_at"
          : "store_settlements.created_at",
    settlements: loaded.facts.map((f) => ({
      id: f.settlement_id,
      store_id: f.store_id,
      store_name: f.store_name,
      order_id: f.order_id,
      order_no: f.order_no,
      buyer_user_id: f.buyer_user_id,
      buyer_display: f.buyer_display,
      order_status: f.order_status,
      payment_status: f.payment_status,
      ordered_at: f.ordered_at,
      order_completed_at: f.completed_at,
      gross_amount: f.gross_amount,
      discount_amount: f.discount_amount,
      store_funded_amount: f.store_funded_amount,
      platform_funded_amount: f.platform_funded_amount,
      point_amount: f.point_amount,
      payment_amount: f.payment_amount,
      delivery_fee_amount: f.delivery_fee_amount,
      fee_amount: f.commission_amount + f.fixed_fee_amount,
      settlement_amount: f.net_settlement_amount,
      platform_fee_percent: f.commission_rate,
      platform_fee_amount: f.commission_amount,
      fixed_fee_amount: f.fixed_fee_amount,
      delivery_income_amount: f.delivery_income_amount,
      discount_burden_amount: f.discount_burden_amount,
      refund_amount: f.refund_amount,
      commission_reversal_amount: f.commission_reversal_amount,
      platform_commission_revenue: f.platform_commission_revenue,
      commission_base_amount: f.commission_base_amount,
      commission_policy_scope: f.commission_policy_scope,
      applied_fee_policy_snapshot: f.applied_fee_policy_snapshot,
      net_settlement_amount: f.net_settlement_amount,
      settlement_status: f.settlement_status,
      settlement_due_date: f.settlement_due_date,
      paid_at: f.paid_at,
      hold_reason: f.hold_reason,
      payout_method: f.payout_method,
      payout_reference: f.payout_reference,
      payout_confirmed_at: f.payout_confirmed_at,
      payout_note: f.payout_note,
      created_at: f.settlement_created_at,
    })),
  });
}
