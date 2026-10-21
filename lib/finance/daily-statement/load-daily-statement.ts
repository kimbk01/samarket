/**
 * Daily statement from existing ledgers. No FX merge.
 *
 * FIN-07: orders / gross / fee come from the commission SSOT SQL readers used by the Admin and
 * Owner settlement screens — never from legacy `store_settlements` snapshots (stopped 2026-09-15,
 * store-collected money, not a payable):
 * - orders / gross = completed orders (`store_platform_payable_page`, view `all`): direct + platform-held,
 *   bucketed by Asia/Manila order day (same axis as the payable page).
 * - feeDue = net commission per Asia/Manila day (`store_commission_breakdown`, group `day`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyStatementRow } from "@/lib/finance/daily-statement/types";
import {
  BUSINESS_CASH_LEDGER_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  loadStoreCommissionBreakdown,
  loadStorePlatformPayable,
  type StorePlatformPayableRow,
} from "@/lib/stores/commission/load-store-commission-ledger";

/** SQL page cap of `store_platform_payable_page`. */
const PAYABLE_PAGE = 500;
const PAYABLE_MAX_PAGES = 20;

/** All completed orders of one store in [fromIso, toIso) — paged through the payable SQL reader. */
export async function loadCompletedOrderRowsForStore(
  sb: SupabaseClient,
  input: { storeId: string; fromIso: string; toIso: string }
): Promise<StorePlatformPayableRow[]> {
  const out: StorePlatformPayableRow[] = [];
  for (let page = 0; page < PAYABLE_MAX_PAGES; page += 1) {
    const res = await loadStorePlatformPayable(sb, {
      storeIds: [input.storeId],
      fromIso: input.fromIso,
      toIso: input.toIso,
      view: "all",
      limit: PAYABLE_PAGE,
      offset: page * PAYABLE_PAGE,
    });
    out.push(...res.rows);
    if (res.rows.length < PAYABLE_PAGE || out.length >= res.totalRows) break;
  }
  return out;
}

function manilaDay(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

export async function loadDailyStatements(
  sb: SupabaseClient,
  input: { storeId: string; fromIso: string; toIso: string }
): Promise<DailyStatementRow[]> {
  const storeId = input.storeId.trim();
  if (!storeId) return [];

  const map = new Map<string, DailyStatementRow>();

  const ensure = (day: string): DailyStatementRow => {
    let row = map.get(day);
    if (!row) {
      row = {
        date: day,
        currency: "PHP",
        orders: 0,
        gross: 0,
        feeDue: 0,
        feePaid: 0,
        outstandingCreated: 0,
        outstandingCollected: 0,
        coinEarned: 0,
        coinConverted: 0,
        coinWithdrawn: 0,
        cashInMinor: 0,
        cashOutMinor: 0,
        saleFeeMinor: 0,
        adSpendMinor: 0,
        partnerSpendMinor: 0,
        refundMinor: 0,
      };
      map.set(day, row);
    }
    return row;
  };

  const [salesRes, feeRes] = await Promise.allSettled([
    loadCompletedOrderRowsForStore(sb, { storeId, fromIso: input.fromIso, toIso: input.toIso }),
    loadStoreCommissionBreakdown(sb, {
      storeIds: [storeId],
      fromIso: input.fromIso,
      toIso: input.toIso,
      group: "day",
    }),
  ]);
  if (salesRes.status === "fulfilled") {
    for (const o of salesRes.value) {
      const day = manilaDay(o.createdAt);
      if (!day) continue;
      const row = ensure(day);
      row.orders += 1;
      row.gross += o.directPhp + o.heldPhp;
    }
  } else {
    console.error("[loadDailyStatements] completed_orders", salesRes.reason);
  }
  if (feeRes.status === "fulfilled") {
    for (const b of feeRes.value) {
      if (!b.bucket) continue;
      ensure(b.bucket).feeDue += b.netCommissionMinor / 100;
    }
  } else {
    console.error("[loadDailyStatements] commission_breakdown", feeRes.reason);
  }

  const [{ data: coinLedger }, { data: cashLedger }, { data: obligations }] = await Promise.all([
    sb
      .from(STORE_ECONOMIC_POINT_LEDGER_TABLE)
      .select("entry_kind, amount, created_at")
      .eq("store_id", storeId)
      .gte("created_at", input.fromIso)
      .lte("created_at", input.toIso)
      .limit(3000),
    sb
      .from(BUSINESS_CASH_LEDGER_TABLE)
      .select("entry_kind, direction, amount_minor, created_at")
      .eq("store_id", storeId)
      .gte("created_at", input.fromIso)
      .lte("created_at", input.toIso)
      .limit(3000),
    sb
      .from("store_sale_fee_obligations")
      .select("fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, created_at, settled_at")
      .eq("store_id", storeId)
      .gte("created_at", input.fromIso)
      .lte("created_at", input.toIso)
      .limit(1000),
  ]);

  for (const r of (coinLedger ?? []) as Array<Record<string, unknown>>) {
    const day = manilaDay(String(r.created_at ?? ""));
    if (!day) continue;
    const row = ensure(day);
    const kind = String(r.entry_kind ?? "");
    const amt = Math.trunc(Number(r.amount) || 0);
    if (kind === "SALE_EARN" || kind === "GIFT_REDEMPTION_EARN") row.coinEarned += Math.max(0, amt);
    else if (kind === "CONVERT_TO_BUSINESS_CASH") row.coinConverted += Math.abs(amt);
    else if (kind.startsWith("WITHDRAWAL")) row.coinWithdrawn += Math.abs(amt);
  }

  for (const r of (cashLedger ?? []) as Array<Record<string, unknown>>) {
    const day = manilaDay(String(r.created_at ?? ""));
    if (!day) continue;
    const row = ensure(day);
    const kind = String(r.entry_kind ?? "");
    const dir = String(r.direction ?? "").toLowerCase();
    const minor = Math.trunc(Number(r.amount_minor) || 0);
    if (dir === "credit") row.cashInMinor += minor;
    else row.cashOutMinor += minor;
    if (kind === "SALE_FEE") row.saleFeeMinor += minor;
    else if (kind === "SALE_FEE_SETTLEMENT") row.outstandingCollected += minor / 100;
    else if (kind === "AD_SPEND") row.adSpendMinor += minor;
    else if (kind === "PARTNER_SPEND") row.partnerSpendMinor += minor;
    else if (kind === "AD_REFUND" || kind === "PARTNER_REFUND") row.refundMinor += minor;
  }

  for (const r of (obligations ?? []) as Array<Record<string, unknown>>) {
    const day = manilaDay(String(r.created_at ?? ""));
    if (!day) continue;
    const row = ensure(day);
    const due = Math.trunc(Number(r.fee_due_minor) || 0);
    const paid = Math.trunc(Number(r.fee_paid_minor) || 0);
    const outstanding = Math.trunc(Number(r.fee_outstanding_minor) || 0);
    row.feePaid += paid / 100;
    if (outstanding > 0) row.outstandingCreated += outstanding / 100;
    void due;
  }

  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}
