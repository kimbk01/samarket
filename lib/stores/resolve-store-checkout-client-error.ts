import type { MessageKey } from "@/lib/i18n/messages";

export type StoreCheckoutTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

const CHECKOUT_ERROR_KEY: Record<string, MessageKey> = {
  insufficient_stock: "store_err_out_of_stock_checkout",
  cannot_order_own_store: "store_err_own_store_block",
  store_closed: "store_err_preparing",
  /** 운영 중지·미승인·비노출 매장 (관리자 조치) */
  store_unavailable: "store_err_store_unavailable",
  /** 판매 권한 중지 (관리자 판매 중지) */
  store_not_selling: "store_err_store_not_selling",
  store_point_blocked: "store_err_point_blocked",
  /** Store NET Cash <= 0 — buyer sees the neutral "preparing" copy, never the store's finances. */
  store_cash_insufficient: "store_err_point_blocked",
  below_min_order: "store_err_below_minimum_cart",
  delivery_address_required: "store_err_delivery_address_required",
  delivery_detail_address_required: "addr_ui_detail_required",
  delivery_user_address_required: "store_err_saved_address_required",
  client_unit_php_required: "store_err_price_changed_cart",
  price_changed: "store_err_price_changed_cart",
  delivery_region_city_required: "store_err_delivery_region_city_google_hint",
  store_pickup_disabled: "store_err_pickup_disabled",
  store_delivery_disabled: "store_err_delivery_disabled",
  delivery_out_of_range: "store_err_delivery_out_of_range",
  delivery_store_coords_required: "store_err_delivery_store_coords_required",
  delivery_customer_coords_required: "store_err_delivery_customer_coords_required",
  /** V2 `missing_lgu_identity` — 회원 주소 LGU 미해결 (fail-closed) */
  delivery_customer_lgu_unresolved: "store_err_delivery_customer_lgu_unresolved",
  /** LOC-003 — 거리 정책 조회 오류 (503, fail-closed) */
  delivery_policy_unavailable: "store_err_delivery_policy_unavailable",
  delivery_user_address_not_master: "store_err_delivery_user_address_not_master",
  delivery_user_address_invalid: "store_err_delivery_user_address_invalid",
  payment_method_required: "store_err_payment_method",
  payment_method_invalid: "store_err_payment_method",
  coupon_not_found: "store_err_coupon_not_found",
  coupon_inactive: "store_err_coupon_inactive",
  coupon_expired: "store_err_coupon_expired",
  coupon_wrong_store: "store_err_coupon_wrong_store",
  coupon_min_order: "store_err_coupon_min_order",
  coupon_already_redeemed: "store_err_coupon_already_redeemed",
  invalid_discount: "store_err_coupon_invalid",
  gift_store_mismatch: "gift_u4_err_wrong_store",
  gift_not_owner: "gift_u4_err_not_owner",
  gift_insufficient_remaining: "gift_u4_err_insufficient",
  gift_invalid_status: "gift_u4_err_invalid_status",
  gift_expired: "gift_u4_err_expired",
  gift_not_yet_valid: "gift_u4_err_not_yet_valid",
  gift_instance_not_found: "gift_u4_err_generic",
  gift_max_one_per_order: "gift_u4_err_generic",
  invalid_gift_instance_ids: "gift_u4_err_generic",
  invalid_gift_instance_id: "gift_u4_err_generic",
  invalid_gift_redemption: "gift_u4_err_generic",
  /** CRT-02 — 줄 단위 상품 판정(`evaluateStoreOrderCheckoutLine`) 코드 */
  product_sold_out: "store_err_sold_out_in_cart",
  product_not_available: "store_err_product_stopped_in_cart",
  invalid_product: "store_err_product_stopped_in_cart",
  products_not_found: "store_err_product_stopped_in_cart",
  mixed_store_cart: "store_err_mixed_store_cart",
  duplicate_line_in_order: "store_err_duplicate_line",
  qty_out_of_range: "store_err_qty_out_of_range_cart",
  pickup_not_available: "store_err_pickup_item_not_available",
  delivery_not_available: "store_err_delivery_item_not_available",
  shipping_not_available: "store_err_shipping_item_not_available",
  invalid_line: "store_err_cart_line_invalid",
  invalid_unit_price: "store_err_cart_line_invalid",
  /** `modifiers/validate.ts` 옵션 오류 */
  options_too_few: "store_err_required_option_changed_cart",
  options_sold_out: "store_err_option_sold_out_cart",
  options_unknown_group: "store_err_options_changed_cart",
  options_not_configured: "store_err_options_changed_cart",
  options_invalid_quantity: "store_err_options_changed_cart",
  options_too_many: "store_err_options_changed_cart",
  options_duplicate_choice: "store_err_options_changed_cart",
  options_invalid_choice: "store_err_options_changed_cart",
  invalid_option: "store_err_options_changed_cart",
  /** 매장 게이트·연락처 */
  owner_self_order_denied: "store_err_own_store_block",
  buyer_phone_required: "store_err_buyer_phone_required",
  invalid_buyer_phone: "store_err_invalid_buyer_phone",
};

/** POST checkout API `error` code → localized message (client). */
export function resolveStoreCheckoutClientError(
  t: StoreCheckoutTranslate,
  code: string,
  opts?: {
    apiMessage?: string | null;
    /** CRT-02 — 서버가 `product_id` 를 돌려준 줄 단위 오류면 그 상품명 */
    itemTitle?: string | null;
  }
): string {
  const api = opts?.apiMessage?.trim();
  if (api) return api;
  // GIFT_LOCKED is returned as gift_invalid_status from API — prefer locked copy when code matches
  if (code === "gift_locked") {
    return t("gift_u4_err_gift_locked");
  }
  const key = CHECKOUT_ERROR_KEY[code];
  if (!key) return t("store_err_order_failed", { code });
  const message = t(key);
  const item = opts?.itemTitle?.trim();
  return item ? t("store_err_line_item_prefix", { item, message }) : message;
}

/** CRT-02 — 장바구니 줄에 표시할 주문 불가 사유(상품명 없이). 매핑 없는 코드는 판매 중지 문구. */
export function resolveStoreCartLineIssueMessage(t: StoreCheckoutTranslate, code: string): string {
  const key = CHECKOUT_ERROR_KEY[code];
  return t(key ?? "store_err_product_stopped_in_cart");
}
