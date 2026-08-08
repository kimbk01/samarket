/**
 * Shared settlement financial loader — Owner + Admin READ the same projection.
 * Summary is computed from the full filtered set on the server (pagination-independent).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  projectStoreOrderFinancialFact,
  summarizeStoreOrderFinancialFacts,
  type StoreOrderFinancialFact,
  type StoreOrderFinancialSummary,
  type SettlementLedgerRowLike,
  type OrderJoinLike,
} from "@/lib/stores/store-order-financial-fact";

const SETTLEMENT_SELECT =
  "id, store_id, order_id, gross_amount, fee_amount, settlement_amount, settlement_status, settlement_due_date, paid_at, hold_reason, created_at, platform_fee_percent, platform_fee_amount, fixed_fee_amount, delivery_income_amount, discount_burden_amount, refund_amount, net_settlement_amount, commission_reversal_amount, applied_fee_policy_id, applied_fee_policy_snapshot, payout_method, payout_reference, payout_confirmed_at, payout_note";

const SETTLEMENT_SELECT_LEGACY =
  "id, store_id, order_id, gross_amount, fee_amount, settlement_amount, settlement_status, settlement_due_date, paid_at, hold_reason, created_at, platform_fee_percent, platform_fee_amount, fixed_fee_amount, delivery_income_amount, discount_burden_amount, refund_amount, net_settlement_amount, applied_fee_policy_id, applied_fee_policy_snapshot, payout_method, payout_reference, payout_confirmed_at, payout_note";

const ORDER_SELECT =
  "id, order_no, buyer_user_id, order_status, payment_status, payment_amount, discount_amount, delivery_fee_amount, created_at, updated_at, refunded_at";

export type LoadStoreSettlementFinancialFilters = {
  storeIds: string[];
  fromIso?: string | null;
  toIso?: string | null;
  /**
   * Period axis (UTC day bounds applied to this timestamp):
   * - settlement_created: store_settlements.created_at (default — settlement ledger period)
   * - order_completed: order completion recognition (sales period proxy)
   * - paid_at: store_settlements.paid_at (payout period)
   */
  periodBasis?: "settlement_created" | "order_completed" | "paid_at";
  settlementStatus?: string | null;
  refundOnly?: boolean;
  heldOnly?: boolean;
  unpaidOnly?: boolean;
  payoutStatus?: "" | "paid" | "unpaid";
  orderNo?: string | null;
  authorityLimit?: number;
  pageLimit?: number;
  pageOffset?: number;
  includeBuyerDisplay?: boolean;
};

export type LoadStoreSettlementFinancialResult = {
  ok: true;
  facts: StoreOrderFinancialFact[];
  summary: StoreOrderFinancialSummary;
  total_matched: number;
  truncated: boolean;
};

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

export function settlementPeriodDayToIso(fromDay?: string | null, toDay?: string | null) {
  return {
    fromIso: fromDay ? isoDayStartUtc(fromDay) : null,
    toIso: toDay ? isoDayEndUtc(toDay) : null,
  };
}

