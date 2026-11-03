/**
 * 사장님 매출(일별·월별) — 단일 정의 (Owner 2026-11-03 「일별·월별, 누적 아님」
 * · docs/audit/owner-e2e-round2-review-and-dashboard-design-2026-11-03.md §6).
 *
 * - 하루·달 경계 = 필리핀 시간 00:00 (`resolveStoreCommissionPeriod` 와 같은 계산)
 * - 매출 = 완료 시각(`store_orders.completed_at`) · 환불은 환불일에 차감 · 들어온 주문 = 생성 시각
 * - 일별 = 고른 기간(최대 92일) · 월별 = 최근 12개월(이번 달 포함) · 「전체(누적)」 없음
 * - 집계는 DB `store_sales_period_summary` 하나 (홈 스냅샷과 같은 정의)
 */
import {
  OWNER_MONEY_DEFAULT_PERIOD,
  resolveStoreCommissionPeriod,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";

export type StoreSalesGrain = "day" | "month";

export const STORE_SALES_DAY_MAX_DAYS = 92;
export const STORE_SALES_MONTH_COUNT = 12;

export type StoreSalesBucket = {
  /** 일별 `YYYY-MM-DD` · 월별 `YYYY-MM` (PHT) */
  bucket: string;
  createdCount: number;
  cancelledCount: number;
  completedCount: number;
  grossSalesPhp: number;
  refundedCount: number;
  refundedPhp: number;
  netSalesPhp: number;
  avgOrderValuePhp: number;
};

export type StoreSalesTotals = Omit<StoreSalesBucket, "bucket">;

const MANILA_OFFSET_MS = 8 * 3_600_000;

/** 월별 범위 — 최근 12개월 1일 00:00 PHT ~ 내일 00:00 PHT */
export function resolveStoreSalesMonthRange(now: Date = new Date()): { fromIso: string; toIso: string } {
  const shifted = new Date(now.getTime() + MANILA_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const from = new Date(Date.UTC(y, m - (STORE_SALES_MONTH_COUNT - 1), 1) - MANILA_OFFSET_MS);
  const today = new Date(Date.UTC(y, m, shifted.getUTCDate()) - MANILA_OFFSET_MS);
  const to = new Date(today.getTime() + 86_400_000);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export type StoreSalesRangeResult =
  | { ok: true; period: StoreCommissionPeriod; fromIso: string; toIso: string }
  | { ok: false; error: "sales_period_required" | "sales_period_too_long" };

/** 일별 범위 — 사장님 기간(「전체」 → 이번 달) · 직접 지정은 시작·끝 둘 다 · 최대 92일 */
export function resolveStoreSalesDayRange(
  period: StoreCommissionPeriod,
  fromDay: string | null,
  toDay: string | null,
  now: Date = new Date()
): StoreSalesRangeResult {
  const p = period === "all" ? OWNER_MONEY_DEFAULT_PERIOD : period;
  if (p === "custom" && (!fromDay || !toDay)) return { ok: false, error: "sales_period_required" };
  const r = resolveStoreCommissionPeriod(p, fromDay, toDay, now);
  if (!r.fromIso || !r.toIso || Date.parse(r.toIso) <= Date.parse(r.fromIso)) {
    return { ok: false, error: "sales_period_required" };
  }
  if (Date.parse(r.toIso) - Date.parse(r.fromIso) > STORE_SALES_DAY_MAX_DAYS * 86_400_000) {
    return { ok: false, error: "sales_period_too_long" };
  }
  return { ok: true, period: p, fromIso: r.fromIso, toIso: r.toIso };
}

function int(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function mapBucketFields(r: Record<string, unknown>): StoreSalesTotals {
  return {
    createdCount: int(r.created_count),
    cancelledCount: int(r.cancelled_count),
    completedCount: int(r.completed_count),
    grossSalesPhp: int(r.gross_sales_php),
    refundedCount: int(r.refunded_count),
    refundedPhp: int(r.refunded_php),
    netSalesPhp: int(r.net_sales_php),
    avgOrderValuePhp: int(r.avg_order_value_php),
  };
}

export function parseStoreSalesSummary(raw: unknown): { totals: StoreSalesTotals; rows: StoreSalesBucket[] } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const totals = mapBucketFields((o.totals as Record<string, unknown>) ?? {});
  const rows = (Array.isArray(o.rows) ? (o.rows as Record<string, unknown>[]) : []).map((r) => ({
    bucket: String(r.bucket ?? ""),
    ...mapBucketFields(r),
  }));
  return { totals, rows };
}

/** 줄 표시용 — 일별 `11-03 (화)` · 월별 `2026-11` */
export function formatStoreSalesBucketLabel(bucket: string, grain: StoreSalesGrain, lang: "ko" | "en"): string {
  if (grain === "month") return bucket;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucket);
  if (!m) return bucket;
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  const names = lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${m[2]}-${m[3]} (${names[dow]})`;
}

/** 월 줄 → 그 달 1일 ~ 말일(오늘을 넘지 않음) 일별 기간 (PHT 날짜 문자열) */
export function storeSalesMonthDayRange(bucket: string, now: Date = new Date()): { fromDay: string; toDay: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(bucket);
  const today = new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
  if (!m) return { fromDay: today, toDay: today };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  return { fromDay: `${m[1]}-${m[2]}-01`, toDay: last < today ? last : today };
}
