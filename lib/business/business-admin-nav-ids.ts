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
  | "sales"
  | "settlements"
  | "finance"
  | "ads"
  | "notifications"
  | "notification_settings"
  /** 배달 오픈 4단계 — 어드민 → 사장님 운영 공지 (매장 공지 `notices` 와 다름) */
  | "announcements"
  /** 4단계 12그룹 IA — 드로어 비노출(제목·활성·뒤로가기 파생 전용) */
  | "store_manage"
  | "product_edit"
  | "ads_event"
  | "apply"
  | "my";