export async function loadStoreSettlementFinancialFacts(
  sb: SupabaseClient,
  filters: LoadStoreSettlementFinancialFilters
): Promise<LoadStoreSettlementFinancialResult | { ok: false; error: string; httpStatus: number }> {
  const storeIds = filters.storeIds.map((s) => s.trim()).filter(Boolean);
  if (storeIds.length === 0) {
    return {
      ok: true,
      facts: [],
      summary: summarizeStoreOrderFinancialFacts([]),
      total_matched: 0,
      truncated: false,
    };
  }

  const authorityLimit = Math.min(Math.max(filters.authorityLimit ?? 5000, 1), 5000);
  const periodBasis = filters.periodBasis ?? "settlement_created";

  const runSelect = async (select: string) => {
    let q = sb
      .from("store_settlements")
      .select(select)
      .in("store_id", storeIds)
      .order("created_at", { ascending: false })
      .limit(authorityLimit);

    // Settlement / payout axes can be pushed to SQL. Sales (order_completed) filtered after join.
    if (periodBasis === "settlement_created") {
      if (filters.fromIso) q = q.gte("created_at", filters.fromIso);
      if (filters.toIso) q = q.lte("created_at", filters.toIso);
    } else if (periodBasis === "paid_at") {
      if (filters.fromIso) q = q.gte("paid_at", filters.fromIso);
      if (filters.toIso) q = q.lte("paid_at", filters.toIso);
    }

    if (filters.refundOnly) q = q.gt("refund_amount", 0);
    if (filters.heldOnly) q = q.eq("settlement_status", "held");

    if (filters.settlementStatus) {
      q = q.eq("settlement_status", filters.settlementStatus);
    } else if (filters.unpaidOnly) {
      q = q.in("settlement_status", ["scheduled", "processing", "held"]);
    } else if (filters.payoutStatus === "paid") {
      q = q.eq("settlement_status", "paid");
    } else if (filters.payoutStatus === "unpaid") {
      q = q.neq("settlement_status", "paid");
    }

    return q;
  };

  let { data: rows, error } = await runSelect(SETTLEMENT_SELECT);
  if (error && /commission_reversal_amount/i.test(error.message ?? "")) {
    ({ data: rows, error } = await runSelect(SETTLEMENT_SELECT_LEGACY));
  }
  if (error) {
    if (error.message?.includes("store_settlements") && error.message.includes("does not exist")) {
      return { ok: false, error: "table_missing", httpStatus: 503 };
    }
    console.error("[loadStoreSettlementFinancialFacts]", error);
    return { ok: false, error: error.message, httpStatus: 500 };
  }

  let list = (rows ?? []) as unknown as SettlementLedgerRowLike[];
  const truncated = list.length >= authorityLimit;

  const orderIds = [...new Set(list.map((r) => r.order_id))];
  const orderMap: Record<string, OrderJoinLike> = {};
  if (orderIds.length) {
    const { data: orders } = await sb.from("store_orders").select(ORDER_SELECT).in("id", orderIds);
    for (const o of orders ?? []) {
      orderMap[(o as OrderJoinLike).id] = o as OrderJoinLike;
    }
  }

  if (periodBasis === "order_completed" && (filters.fromIso || filters.toIso)) {
    const fromMs = filters.fromIso ? new Date(filters.fromIso).getTime() : Number.NEGATIVE_INFINITY;
    const toMs = filters.toIso ? new Date(filters.toIso).getTime() : Number.POSITIVE_INFINITY;
    list = list.filter((r) => {
      const o = orderMap[r.order_id];
      if (!o) return false;
      const completedIso =
        (typeof o.completed_at === "string" && o.completed_at) ||
        (String(o.order_status ?? "") === "completed" && typeof o.updated_at === "string"
          ? o.updated_at
          : null) ||
        // ledger recognition clock when order completion timestamp unavailable
        r.created_at;
      const t = new Date(completedIso).getTime();
      if (!Number.isFinite(t)) return false;
      return t >= fromMs && t <= toMs;
    });
  }

  const orderNoQ = filters.orderNo?.trim().toLowerCase() ?? "";
  if (orderNoQ) {
    list = list.filter((r) => {
      const no = String(orderMap[r.order_id]?.order_no ?? "")
        .trim()
        .toLowerCase();
      return no.includes(orderNoQ) || r.order_id.toLowerCase().includes(orderNoQ);
    });
  }

  const storeIdsOnPage = [...new Set(list.map((r) => r.store_id))];
  const names: Record<string, string> = {};
  if (storeIdsOnPage.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIdsOnPage);
    for (const s of stores ?? []) names[s.id as string] = (s.store_name as string) ?? "";
  }

  const buyerIds = filters.includeBuyerDisplay
    ? [...new Set(list.map((r) => orderMap[r.order_id]?.buyer_user_id).filter(Boolean) as string[])]
    : [];
  const buyerDisplay: Record<string, string> = {};
  if (buyerIds.length) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, display_name, nickname, username")
      .in("id", buyerIds);
    for (const p of profiles ?? []) {
      const id = String((p as { id?: string }).id ?? "");
      const label =
        String((p as { display_name?: string }).display_name ?? "").trim() ||
        String((p as { nickname?: string }).nickname ?? "").trim() ||
        String((p as { username?: string }).username ?? "").trim() ||
        id.slice(0, 8);
      buyerDisplay[id] = label;
    }
  }

  const allFacts = list.map((s) => {
    const o = orderMap[s.order_id] ?? null;
    const buyerId = o?.buyer_user_id ? String(o.buyer_user_id) : null;
    return projectStoreOrderFinancialFact({
      settlement: s,
      order: o,
      storeName: names[s.store_id] ?? "",
      buyerDisplay: buyerId ? buyerDisplay[buyerId] ?? buyerId.slice(0, 8) : null,
    });
  });

  const summary = summarizeStoreOrderFinancialFacts(allFacts);

  const offset = Math.max(0, filters.pageOffset ?? 0);
  const pageLimit = filters.pageLimit != null ? Math.max(1, filters.pageLimit) : allFacts.length;
  const facts = allFacts.slice(offset, offset + pageLimit);

  return {
    ok: true,
    facts,
    summary,
    total_matched: allFacts.length,
    truncated,
  };
}
