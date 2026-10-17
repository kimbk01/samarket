import {
  isBusinessCashLedgerKind,
  STORE_COMMISSION_FILTER_STATES,
  type BusinessCashLedgerKind,
  type StoreCommissionLedgerFilterState,
} from "@/lib/stores/commission/store-commission-contract";

/**
 * Period presets — business days in Asia/Manila (UTC+8, no DST). Stored times stay UTC;
 * a Manila day D is [D 00:00 +08:00, D+1 00:00 +08:00) = [D-1 16:00Z, D 16:00Z).
 */
export type StoreCommissionPeriod = "all" | "today" | "this_week" | "this_month" | "custom";

export const STORE_COMMISSION_TIMEZONE = "Asia/Manila" as const;
const MANILA_OFFSET_MS = 8 * 3_600_000;

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
  /** Breakdown grouping: Manila day / Manila month / store. */
  group: "day" | "month" | "store";
  limit: number;
  offset: number;
};

function day(v: string | null): string | null {
  const t = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Manila calendar date (y, m, d) of an instant — computed on the shifted UTC clock. */
function manilaYmd(d: Date): { y: number; m: number; d: number; dow: number } {
  const shifted = new Date(d.getTime() + MANILA_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate(), dow: shifted.getUTCDay() };
}

/** Instant of Manila midnight for calendar date (y, m, d). */
function manilaMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - MANILA_OFFSET_MS);
}

function manilaDayStartFromString(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return manilaMidnight(y, m - 1, d);
}

/** Server-side period → [fromIso, toIso) in UTC instants — the browser never computes boundaries. */
export function resolveStoreCommissionPeriod(
  period: StoreCommissionPeriod,
  fromDay: string | null,
  toDay: string | null,
  now: Date = new Date()
): { fromIso: string | null; toIso: string | null } {
  const t = manilaYmd(now);
  const today = manilaMidnight(t.y, t.m, t.d);
  const nextDay = (d: Date) => new Date(d.getTime() + 86_400_000);
  switch (period) {
    case "today":
      return { fromIso: today.toISOString(), toIso: nextDay(today).toISOString() };
    case "this_week": {
      // ISO week (Monday start), Manila calendar
      const dow = (t.dow + 6) % 7;
      const start = new Date(today.getTime() - dow * 86_400_000);
      return { fromIso: start.toISOString(), toIso: nextDay(today).toISOString() };
    }
    case "this_month":
      return { fromIso: manilaMidnight(t.y, t.m, 1).toISOString(), toIso: nextDay(today).toISOString() };
    case "custom":
      return {
        fromIso: fromDay ? manilaDayStartFromString(fromDay).toISOString() : null,
        toIso: toDay ? nextDay(manilaDayStartFromString(toDay)).toISOString() : null,
      };
    default:
      return { fromIso: null, toIso: null };
  }
}

/** Display an UTC instant as Manila local time "YYYY-MM-DD HH:mm". */
export function formatManilaDateTime(iso: string | null | undefined): string {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
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
    group: sp.get("group") === "month" ? "month" : sp.get("group") === "store" ? "store" : "day",
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
  group?: "day" | "month" | "store";
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
  if (q.group && q.group !== "day") sp.set("group", q.group);
  if (q.limit) sp.set("limit", String(q.limit));
  if (q.offset) sp.set("offset", String(q.offset));
  return sp.toString();
}
