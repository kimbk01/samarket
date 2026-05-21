/**
 * `/stores/owner` 허브 — API 우선순위 (waterfall 라운드 C, 쿼리 변경 없음).
 */
export type OwnerDashboardApiPriority = "critical" | "deferred" | "background";

export type OwnerDashboardApiName =
  | "store_basic_info"
  | "order_counts"
  | "hub_badge"
  | "orders_list"
  | "products"
  | "settlements"
  | "notifications"
  | "notification_settings"
  | "inquiries"
  | "analytics"
  | "history"
  | "hub_summary"
  | "me_stores";

export const OWNER_DASHBOARD_API_PRIORITY: Record<
  OwnerDashboardApiName,
  OwnerDashboardApiPriority
> = {
  me_stores: "critical",
  store_basic_info: "critical",
  order_counts: "critical",
  hub_badge: "deferred",
  orders_list: "deferred",
  products: "deferred",
  settlements: "deferred",
  notifications: "deferred",
  notification_settings: "background",
  inquiries: "deferred",
  analytics: "background",
  history: "background",
  hub_summary: "background",
};

/** 라운드 C 이후 — critical 이라도 첫 shell 전에 await 하지 않음(로그·gate 용). */
export function ownerDashboardApiFirstPaintBlocking(_name: OwnerDashboardApiName): boolean {
  return false;
}
