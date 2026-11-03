import { resolveStoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";

/**
 * 주문 목록 날짜 필터 (docs/audit/owner-orders-date-filter-design-2026-11-03.md §3-2).
 * 기준 열: 완료 탭 = 완료 시각(`completed`) · 그 밖 = 들어온 시각(`created`). 범위는 서버가 PHT 로 계산한 [from, to).
 * 날짜 조건 요청은 서버 캐시·스냅샷 표를 읽지도 쓰지도 않는다(기본 목록 캐시 오염 방지).
 */
export type OwnerOrdersDateBasis = "created" | "completed";
export type OwnerOrdersDateRange = { fromIso: string; toIso: string; basis: OwnerOrdersDateBasis };

export const OWNER_ORDERS_DATE_FILTER_MAX_DAYS = 92;

/** 주소 `from`·`to`·`basis` → PHT 범위. 날짜 조건이 없으면 null(기본 목록), 잘못되면 오류 코드 */
export function parseOwnerOrdersDateFilterParams(
  sp: Pick<URLSearchParams, "get">,
  now: Date = new Date()
):
  | null
  | { ok: false; error: "orders_date_range_required" | "orders_date_range_too_long" }
  | { ok: true; fromDay: string; toDay: string; range: OwnerOrdersDateRange } {
  const day = (v: string | null) => {
    const t = String(v ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  };
  const rawFrom = sp.get("from");
  const rawTo = sp.get("to");
  if (!rawFrom && !rawTo) return null;
  const fromDay = day(rawFrom);
  const toDay = day(rawTo);
  if (!fromDay || !toDay) return { ok: false, error: "orders_date_range_required" };
  const r = resolveStoreCommissionPeriod("custom", fromDay, toDay, now);
  if (!r.fromIso || !r.toIso || Date.parse(r.toIso) <= Date.parse(r.fromIso)) {
    return { ok: false, error: "orders_date_range_required" };
  }
  if (Date.parse(r.toIso) - Date.parse(r.fromIso) > OWNER_ORDERS_DATE_FILTER_MAX_DAYS * 86_400_000) {
    return { ok: false, error: "orders_date_range_too_long" };
  }
  const basis: OwnerOrdersDateBasis = sp.get("basis") === "completed" ? "completed" : "created";
  return { ok: true, fromDay, toDay, range: { fromIso: r.fromIso, toIso: r.toIso, basis } };
}

/** 실시간 병합 시 범위 판정 — 기준 열이 [from, to) 안인지 */
export function ownerOrderRowInDateRange(
  row: { created_at?: string | null; completed_at?: string | null },
  range: OwnerOrdersDateRange
): boolean {
  const iso = range.basis === "completed" ? row.completed_at : row.created_at;
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return false;
  return ms >= Date.parse(range.fromIso) && ms < Date.parse(range.toIso);
}

