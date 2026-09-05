/**
 * ARO-OPS-UX-002-B3 — Store Financial Statement loader.
 * Composes existing Coin/Cash ledgers, settlements, obligations. No new tables.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUSINESS_CASH_CHARGE_REQUESTS_TABLE,
  BUSINESS_CASH_LEDGER_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  loadStoreBusinessCashBalance,
  loadStoreEconomicPointsBalance,
} from "@/lib/stores/advertising/canonical-business-cash-writer";
import {
  loadStoreSettlementFinancialFacts,
  settlementPeriodDayToIso,
} from "@/lib/stores/load-store-settlement-financial-facts";
import {
  businessCcBackToStoreHref,
  businessCcCashChargesHref,
  businessCcDeliveryAdsHref,
  businessCcFinanceHref,
  businessCcSettlementsHref,
  businessCcStoreOrdersHref,
  businessCcSupportHref,
} from "@/lib/admin-business/business-control-center-links";
import type {
  StoreFinancialObligationRow,
  StoreFinancialPeriodKey,
  StoreFinancialStatementEvent,
  StoreFinancialStatementModel,
} from "@/lib/admin/store-financial-statement/types";

function dayInManila(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysIsoDay(day: string, delta: number): string {
  const t = new Date(`${day}T12:00:00+08:00`).getTime() + delta * 86400000;
  return dayInManila(new Date(t));
}

export function resolveStoreFinancialPeriod(input: {
  period?: string | null;
  fromDay?: string | null;
  toDay?: string | null;
}): { key: StoreFinancialPeriodKey; fromIso: string; toIso: string; fromDay: string; toDay: string } {
  const today = dayInManila();
  const raw = String(input.period ?? "30d").trim().toLowerCase();
  let key: StoreFinancialPeriodKey = "30d";
  let fromDay = addDaysIsoDay(today, -29);
  let toDay = today;
  if (raw === "today") {
    key = "today";
    fromDay = today;
  } else if (raw === "7d") {
    key = "7d";
    fromDay = addDaysIsoDay(today, -6);
  } else if (raw === "custom" && input.fromDay && input.toDay) {
    key = "custom";
    fromDay = String(input.fromDay).trim();
    toDay = String(input.toDay).trim();
  }
  const bounds = settlementPeriodDayToIso(fromDay, toDay);
  return {
    key,
    fromDay,
    toDay,
    fromIso: bounds.fromIso ?? `${fromDay}T00:00:00.000Z`,
    toIso: bounds.toIso ?? `${toDay}T23:59:59.999Z`,
  };
}

function phpLabel(n: number | null): string | null {
  if (n == null) return null;
  return `₱${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function minorLabel(minor: number | null): string | null {
  if (minor == null) return null;
  return phpLabel(Math.trunc(minor) / 100);
}

function inPeriod(iso: string, fromIso: string, toIso: string): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= new Date(fromIso).getTime() && t <= new Date(toIso).getTime();
}

function hrefForRelated(relatedType: string, relatedId: string, storeId: string): string | null {
  const t = relatedType.trim();
  const id = relatedId.trim();
  if (!id) return null;
  if (t === "store_order" || t === "order") {
    return `/admin/store-orders?store_id=${encodeURIComponent(storeId)}&q=${encodeURIComponent(id)}`;
  }
  if (t === "delivery_ad" || t === "campaign" || t.includes("ad")) {
    return `/admin/delivery-ads/${encodeURIComponent(id)}`;
  }
  if (t.includes("charge") || t === "business_cash_charge_request") {
    return businessCcCashChargesHref();
  }
  if (t.includes("partner")) return "/admin/delivery-ads/partner";
  return null;
}

function normalizeFeePercent(rate: number): number | null {
  if (!Number.isFinite(rate) || rate < 0) return null;
  if (rate === 0) return 0;
  // Historical: some rows used fraction (0.05); product writers store percent (5).
  // Never treat exact 1 as fraction — that would turn a real 1% into 100%.
  if (rate > 0 && rate < 1) return Math.round(rate * 10000) / 100;
  return rate;
}

export async function loadStoreFinancialStatement(
  sb: SupabaseClient,
  storeIdRaw: string,
  periodInput: { period?: string | null; fromDay?: string | null; toDay?: string | null }
): Promise<StoreFinancialStatementModel | { ok: false; error: string; httpStatus: number }> {
  const storeId = storeIdRaw.trim();
  if (!storeId) return { ok: false, error: "missing_store_id", httpStatus: 400 };

  const period = resolveStoreFinancialPeriod(periodInput);
  const sectionErrors: string[] = [];

  const storeRes = await sb
    .from("stores")
    .select("id, store_name, slug, approval_status, region, city, owner_user_id")
    .eq("id", storeId)
    .maybeSingle();
  if (storeRes.error || !storeRes.data) {
    return { ok: false, error: "store_not_found", httpStatus: 404 };
  }
  const storeRow = storeRes.data as Record<string, unknown>;
  const ownerUserId = storeRow.owner_user_id ? String(storeRow.owner_user_id) : null;
  let ownerLabel: string | null = null;
  if (ownerUserId) {
    const { data: prof } = await sb
      .from("profiles")
      .select("nickname, username")
      .eq("id", ownerUserId)
      .maybeSingle();
    ownerLabel =
      String((prof as { nickname?: string } | null)?.nickname ?? "").trim() ||
      String((prof as { username?: string } | null)?.username ?? "").trim() ||
      null;
  }

  let coinBalance: number | null = null;
  let cashBalanceMinor: number | null = null;
  try {
    const coinBal = await loadStoreEconomicPointsBalance(sb, storeId);
    coinBalance = typeof coinBal.balance === "number" ? coinBal.balance : null;
  } catch {
    sectionErrors.push("coin_balance");
  }
  try {
    const cashBal = await loadStoreBusinessCashBalance(sb, storeId);
    cashBalanceMinor = typeof cashBal.balanceMinor === "number" ? cashBal.balanceMinor : null;
  } catch {
    sectionErrors.push("cash_balance");
  }

  const [settlements, coinLedgerRes, cashLedgerRes, topUpsRes, obligationsRes, cancelCountRes] =
    await Promise.all([
      loadStoreSettlementFinancialFacts(sb, {
        storeIds: [storeId],
        fromIso: period.fromIso,
        toIso: period.toIso,
        periodBasis: "settlement_created",
        authorityLimit: 500,
        pageLimit: 80,
        pageOffset: 0,
      }),
      (sb as any)
        .from(STORE_ECONOMIC_POINT_LEDGER_TABLE)
        .select("id, entry_kind, amount, balance_after, related_type, related_id, meta, created_at")
        .eq("store_id", storeId)
        .gte("created_at", period.fromIso)
        .lte("created_at", period.toIso)
        .order("created_at", { ascending: false })
        .limit(100),
      (sb as any)
        .from(BUSINESS_CASH_LEDGER_TABLE)
        .select(
          "id, entry_kind, direction, amount_minor, balance_after_minor, related_type, related_id, meta, created_at"
        )
        .eq("store_id", storeId)
        .gte("created_at", period.fromIso)
        .lte("created_at", period.toIso)
        .order("created_at", { ascending: false })
        .limit(100),
      (sb as any)
        .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
        .select("id, amount_minor, status, created_at, decided_at")
        .eq("store_id", storeId)
        .gte("created_at", period.fromIso)
        .lte("created_at", period.toIso)
        .order("created_at", { ascending: false })
        .limit(40),
      (sb as any)
        .from("store_sale_fee_obligations")
        .select(
          "id, order_id, fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, created_at, settled_at"
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(80),
      (sb as any)
        .from("store_orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("order_status", "cancelled")
        .gte("updated_at", period.fromIso)
        .lte("updated_at", period.toIso),
    ]);

  const settlementsUnavailable = !settlements.ok;
  if (!settlements.ok) sectionErrors.push(`settlements:${settlements.error}`);
  const settlementFacts = settlements.ok ? settlements.facts : [];
  const settlementSummary = settlements.ok ? settlements.summary : null;

  if (coinLedgerRes.error) sectionErrors.push(`coin_ledger:${coinLedgerRes.error.message}`);
  if (cashLedgerRes.error) sectionErrors.push(`cash_ledger:${cashLedgerRes.error.message}`);
  if (topUpsRes.error) sectionErrors.push(`cash_topups:${topUpsRes.error.message}`);
  if (obligationsRes.error) sectionErrors.push(`obligations:${obligationsRes.error.message}`);

  const coinEvents: StoreFinancialStatementEvent[] = [];
  let saleCredits = 0;
  let convertOut = 0;
  for (const row of (coinLedgerRes.error ? [] : coinLedgerRes.data) ?? []) {
    const kind = String(row.entry_kind ?? "");
    const amount = Math.trunc(Number(row.amount) || 0);
    const relatedType = String(row.related_type ?? "");
    const relatedId = String(row.related_id ?? "");
    if (kind === "SALE_EARN" || kind === "ECONOMIC_INFLOW") saleCredits += Math.max(0, amount);
    if (kind === "CONVERT_TO_BUSINESS_CASH") convertOut += Math.abs(amount);
    coinEvents.push({
      id: `coin:${row.id}`,
      at: String(row.created_at ?? ""),
      domain: "coin",
      type: kind,
      direction: amount >= 0 ? "in" : "out",
      currency: "COIN",
      amount: Math.abs(amount),
      amountMinor: null,
      status: null,
      relatedType: relatedType || null,
      relatedId: relatedId || null,
      href: hrefForRelated(relatedType, relatedId, storeId),
      source: "store_economic_point_ledger",
    });
  }

  const cashEvents: StoreFinancialStatementEvent[] = [];
  let topUpIn = 0;
  let conversionIn = 0;
  let adDebit = 0;
  let partnerDebit = 0;
  let feeDebit = 0;
  let refundIn = 0;
  for (const row of (cashLedgerRes.error ? [] : cashLedgerRes.data) ?? []) {
    const kind = String(row.entry_kind ?? "");
    const direction = String(row.direction ?? "");
    const minor = Math.trunc(Number(row.amount_minor) || 0);
    const relatedType = String(row.related_type ?? "");
    const relatedId = String(row.related_id ?? "");
    if (kind === "TOP_UP" && direction === "credit") topUpIn += minor;
    if (kind === "CONVERT_FROM_STORE_POINTS" && direction === "credit") conversionIn += minor;
    if (kind === "AD_SPEND" && direction === "debit") adDebit += minor;
    if (kind === "PARTNER_SPEND" && direction === "debit") partnerDebit += minor;
    if ((kind === "SALE_FEE" || kind === "SALE_FEE_SETTLEMENT") && direction === "debit") {
      feeDebit += minor;
    }
    if ((kind === "AD_REFUND" || kind === "PARTNER_REFUND") && direction === "credit") {
      refundIn += minor;
    }
    cashEvents.push({
      id: `cash:${row.id}`,
      at: String(row.created_at ?? ""),
      domain: "cash",
      type: kind,
      direction: direction === "debit" ? "out" : "in",
      currency: "CASH_MINOR",
      amount: null,
      amountMinor: minor,
      status: null,
      relatedType: relatedType || null,
      relatedId: relatedId || null,
      href: hrefForRelated(relatedType, relatedId, storeId),
      source: "business_cash_ledger",
    });
  }

  const feeRows = settlementFacts.map((f) => ({
    settlementId: f.settlement_id,
    orderId: f.order_id,
    orderNo: f.order_no,
    saleAmount: f.confirmed_sale_revenue_php || f.gross_amount,
    feeRatePercent: normalizeFeePercent(f.commission_rate),
    feeAmount: f.commission_amount,
    fixedFeeAmount: f.fixed_fee_amount,
    settlementStatus: f.settlement_status,
    orderHref: `/admin/store-orders?store_id=${encodeURIComponent(storeId)}&q=${encodeURIComponent(f.order_id)}`,
    settlementHref: businessCcSettlementsHref(storeId),
    source: "store_settlements",
  }));

  const obligationRows: StoreFinancialObligationRow[] = ((obligationsRes.error ? [] : obligationsRes.data) ?? []).map(
    (row: Record<string, unknown>) => ({
      id: String(row.id ?? ""),
      orderId: String(row.order_id ?? ""),
      feeDueMinor: Math.trunc(Number(row.fee_due_minor) || 0),
      feePaidMinor: Math.trunc(Number(row.fee_paid_minor) || 0),
      feeOutstandingMinor: Math.trunc(Number(row.fee_outstanding_minor) || 0),
      status: String(row.status ?? ""),
      createdAt: String(row.created_at ?? ""),
      settledAt: row.settled_at ? String(row.settled_at) : null,
      orderHref: `/admin/store-orders?store_id=${encodeURIComponent(storeId)}&q=${encodeURIComponent(String(row.order_id ?? ""))}`,
      source: "store_sale_fee_obligations",
    })
  );
  const openOutstanding = obligationRows
    .filter((r) => r.status === "open")
    .reduce((s, r) => s + r.feeOutstandingMinor, 0);

  const settlementRows = settlementFacts.slice(0, 80).map((f) => ({
    settlementId: f.settlement_id,
    orderId: f.order_id,
    orderNo: f.order_no,
    periodAt: f.settlement_created_at,
    gross: f.gross_amount,
    fee: f.commission_amount + f.fixed_fee_amount,
    net: f.net_settlement_amount,
    status: f.settlement_status,
    paidAt: f.paid_at,
    href: businessCcSettlementsHref(storeId),
    source: "store_settlements",
  }));

  const topUps: Array<{
    id: string;
    amountMinor: number;
    status: string;
    createdAt: string;
    href: string;
  }> = ((topUpsRes.error ? [] : topUpsRes.data) ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    amountMinor: Math.trunc(Number(row.amount_minor) || 0),
    status: String(row.status ?? ""),
    createdAt: String(row.created_at ?? ""),
    href: businessCcCashChargesHref(),
  }));

  const chargeEvents: StoreFinancialStatementEvent[] = topUps.map((t) => ({
    id: `charge:${t.id}`,
    at: t.createdAt,
    domain: "charge",
    type: "CASH_TOP_UP_REQUEST",
    direction: "in",
    currency: "CASH_MINOR",
    amount: null,
    amountMinor: t.amountMinor,
    status: t.status,
    relatedType: "business_cash_charge_request",
    relatedId: t.id,
    href: t.href,
    source: "business_cash_charge_requests",
  }));

  const settlementEvents: StoreFinancialStatementEvent[] = settlementFacts.slice(0, 40).map((f) => ({
    id: `stl:${f.settlement_id}`,
    at: f.settlement_created_at,
    domain: "settlement",
    type: `SETTLEMENT_${String(f.settlement_status).toUpperCase()}`,
    direction: "info",
    currency: "PHP",
    amount: f.net_settlement_amount,
    amountMinor: null,
    status: f.settlement_status,
    relatedType: "store_settlement",
    relatedId: f.settlement_id,
    href: businessCcSettlementsHref(storeId),
    source: "store_settlements",
  }));

  const obligationEvents: StoreFinancialStatementEvent[] = obligationRows
    .filter((r) => inPeriod(r.createdAt, period.fromIso, period.toIso))
    .slice(0, 40)
    .map((r) => ({
      id: `obl:${r.id}`,
      at: r.createdAt,
      domain: "obligation",
      type: `FEE_OBLIGATION_${r.status.toUpperCase()}`,
      direction: "info",
      currency: "CASH_MINOR",
      amount: null,
      amountMinor: r.feeOutstandingMinor,
      status: r.status,
      relatedType: "store_order",
      relatedId: r.orderId,
      href: r.orderHref,
      source: "store_sale_fee_obligations",
    }));

  const timeline = [...coinEvents, ...cashEvents, ...chargeEvents, ...settlementEvents, ...obligationEvents].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  const cancelledCount =
    cancelCountRes.error || typeof cancelCountRes.count !== "number" ? null : cancelCountRes.count;

  const periodSales = settlementSummary?.gross ?? null;
  const periodFee = settlementSummary?.commission_gross ?? null;

  const flow = [
    {
      id: "sales",
      labelKo: "판매",
      labelEn: "Sales",
      amountLabel: phpLabel(periodSales),
      unavailable: periodSales == null,
    },
    {
      id: "fee",
      labelKo: "판매 수수료",
      labelEn: "Sale fee",
      amountLabel: phpLabel(periodFee),
      unavailable: periodFee == null,
    },
    {
      id: "coin",
      labelKo: "Coin 적립(기간)",
      labelEn: "Coin credits (period)",
      amountLabel: coinLedgerRes.error ? null : String(saleCredits),
      unavailable: !!coinLedgerRes.error,
    },
    {
      id: "convert",
      labelKo: "Coin→Cash",
      labelEn: "Coin→Cash",
      amountLabel: cashLedgerRes.error ? null : minorLabel(conversionIn),
      unavailable: !!cashLedgerRes.error,
    },
    {
      id: "topup",
      labelKo: "Cash 충전",
      labelEn: "Cash top-up",
      amountLabel: cashLedgerRes.error ? null : minorLabel(topUpIn),
      unavailable: !!cashLedgerRes.error,
    },
    {
      id: "ads",
      labelKo: "광고 차감",
      labelEn: "Ad debit",
      amountLabel: cashLedgerRes.error ? null : minorLabel(adDebit),
      unavailable: !!cashLedgerRes.error,
    },
    {
      id: "partner",
      labelKo: "Partner 차감",
      labelEn: "Partner debit",
      amountLabel: cashLedgerRes.error ? null : minorLabel(partnerDebit),
      unavailable: !!cashLedgerRes.error,
    },
    {
      id: "fee_cash",
      labelKo: "수수료 Cash 차감",
      labelEn: "Fee Cash debit",
      amountLabel: cashLedgerRes.error ? null : minorLabel(feeDebit),
      unavailable: !!cashLedgerRes.error,
    },
    {
      id: "refund",
      labelKo: "환불(Cash)",
      labelEn: "Cash refund",
      amountLabel: cashLedgerRes.error ? null : minorLabel(refundIn),
      unavailable: !!cashLedgerRes.error,
    },
    {
      id: "settlement",
      labelKo: "정산(대기/지급)",
      labelEn: "Settlement",
      amountLabel:
        settlementSummary == null
          ? null
          : `pending ${phpLabel(settlementSummary.pending_net) ?? "—"} / paid ${phpLabel(settlementSummary.paid_net) ?? "—"}`,
      unavailable: settlementSummary == null,
    },
    {
      id: "balances",
      labelKo: "현재 Coin / Cash",
      labelEn: "Current Coin / Cash",
      amountLabel:
        coinBalance == null && cashBalanceMinor == null
          ? null
          : `Coin ${coinBalance ?? "—"} / Cash ${minorLabel(cashBalanceMinor) ?? "—"}`,
      unavailable: coinBalance == null && cashBalanceMinor == null,
    },
  ];

  return {
    store: {
      id: storeId,
      name: String(storeRow.store_name ?? ""),
      slug: storeRow.slug ? String(storeRow.slug) : null,
      status: storeRow.approval_status ? String(storeRow.approval_status) : null,
      region: String(storeRow.region ?? storeRow.city ?? "").trim() || null,
      ownerUserId,
      ownerLabel,
    },
    period: {
      key: period.key,
      fromIso: period.fromIso,
      toIso: period.toIso,
    },
    links: {
      business: businessCcBackToStoreHref(storeId),
      orders: businessCcStoreOrdersHref(storeId),
      settlements: businessCcSettlementsHref(storeId),
      finance: businessCcFinanceHref(storeId),
      ads: businessCcDeliveryAdsHref(storeId),
      support: businessCcSupportHref(storeId),
      cashCharges: businessCcCashChargesHref(),
    },
    summary: {
      periodSales: { amount: periodSales, source: "store_settlements.summary.gross" },
      periodFee: { amount: periodFee, source: "store_settlements.summary.commission_gross" },
      coinBalance: {
        amount: coinBalance,
        source: "store_economic_point_accounts.balance",
        pointInTime: true,
      },
      cashBalanceMinor: {
        amountMinor: cashBalanceMinor,
        source: "business_cash_accounts.balance_minor",
        pointInTime: true,
      },
      settlementPendingNet: {
        amount: settlementSummary?.pending_net ?? null,
        source: "store_settlements.summary.pending_net",
      },
      unpaidFeeObligationMinor: {
        amountMinor: obligationsRes.error ? null : openOutstanding,
        source: "store_sale_fee_obligations.open sum",
      },
    },
    sales: {
      orderCount: settlementSummary?.order_count ?? null,
      completedCount: settlementSummary?.order_count ?? null,
      cancelledCount,
      gross: periodSales,
      refund: settlementSummary?.refund ?? null,
      source: "store_settlements + store_orders.cancelled",
      unavailable: settlementsUnavailable,
    },
    fees: {
      rows: feeRows,
      unavailable: settlementsUnavailable,
      source: "store_settlements.platform_fee_percent/amount",
    },
    obligations: {
      rows: obligationRows,
      outstandingMinor: obligationsRes.error ? null : openOutstanding,
      unavailable: !!obligationsRes.error,
      source: "store_sale_fee_obligations",
    },
    coin: {
      balance: coinBalance,
      saleCredits: coinLedgerRes.error ? null : saleCredits,
      conversionsOut: coinLedgerRes.error ? null : convertOut,
      ledger: coinEvents,
      unavailable: coinBalance == null && !!coinLedgerRes.error,
      source: "store_economic_point_accounts + store_economic_point_ledger",
    },
    cash: {
      balanceMinor: cashBalanceMinor,
      topUpInMinor: cashLedgerRes.error ? null : topUpIn,
      conversionInMinor: cashLedgerRes.error ? null : conversionIn,
      adDebitMinor: cashLedgerRes.error ? null : adDebit,
      partnerDebitMinor: cashLedgerRes.error ? null : partnerDebit,
      feeDebitMinor: cashLedgerRes.error ? null : feeDebit,
      refundInMinor: cashLedgerRes.error ? null : refundIn,
      ledger: cashEvents,
      topUps,
      unavailable: cashBalanceMinor == null && !!cashLedgerRes.error,
      source: "business_cash_accounts + business_cash_ledger",
    },
    settlements: {
      rows: settlementRows,
      pendingNet: settlementSummary?.pending_net ?? null,
      paidNet: settlementSummary?.paid_net ?? null,
      unavailable: settlementsUnavailable,
      source: "store_settlements",
    },
    flow,
    timeline,
    sectionErrors,
  };
}
