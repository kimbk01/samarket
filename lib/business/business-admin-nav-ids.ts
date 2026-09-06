/**
 * Owner drawer/sidebar item ids — shared without circular imports.
 */

export type BusinessAdminNavItemId =
  | "dashboard"
  | "basic_info"
  | "store_settings"
  | "customer_care"
  | "order_chats"
  | "customer_center"
  | "inquiries"
  | "delivery_orders"
  | "delivery_ops"
  | "products"
  | "product_new"
  | "categories"
  | "banners"
  | "coupons"
  | "gift_certificates"
  | "notices"
  | "reviews"
  /** @deprecated collapsed into delivery_ops — kept for type/compat only */
  | "ops_review"
  | "public_store"
  | "settlements"
  | "finance"
  | "ads"
  | "notifications"
  | "notification_settings";
