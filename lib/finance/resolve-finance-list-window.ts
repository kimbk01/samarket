/**
 * Resolve finance list window from query — server-side day boundary only.
 */
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";
import { settlementPeriodDayToIso } from "@/lib/stores/load-store-settlement-financial-facts";

export function resolveFinanceListWindow(input: {
  date?: string | null;
  from?: string | null;
  to?: string | null;
}): { fromIso: string | null; toIso: string | null; day: string | null } {
  const date = String(input.date ?? "").trim().toLowerCase();
  if (date === "today") {
    const p = resolveStoreFinancialPeriod({ period: "today" });
    return { fromIso: p.fromIso, toIso: p.toIso, day: p.fromDay };
  }
  const fromDay = String(input.from ?? "").trim() || null;
  const toDay = String(input.to ?? "").trim() || null;
  if (!fromDay && !toDay) return { fromIso: null, toIso: null, day: null };
  // If only from provided as YYYY-MM-DD, treat as that calendar day (or open range).
  if (fromDay && /^\d{4}-\d{2}-\d{2}$/.test(fromDay) && !toDay) {
    const bounds = settlementPeriodDayToIso(fromDay, fromDay);
    return { fromIso: bounds.fromIso, toIso: bounds.toIso, day: fromDay };
  }
  if (fromDay && toDay && /^\d{4}-\d{2}-\d{2}$/.test(fromDay) && /^\d{4}-\d{2}-\d{2}$/.test(toDay)) {
    const bounds = settlementPeriodDayToIso(fromDay, toDay);
    return { fromIso: bounds.fromIso, toIso: bounds.toIso, day: null };
  }
  // Already ISO timestamps
  return {
    fromIso: fromDay,
    toIso: toDay,
    day: null,
  };
}
