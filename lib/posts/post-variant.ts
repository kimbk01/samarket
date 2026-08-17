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

/** Rent-car — must win over used-car when meta overlaps (car_model / year). */
export function hasRentCarMeta(meta: Record<string, unknown>): boolean {
  const key = (k: string) => Object.prototype.hasOwnProperty.call(meta, k);
  return (
    key("daily_price") ||
    key("pickup_location") ||
    key("mileage_cap") ||
    key("with_driver") ||
    key("available_from")
  );
}

export function hasUsedCarMeta(meta: Record<string, unknown>): boolean {
  if (hasRentCarMeta(meta)) return false;
  const key = (k: string) => Object.prototype.hasOwnProperty.call(meta, k);
  return (
    key("car_model") ||
    key("car_year") ||
    key("car_year_max") ||
    key("mileage") ||
    key("car_trade") ||
    key("car_body_type") ||
    key("has_accident")
  );
}

export function hasJobsMeta(meta: Record<string, unknown>): boolean {
  const key = (k: string) => Object.prototype.hasOwnProperty.call(meta, k);
  return (
    key("listing_kind") ||
    key("trade_chat_kind") ||
    key("job_type") ||
    key("work_category") ||
    key("work_category_other") ||
    key("work_term") ||
    key("pay_type")
  );
}

/** PostCard와 동일: exchange_rate만 있는 글은 일반 거래로 본다 */
export function hasExchangeMeta(meta: Record<string, unknown>): boolean {
  const key = (k: string) => Object.prototype.hasOwnProperty.call(meta, k);
  return key("exchange_direction") || key("from_currency") || key("to_currency");
}
