import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import {
  loadStoreSettlementFinancialFacts,
  settlementPeriodDayToIso,
} from "@/lib/stores/load-store-settlement-financial-facts";
import { resolveEffectiveStoreFeePolicy } from "@/lib/stores/store-fee-policy-resolve";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 오너: 본인 매장 정산 금융 사실 (`?storeId=` · optional from/to/order_no/settlement_status) */
export async function GET(req: Request) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const filterStoreId = url.searchParams.get("storeId")?.trim() ?? "";
  const fromDay = url.searchParams.get("from")?.trim() ?? "";
  const toDay = url.searchParams.get("to")?.trim() ?? "";
  const orderNo = url.searchParams.get("order_no")?.trim() ?? "";
  const settlementStatus = url.searchParams.get("settlement_status")?.trim() ?? "";
  const periodBasisRaw = url.searchParams.get("period_basis")?.trim() ?? "settlement_created";
  const periodBasis =
    periodBasisRaw === "order_completed" || periodBasisRaw === "paid_at"
      ? periodBasisRaw
      : "settlement_created";

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
    return NextResponse.json({
      ok: true,
      stores: [],
      meta: {},
      summary: null,
      settlements: [],
      total_matched: 0,
    });
  }

  if (filterStoreId && !ownedIds.has(filterStoreId)) {
    return NextResponse.json({ ok: false, error: "forbidden_store" }, { status: 403 });
  }

  const targetStoreIds = filterStoreId ? [filterStoreId] : [...ownedIds];
  const { fromIso, toIso } = settlementPeriodDayToIso(fromDay || null, toDay || null);

  const loaded = await loadStoreSettlementFinancialFacts(sb, {
    storeIds: targetStoreIds,
    fromIso,
    toIso,
    periodBasis,
    settlementStatus: settlementStatus || null,
    orderNo: orderNo || null,
    includeBuyerDisplay: false,
    authorityLimit: 5000,
    pageLimit: 500,
  });

  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.httpStatus });
  }

  let meta: Record<string, unknown> = {};
  if (filterStoreId) {
    const commerce = await loadCommerceSettings(sb);
    const effective = await resolveEffectiveStoreFeePolicy(sb, { storeId: filterStoreId });
    const nameByStore: Record<string, string> = {};
    for (const s of storeList) nameByStore[s.id as string] = (s.store_name as string) ?? "";
    meta = {
      store_name: nameByStore[filterStoreId] ?? "",
      settlement_fee_percent: effective.feePercent,
      settlement_fee_scope: effective.scope,
      settlement_fee_policy_name: effective.policyName,
      settlement_delay_days: commerce.settlementDelayDays,
      current_policy_note: "current_effective_policy_not_order_snapshot",
      period_basis: periodBasis,
      period_field:
        periodBasis === "order_completed"
          ? "order_completed_recognition"
          : periodBasis === "paid_at"
            ? "store_settlements.paid_at"
            : "store_settlements.created_at",
      truncated: loaded.truncated,
    };
  }

  return NextResponse.json({
    ok: true,
    stores: storeList,
    meta,
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
      order_status: f.order_status,
      payment_status: f.payment_status,
      ordered_at: f.ordered_at,
      completed_at: f.completed_at,
      gross_amount: f.gross_amount,
      discount_amount: f.discount_amount,
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
      applied_fee_policy_snapshot: f.applied_fee_policy_snapshot,
    })),
  });
}
