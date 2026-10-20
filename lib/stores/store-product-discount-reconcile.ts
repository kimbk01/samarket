/**
 * PRD-04 — 가격 변경 시 할인가 정합 (DB CHECK `store_products_discount_lt_price`:
 * discount_price IS NULL OR price = 0 OR discount_price < price).
 *
 * - 할인율(percent)이 있으면 새 가격으로 할인가 재계산 (`discountPriceFromPercent`).
 * - 할인율 없이 할인가만 있으면, 새 가격 이상이 되는 경우 할인 해제(null).
 */
import { discountPriceFromPercent } from "@/lib/stores/store-product-pricing";

export type StoreProductDiscountFields = {
  discount_price: number | null;
  discount_percent: number | null;
};

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : null;
}

export function reconcileDiscountForNewPrice(
  newPrice: number,
  current: { discount_price?: unknown; discount_percent?: unknown }
): StoreProductDiscountFields {
  const price = Math.floor(Number(newPrice));
  const pct = toIntOrNull(current.discount_percent);
  if (pct != null && pct > 0) {
    const dp = discountPriceFromPercent(price, pct);
    return dp == null ? { discount_price: null, discount_percent: null } : { discount_price: dp, discount_percent: pct };
  }
  const dp = toIntOrNull(current.discount_price);
  if (dp == null || dp < 0) return { discount_price: null, discount_percent: null };
  if (price > 0 && dp >= price) return { discount_price: null, discount_percent: null };
  return { discount_price: dp, discount_percent: null };
}

/** 오너 직접 할인가 입력 검증 — 정가보다 작아야 한다 (정가 0 은 CHECK 와 같이 허용) */
export function isDirectDiscountPriceValid(price: number, discountPrice: number): boolean {
  const p = Math.floor(Number(price));
  const d = Math.floor(Number(discountPrice));
  if (!Number.isFinite(p) || !Number.isFinite(d) || d < 0 || p < 0) return false;
  return p === 0 || d < p;
}
