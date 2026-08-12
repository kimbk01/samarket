import type { MessageKey } from "@/lib/i18n/messages";

export type StoreCheckoutTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

const CHECKOUT_ERROR_KEY: Record<string, MessageKey> = {
  insufficient_stock: "store_err_out_of_stock_checkout",
  cannot_order_own_store: "store_err_own_store_block",
  store_closed: "store_err_preparing",
  store_point_blocked: "store_err_point_blocked",
  below_min_order: "store_err_below_minimum_cart",
  delivery_address_required: "store_err_delivery_address_required",
  delivery_detail_address_required: "addr_ui_detail_required",
  delivery_user_address_required: "store_err_saved_address_required",
  client_unit_php_required: "store_err_price_changed_cart",
  price_changed: "store_err_price_changed_cart",
  delivery_region_city_required: "store_err_delivery_region_city_google_hint",
  store_pickup_disabled: "store_err_pickup_disabled",
  store_delivery_disabled: "store_err_delivery_disabled",
  payment_method_required: "store_err_payment_method",
  payment_method_invalid: "store_err_payment_method",
};

/** POST checkout API `error` code → localized message (client). */
export function resolveStoreCheckoutClientError(
  t: StoreCheckoutTranslate,
  code: string,
  opts?: { apiMessage?: string | null }
): string {
  const api = opts?.apiMessage?.trim();
  if (api) return api;
  const key = CHECKOUT_ERROR_KEY[code];
  if (key) return t(key);
  return t("store_err_order_failed", { code });
}
