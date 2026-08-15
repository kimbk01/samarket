import { getTradeNationalLguById } from "@/lib/trade/location/national/load-national-lgu-dataset";
import type { TradeNationalLgu } from "@/lib/trade/location/national/types";

/**
 * Server write authority: trade_lgu_id must exist, be active, City|Municipality.
 * Uses the same projection SSOT as import (FK is the DB backstop).
 */
export function assertActiveTradeNationalLgu(
  canonicalId: string | null | undefined
): { ok: true; lgu: TradeNationalLgu } | { ok: false; error: string } {
  const id = (canonicalId ?? "").trim();
  if (!id) return { ok: false, error: "trade_lgu_id_required" };
  const lgu = getTradeNationalLguById(id);
  if (!lgu) return { ok: false, error: "trade_lgu_id_unknown" };
  if (!lgu.isActive) return { ok: false, error: "trade_lgu_id_inactive" };
  if (lgu.lguType !== "city" && lgu.lguType !== "municipality") {
    return { ok: false, error: "trade_lgu_id_invalid_type" };
  }
  return { ok: true, lgu };
}
