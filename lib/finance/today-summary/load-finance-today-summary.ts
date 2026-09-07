/**
 * Finance Hub "today" aggregates — canonical ledgers only.
 * Day boundary: resolveStoreFinancialPeriod({ period: "today" }) (Asia/Manila calendar day SSOT).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";
import {
  BUSINESS_CASH_LEDGER_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";

export type FinanceTodaySummary = {
  day: string;
  fromIso: string;
  toIso: string;
  /** null = unavailable (UI shows —; never invent 0) */
  cashInMinor: number | null;
  cashOutMinor: number | null;
  /** SALE_EARN credits only — not net of conversions */
  coinEarned: number | null;
  coinConverted: number | null;
  unavailable: boolean;
  errors: string[];
};

export async function loadFinanceTodaySummary(
  sb: SupabaseClient
): Promise<FinanceTodaySummary> {
  const period = resolveStoreFinancialPeriod({ period: "today" });
  const errors: string[] = [];
  let cashInMinor: number | null = 0;
  let cashOutMinor: number | null = 0;
  let coinEarned: number | null = 0;
  let coinConverted: number | null = 0;

  const [cashRes, coinRes] = await Promise.all([
    sb
      .from(BUSINESS_CASH_LEDGER_TABLE)
      .select("direction, amount_minor, entry_kind")
      .gte("created_at", period.fromIso)
      .lte("created_at", period.toIso)
      .limit(5000),
    sb
      .from(STORE_ECONOMIC_POINT_LEDGER_TABLE)
      .select("entry_kind, amount")
      .gte("created_at", period.fromIso)
      .lte("created_at", period.toIso)
      .limit(5000),
  ]);

  if (cashRes.error) {
    errors.push(`cash:${cashRes.error.message}`);
    cashInMinor = null;
    cashOutMinor = null;
  } else {
    let inn = 0;
    let out = 0;
    for (const row of (cashRes.data ?? []) as Array<{
      direction?: string;
      amount_minor?: number;
    }>) {
      const minor = Math.abs(Math.trunc(Number(row.amount_minor) || 0));
      const dir = String(row.direction ?? "").toLowerCase();
      if (dir === "credit") inn += minor;
      else out += minor;
    }
    cashInMinor = inn;
    cashOutMinor = out;
  }

  if (coinRes.error) {
    errors.push(`coin:${coinRes.error.message}`);
    coinEarned = null;
    coinConverted = null;
  } else {
    let earned = 0;
    let converted = 0;
    for (const row of (coinRes.data ?? []) as Array<{ entry_kind?: string; amount?: number }>) {
      const kind = String(row.entry_kind ?? "");
      const amt = Math.trunc(Number(row.amount) || 0);
      if (kind === "SALE_EARN" && amt > 0) earned += amt;
      if (kind === "CONVERT_TO_BUSINESS_CASH") converted += Math.abs(amt);
    }
    coinEarned = earned;
    coinConverted = converted;
  }

  return {
    day: period.fromDay,
    fromIso: period.fromIso,
    toIso: period.toIso,
    cashInMinor,
    cashOutMinor,
    coinEarned,
    coinConverted,
    unavailable: errors.length > 0,
    errors,
  };
}
