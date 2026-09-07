/**
 * StoreStatement loader — Admin/Owner shared. STORE_CASH ads only in adSpend.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreStatement } from "@/lib/finance/store-statement/types";
import {
  BUSINESS_CASH_LEDGER_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  loadStoreSettlementFinancialFacts,
} from "@/lib/stores/load-store-settlement-financial-facts";
import { summarizeStoreOrderFinancialFacts } from "@/lib/stores/store-order-financial-fact";

function sumCoinBefore(
  rows: Array<{ amount: number; balance_after: number }>,
  ascending: boolean
): number {
  if (rows.length === 0) return 0;
  const first = ascending ? rows[0] : rows[rows.length - 1];
  return Math.trunc(first.balance_after) - Math.trunc(first.amount);
}

export async function loadStoreStatement(
  sb: SupabaseClient,
  input: { storeId: string; fromIso: string; toIso: string }
): Promise<StoreStatement | null> {
  const storeId = input.storeId.trim();
  if (!storeId) return null;

  const { data: store } = await sb
    .from("stores")
    .select("id, store_name, owner_user_id")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) return null;

  const settlementRes = await loadStoreSettlementFinancialFacts(sb, {
    storeIds: [storeId],
    fromIso: input.fromIso,
    toIso: input.toIso,
  });
  if (!settlementRes || ("ok" in settlementRes && settlementRes.ok === false)) {
    return null;
  }
  const facts =
    "facts" in settlementRes ? settlementRes.facts : [];
  const summary = summarizeStoreOrderFinancialFacts(facts);

  const { data: obligations } = await sb
    .from("store_sale_fee_obligations")
    .select("fee_outstanding_minor, status")
    .eq("store_id", storeId)
    .eq("status", "open");
  const outstandingMinor = ((obligations ?? []) as Array<{ fee_outstanding_minor?: number }>).reduce(
    (s, r) => s + Math.trunc(Number(r.fee_outstanding_minor) || 0),
    0
  );

  const [{ data: coinLedger }, { data: cashLedger }] = await Promise.all([
    sb
      .from(STORE_ECONOMIC_POINT_LEDGER_TABLE)
      .select("entry_kind, amount, balance_after, created_at")
      .eq("store_id", storeId)
      .gte("created_at", input.fromIso)
      .lte("created_at", input.toIso)
      .order("created_at", { ascending: true })
      .limit(2000),
    sb
      .from(BUSINESS_CASH_LEDGER_TABLE)
      .select("entry_kind, direction, amount_minor, balance_after_minor, created_at")
      .eq("store_id", storeId)
      .gte("created_at", input.fromIso)
      .lte("created_at", input.toIso)
      .order("created_at", { ascending: true })
      .limit(2000),
  ]);

  const coinRows = (coinLedger ?? []) as Array<{
    entry_kind?: string;
    amount?: number;
    balance_after?: number;
  }>;
  let coinEarned = 0;
  let coinConverted = 0;
  let coinWithdrawn = 0;
  let coinAdj = 0;
  for (const r of coinRows) {
    const kind = String(r.entry_kind ?? "");
    const amt = Math.trunc(Number(r.amount) || 0);
    if (kind === "SALE_EARN" || kind === "GIFT_REDEMPTION_EARN" || kind === "ECONOMIC_INFLOW") {
      coinEarned += Math.max(0, amt);
    } else if (kind === "CONVERT_TO_BUSINESS_CASH") {
      coinConverted += Math.abs(amt);
    } else if (kind.startsWith("WITHDRAWAL")) {
      coinWithdrawn += Math.abs(amt);
    } else if (kind === "ADMIN_ADJUST" || kind === "REVERSAL") {
      coinAdj += amt;
    }
  }
  const coinOpening =
    coinRows.length > 0
      ? sumCoinBefore(
          coinRows.map((r) => ({
            amount: Math.trunc(Number(r.amount) || 0),
            balance_after: Math.trunc(Number(r.balance_after) || 0),
          })),
          true
        )
      : 0;
  const coinClosing =
    coinRows.length > 0
      ? Math.trunc(Number(coinRows[coinRows.length - 1]?.balance_after) || 0)
      : coinOpening;
  const coinExpected = coinOpening + coinEarned + Math.max(0, coinAdj) - coinConverted - coinWithdrawn + Math.min(0, coinAdj);
  const discrepancies: string[] = [];
  // Soft check — reversals make exact equality hard; flag large gaps only when rows exist
  if (coinRows.length > 0 && Math.abs(coinExpected - coinClosing) > 1) {
    discrepancies.push(`coin_reconcile_gap:${coinExpected - coinClosing}`);
  }

  const cashRows = (cashLedger ?? []) as Array<{
    entry_kind?: string;
    direction?: string;
    amount_minor?: number;
    balance_after_minor?: number;
  }>;
  let topup = 0;
  let fromConv = 0;
  let refund = 0;
  let saleFee = 0;
  let adSpend = 0;
  let partnerSpend = 0;
  let outstandingColl = 0;
  let adjCredit = 0;
  let adjDebit = 0;
  for (const r of cashRows) {
    const kind = String(r.entry_kind ?? "");
    const dir = String(r.direction ?? "").toLowerCase();
    const minor = Math.trunc(Number(r.amount_minor) || 0);
    if (kind === "TOP_UP") topup += minor;
    else if (kind === "CONVERT_FROM_STORE_POINTS") fromConv += minor;
    else if (kind === "AD_REFUND" || kind === "PARTNER_REFUND") refund += minor;
    else if (kind === "SALE_FEE") saleFee += minor;
    else if (kind === "SALE_FEE_SETTLEMENT") outstandingColl += minor;
    else if (kind === "AD_SPEND") adSpend += minor;
    else if (kind === "PARTNER_SPEND") partnerSpend += minor;
    else if (kind === "ADMIN_ADJUST") {
      if (dir === "credit") adjCredit += minor;
      else adjDebit += minor;
    }
  }
  const cashOpening =
    cashRows.length > 0
      ? (() => {
          const first = cashRows[0];
          const after = Math.trunc(Number(first.balance_after_minor) || 0);
          const amt = Math.trunc(Number(first.amount_minor) || 0);
          const dir = String(first.direction ?? "").toLowerCase();
          return dir === "credit" ? after - amt : after + amt;
        })()
      : 0;
  const cashClosing =
    cashRows.length > 0
      ? Math.trunc(Number(cashRows[cashRows.length - 1]?.balance_after_minor) || 0)
      : cashOpening;

  return {
    storeId,
    storeName: String((store as { store_name?: string }).store_name ?? ""),
    ownerId: (store as { owner_user_id?: string | null }).owner_user_id
      ? String((store as { owner_user_id: string }).owner_user_id)
      : null,
    currency: "PHP",
    fromIso: input.fromIso,
    toIso: input.toIso,
    sales: {
      orders: summary.order_count,
      gross: summary.gross,
      settlementFee: summary.platform_commission_revenue,
      outstanding: outstandingMinor / 100,
    },
    coin: {
      opening: coinOpening,
      earned: coinEarned,
      converted: coinConverted,
      withdrawn: coinWithdrawn,
      adjustment: coinAdj,
      closing: coinClosing,
    },
    cash: {
      openingMinor: cashOpening,
      topupMinor: topup,
      fromConversionMinor: fromConv,
      refundMinor: refund,
      saleFeeMinor: saleFee,
      adSpendMinor: adSpend,
      partnerSpendMinor: partnerSpend,
      outstandingCollectionMinor: outstandingColl,
      adjustmentCreditMinor: adjCredit,
      adjustmentDebitMinor: adjDebit,
      closingMinor: cashClosing,
    },
    discrepancies,
  };
}
