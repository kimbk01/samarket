/**
 * StoreStatement loader — Admin/Owner shared. STORE_CASH ads only in adSpend.
 *
 * FIN-07: sales = completed orders (`store_platform_payable_page` summary: direct + platform-held),
 * settlementFee = net commission (`store_commission_breakdown`) — the same SQL as the Admin/Owner
 * settlement screens. Legacy `store_settlements` snapshots are never a numeric source here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sumCoinLedgerContributions } from "@/lib/stores/owner-finance-recent-window";
import type { StoreStatement } from "@/lib/finance/store-statement/types";
import {
  BUSINESS_CASH_LEDGER_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  loadStoreCommissionBreakdown,
  loadStorePlatformPayable,
} from "@/lib/stores/commission/load-store-commission-ledger";

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

  let salesOrders = 0;
  let salesGross = 0;
  let netCommissionMinor = 0;
  try {
    const [payable, fee] = await Promise.all([
      loadStorePlatformPayable(sb, {
        storeIds: [storeId],
        fromIso: input.fromIso,
        toIso: input.toIso,
        view: "all",
        limit: 1,
        offset: 0,
      }),
      loadStoreCommissionBreakdown(sb, {
        storeIds: [storeId],
        fromIso: input.fromIso,
        toIso: input.toIso,
        group: "store",
      }),
    ]);
    salesOrders = payable.summary.orders;
    salesGross = payable.summary.directCollectedPhp + payable.summary.platformHeldPhp;
    netCommissionMinor = fee.reduce((n, b) => n + b.netCommissionMinor, 0);
  } catch (e) {
    console.error("[loadStoreStatement] commission_ssot", e);
    return null;
  }

  const { data: obligations } = await sb
    .from("store_sale_fee_obligations")
    .select("fee_outstanding_minor, status")
    .eq("store_id", storeId)
    .eq("status", "open");
  const outstandingMinor = ((obligations ?? []) as Array<{ fee_outstanding_minor?: number }>).reduce(
    (s, r) => s + Math.trunc(Number(r.fee_outstanding_minor) || 0),
    0
  );

  // 기간 안에 원장 행이 없을 때 시작·종료 잔액 = 기간 이전 마지막 기록 잔액 (0 으로 두지 않음 — 실기 FAIL 2026-11-03:
  // 30일 기간에 거래가 없던 매장이 Coin 10,931 인데 「Coin 잔액 0」 으로 표시됨).
  const [{ data: coinBefore }, { data: cashBefore }] = await Promise.all([
    sb
      .from(STORE_ECONOMIC_POINT_LEDGER_TABLE)
      .select("balance_after")
      .eq("store_id", storeId)
      .lt("created_at", input.fromIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from(BUSINESS_CASH_LEDGER_TABLE)
      .select("balance_after_minor")
      .eq("store_id", storeId)
      .lt("created_at", input.fromIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const coinBeforePeriod = Math.trunc(Number((coinBefore as { balance_after?: number } | null)?.balance_after) || 0);
  const cashBeforePeriod = Math.trunc(
    Number((cashBefore as { balance_after_minor?: number } | null)?.balance_after_minor) || 0
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
  // P0-2 — 공용 분류 규칙: 순출금(신청 − 반려 환원), REVERSAL·ADMIN_ADJUST 는 부호 그대로 조정.
  const coinSums = sumCoinLedgerContributions(
    coinRows.map((r) => ({ entryKind: String(r.entry_kind ?? ""), amount: Math.trunc(Number(r.amount) || 0) }))
  );
  const coinEarned = coinSums.earned;
  const coinConverted = coinSums.converted;
  const coinWithdrawn = coinSums.withdrawn;
  const coinAdj = coinSums.adjusted - coinSums.reversed + coinSums.other;
  const coinOpening =
    coinRows.length > 0
      ? sumCoinBefore(
          coinRows.map((r) => ({
            amount: Math.trunc(Number(r.amount) || 0),
            balance_after: Math.trunc(Number(r.balance_after) || 0),
          })),
          true
        )
      : coinBeforePeriod;
  const coinClosing =
    coinRows.length > 0
      ? Math.trunc(Number(coinRows[coinRows.length - 1]?.balance_after) || 0)
      : coinOpening;
  // 항등식: closing = opening + earned − converted − withdrawn + adj (정확히 일치해야 함).
  const coinExpected = coinOpening + coinEarned - coinConverted - coinWithdrawn + coinAdj;
  const discrepancies: string[] = [];
  if (coinRows.length > 0 && coinExpected !== coinClosing) {
    discrepancies.push(`coin_reconcile_gap:${coinExpected - coinClosing}`);
  }
  if (coinSums.other !== 0) discrepancies.push(`coin_unclassified_kind:${coinSums.other}`);

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
      : cashBeforePeriod;
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
      orders: salesOrders,
      gross: salesGross,
      settlementFee: netCommissionMinor / 100,
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
