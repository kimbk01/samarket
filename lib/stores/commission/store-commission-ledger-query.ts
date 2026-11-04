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
export type StoreCommissionPeriod =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "custom";

export const STORE_COMMISSION_TIMEZONE = "Asia/Manila" as const;
const MANILA_OFFSET_MS = 8 * 3_600_000;

export const STORE_COMMISSION_PERIODS: readonly StoreCommissionPeriod[] = [
  "all",
  "today",
  "this_week",
  "this_month",
  "custom",
] as const;

/** 주소로 받을 수 있는 기간 전부 (관리자 칩 목록 `STORE_COMMISSION_PERIODS` 보다 넓음) */
export const STORE_COMMISSION_PARSE_PERIODS: readonly StoreCommissionPeriod[] = [
  ...STORE_COMMISSION_PERIODS,
  "yesterday",
  "last_month",
] as const;

/**
 * 사장님 돈·매출 화면 기간 칩 — 「전체(누적)」 없음 · 기본 이번 달
 * (Owner 2026-11-03 「누적을 원하는 부분이 아니다」 · docs/audit/owner-e2e-round2-review-and-dashboard-design-2026-11-03.md §6-2).
 */
export const OWNER_MONEY_PERIODS: readonly StoreCommissionPeriod[] = [
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "last_month",
  "custom",
] as const;
export const OWNER_MONEY_DEFAULT_PERIOD: StoreCommissionPeriod = "this_month";

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

/** `YYYY-MM-DD` 이면서 실제 있는 날짜만 (2026-02-31 같은 날짜는 버린다 · 재감사 R4-b). */
function day(v: string | null): string | null {
  const t = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split("-").map(Number);
  const back = new Date(Date.UTC(y!, m! - 1, d!));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m! - 1 && back.getUTCDate() === d ? t : null;
}

/** 시작일·종료일이 거꾸로 들어오면 바꿔 놓는다 (화면은 보내기 전에 막고 안내 · 서버는 빈 결과 대신 같은 기간으로). */
export function orderedCustomDays(fromDay: string | null, toDay: string | null): { fromDay: string | null; toDay: string | null } {
  return fromDay && toDay && fromDay > toDay ? { fromDay: toDay, toDay: fromDay } : { fromDay, toDay };
}

/**
 * 주소 기간 입력 검사 (재감사 D-12·D-16 · Owner 권장안 「잘못된 기간 → 서버 400 + 화면 안내」 2026-11-04).
 * 잘못된 입력을 바로잡아(맞바꿈·이번 달로 대체) 다른 기간을 보여 주지 않는다 — 돈 화면 API 는 이 값이 null 이 아니면 400.
 * - 날짜 형식이 틀림(없는 날 포함) · 「직접」(또는 기간 없이 날짜만)인데 날짜가 하나만 · 시작 > 종료 → `invalid_period`.
 * - 정해진 기간(이번 달 등)·「전체」는 날짜를 보지 않는다(지금 동작 그대로).
 */
export function storeCommissionPeriodInputError(sp: Pick<URLSearchParams, "get">): "invalid_period" | null {
  const periodRaw = String(sp.get("period") ?? "").trim();
  const preset = periodRaw !== "custom" && (STORE_COMMISSION_PARSE_PERIODS as readonly string[]).includes(periodRaw);
  if (preset) return null;
  const rawFrom = String(sp.get("from") ?? "").trim();
  const rawTo = String(sp.get("to") ?? "").trim();
  if ((rawFrom && !day(rawFrom)) || (rawTo && !day(rawTo))) return "invalid_period";
  const custom = periodRaw === "custom" || Boolean(rawFrom || rawTo);
  if (!custom) return null;
  if (!rawFrom || !rawTo) return "invalid_period";
  return rawFrom > rawTo ? "invalid_period" : null;
}

