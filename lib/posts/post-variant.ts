/**
 * PostCard·피드 미리보기 공통 — 글 종류 판별 (skinKey 없을 때 meta 기준)
 */

export function hasRealEstateMeta(meta: Record<string, unknown>): boolean {
  const key = (k: string) => Object.prototype.hasOwnProperty.call(meta, k);
  return (
    key("deal_type") ||
    key("estate_type") ||
    key("deposit") ||
    key("monthly") ||
    key("size_sq") ||
    key("area_sqm") ||
    key("room_count") ||
    key("bathroom_count") ||
    key("move_in_date") ||
    key("building_name") ||
    key("neighborhood")
  );
}

export function hasUsedCarMeta(meta: Record<string, unknown>): boolean {
  const key = (k: string) => Object.prototype.hasOwnProperty.call(meta, k);
  return (
    key("car_model") ||
    key("car_year") ||
    key("car_year_max") ||
    key("mileage") ||
    key("car_trade") ||
    key("has_accident")
  );
}

export function hasJobsMeta(meta: Record<string, unknown>): boolean {
  const key = (k: string) => Object.prototype.hasOwnProperty.call(meta, k);
  return key("job_type") || key("work_category") || key("work_term") || key("pay_type");
}

/** PostCard와 동일: exchange_rate만 있는 글은 일반 거래로 본다 */
export function hasExchangeMeta(meta: Record<string, unknown>): boolean {
  const key = (k: string) => Object.prototype.hasOwnProperty.call(meta, k);
  return key("exchange_direction") || key("from_currency") || key("to_currency");
}
