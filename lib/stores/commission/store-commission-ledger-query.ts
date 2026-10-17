import {
  isBusinessCashLedgerKind,
  STORE_COMMISSION_FILTER_STATES,
  type BusinessCashLedgerKind,
  type StoreCommissionLedgerFilterState,
} from "@/lib/stores/commission/store-commission-contract";

/** Period presets. Boundaries are UTC days — same axis as `store-order-financial-contract`. */
export type StoreCommissionPeriod = "all" | "today" | "this_week" | "this_month" | "custom";

export const STORE_COMMISSION_PERIODS: readonly StoreCommissionPeriod[] = [
  "all",
  "today",
  "this_week",
  "this_month",
  "custom",
] as const;

export type StoreCommissionLedgerQuery = {
  storeId: string;
  period: StoreCommissionPeriod;
  /** Inclusive start, ISO (null = unbounded). */
  fromIso: string | null;
  /** Exclusive end, ISO (null = unbounded). */
  toIso: string | null;
  /** Raw custom days (echoed back to the UI). */
  fromDay: string | null;
  toDay: string | null;
  state: StoreCommissionLedgerFilterState;
  orderNo: string | null;
  kinds: BusinessCashLedgerKind[];
  limit: number;
  offset: number;
};

function day(v: string | null): string | null {
  const t = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Server-side period → [fromIso, toIso) — the browser never computes boundaries. */
export function resolveStoreCommissionPeriod(
  period: StoreCommissionPeriod,
  fromDay: string | null,
  toDay: string | null,
  now: Date = new Date()
): { fromIso: string | null; toIso: string | null } {
  const today = utcDayStart(now);
  const nextDay = (d: Date) => new Date(d.getTime() + 86_400_000);
  switch (period) {
    case "today":
      return { fromIso: today.toISOString(), toIso: nextDay(today).toISOString() };
    case "this_week": {
      // ISO week (Monday start)
      const dow = (today.getUTCDay() + 6) % 7;
      const start = new Date(today.getTime() - dow * 86_400_000);
      return { fromIso: start.toISOString(), toIso: nextDay(today).toISOString() };
    }
    case "this_month": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { fromIso: start.toISOString(), toIso: nextDay(today).toISOString() };
    }
    case "custom":
      return {
        fromIso: fromDay ? `${fromDay}T00:00:00.000Z` : null,
        toIso: toDay ? nextDay(new Date(`${toDay}T00:00:00.000Z`)).toISOString() : null,
      };
    default:
      return { fromIso: null, toIso: null };
  }
}

/** Same query contract for every Admin and Owner ledger route. */
export function parseStoreCommissionLedgerQuery(sp: URLSearchParams, now: Date = new Date()): StoreCommissionLedgerQuery {
  const stateRaw = String(sp.get("state") ?? "").trim();
  const periodRaw = String(sp.get("period") ?? "").trim();
  const fromDay = day(sp.get("from"));
  const toDay = day(sp.get("to"));
  const period: StoreCommissionPeriod = (STORE_COMMISSION_PERIODS as readonly string[]).includes(periodRaw)
    ? (periodRaw as StoreCommissionPeriod)
    : fromDay || toDay
      ? "custom"
      : "all";
  const { fromIso, toIso } = resolveStoreCommissionPeriod(period, fromDay, toDay, now);
  const limit = Number(sp.get("limit") ?? "100");
  const offset = Number(sp.get("offset") ?? "0");
  const kinds = String(sp.get("kinds") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(isBusinessCashLedgerKind);
  return {
    storeId: String(sp.get("store_id") ?? sp.get("storeId") ?? "").trim(),
    period,
    fromIso,
    toIso,
    fromDay,
    toDay,
    state: (STORE_COMMISSION_FILTER_STATES as readonly string[]).includes(stateRaw)
      ? (stateRaw as StoreCommissionLedgerFilterState)
      : "all",
    orderNo: String(sp.get("order_no") ?? "").trim() || null,
    kinds,
    limit: Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.round(limit))) : 100,
    offset: Number.isFinite(offset) ? Math.max(0, Math.round(offset)) : 0,
  };
}

export function buildStoreCommissionLedgerSearch(q: {
  storeId?: string | null;
  period?: StoreCommissionPeriod;
  fromDay?: string | null;
  toDay?: string | null;
  state?: StoreCommissionLedgerFilterState;
  orderNo?: string | null;
  kinds?: readonly string[];
  limit?: number;
  offset?: number;
}): string {
  const sp = new URLSearchParams();
  if (q.storeId) sp.set("store_id", q.storeId);
  if (q.period && q.period !== "all") sp.set("period", q.period);
  if (q.period === "custom") {
    if (q.fromDay) sp.set("from", q.fromDay);
    if (q.toDay) sp.set("to", q.toDay);
  }
  if (q.state && q.state !== "all") sp.set("state", q.state);
  if (q.orderNo) sp.set("order_no", q.orderNo);
  if (q.kinds?.length) sp.set("kinds", q.kinds.join(","));
  if (q.limit) sp.set("limit", String(q.limit));
  if (q.offset) sp.set("offset", String(q.offset));
  return sp.toString();
}