/** 화면용 — 직접 기간 입력 상태: 둘 다 있어야 조회, 시작 > 종료면 안내 (재감사 R4). */
export function customPeriodInputState(fromDay: string, toDay: string): "incomplete" | "inverted" | "ok" {
  if (!day(fromDay) || !day(toDay)) return "incomplete";
  return fromDay > toDay ? "inverted" : "ok";
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
    case "yesterday":
      return { fromIso: new Date(today.getTime() - 86_400_000).toISOString(), toIso: today.toISOString() };
    case "this_week": {
      // ISO week (Monday start), Manila calendar
      const dow = (t.dow + 6) % 7;
      const start = new Date(today.getTime() - dow * 86_400_000);
      return { fromIso: start.toISOString(), toIso: nextDay(today).toISOString() };
    }
    case "this_month":
      return { fromIso: manilaMidnight(t.y, t.m, 1).toISOString(), toIso: nextDay(today).toISOString() };
    case "last_month":
      // Date.UTC 가 월 -1·0 을 앞 해로 넘겨 준다 (1월 → 전년 12월)
      return { fromIso: manilaMidnight(t.y, t.m - 1, 1).toISOString(), toIso: manilaMidnight(t.y, t.m, 1).toISOString() };
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
/** 주소 `period`·`from`·`to` → 기간 (API 와 관리자 화면 첫 상태가 같은 규칙). */
export function parseStoreCommissionPeriodParams(sp: Pick<URLSearchParams, "get">): {
  period: StoreCommissionPeriod;
  fromDay: string | null;
  toDay: string | null;
} {
  const periodRaw = String(sp.get("period") ?? "").trim();
  const { fromDay, toDay } = orderedCustomDays(day(sp.get("from")), day(sp.get("to")));
  const period: StoreCommissionPeriod = (STORE_COMMISSION_PARSE_PERIODS as readonly string[]).includes(periodRaw)
    ? (periodRaw as StoreCommissionPeriod)
    : fromDay || toDay
      ? "custom"
      : "all";
  return { period, fromDay, toDay };
}

export function parseStoreCommissionLedgerQuery(sp: URLSearchParams, now: Date = new Date()): StoreCommissionLedgerQuery {
  const stateRaw = String(sp.get("state") ?? "").trim();
  const { period, fromDay, toDay } = parseStoreCommissionPeriodParams(sp);
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

/**
 * 사장님 경로 — 기간이 없거나 「전체」면 이번 달 (누적 금지 · Owner 2026-11-03 §6-2).
 * 예외: 주문번호 1건 찾기(`order_no`, 알림·주문 상세 바로가기)는 기간 없이 — 목록 누적이 아니라 단건 조회.
 * 관리자 경로는 `parseStoreCommissionLedgerQuery`(기본 전체) 그대로.
 */
export function parseOwnerStoreCommissionLedgerQuery(sp: URLSearchParams, now: Date = new Date()): StoreCommissionLedgerQuery {
  const q = parseStoreCommissionLedgerQuery(sp, now);
  if (q.orderNo) return q;
  if (!ownerPeriodIsUnbounded(q.period, q.fromDay, q.toDay)) return q;
  const range = resolveStoreCommissionPeriod(OWNER_MONEY_DEFAULT_PERIOD, null, null, now);
  return { ...q, period: OWNER_MONEY_DEFAULT_PERIOD, fromDay: null, toDay: null, ...range };
}

/** 사장님 기간 파라미터 — 「전체」·없음 → 이번 달 */
export function parseOwnerMoneyPeriodParams(sp: Pick<URLSearchParams, "get">): {
  period: StoreCommissionPeriod;
  fromDay: string | null;
  toDay: string | null;
} {
  const p = parseStoreCommissionPeriodParams(sp);
  return ownerPeriodIsUnbounded(p.period, p.fromDay, p.toDay)
    ? { period: OWNER_MONEY_DEFAULT_PERIOD, fromDay: null, toDay: null }
    : p;
}

/**
 * 사장님 경로에서 누적(끝이 열린 기간)이 되는 입력 — 「전체」, 날짜가 하나라도 빠진 「직접」 (재감사 R4-a).
 * 이전: 「직접」을 누르는 즉시 날짜 없이 조회 → 서버가 전체 누적으로 계산.
 */
function ownerPeriodIsUnbounded(period: StoreCommissionPeriod, fromDay: string | null, toDay: string | null): boolean {
  return period === "all" || (period === "custom" && (!fromDay || !toDay));
}
