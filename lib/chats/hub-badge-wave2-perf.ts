/**
 * Hub badge query_wave_2 — cm_unread ∥ store_order_unread 계측 (로직·응답 불변).
 */

export const CM_UNREAD_HUB_SELECT = "id (count exact head)";
export const CM_UNREAD_HUB_FILTERS =
  "community_messenger_participants: user_id=:userId; unread_count > 0";

export const STORE_ORDER_UNREAD_HUB_ORDERS_SELECT = "community_messenger_room_id";
export const STORE_ORDER_UNREAD_HUB_ORDERS_FILTERS =
  "store_orders: store_id=:hubStoreId; community_messenger_room_id IS NOT NULL; limit 80";
export const STORE_ORDER_UNREAD_HUB_PARTS_SELECT = "unread_count";
export const STORE_ORDER_UNREAD_HUB_PARTS_FILTERS =
  "community_messenger_participants: user_id=:ownerUserId; room_id IN (:roomIds)";

export type CmUnreadHubVia = "memory" | "rpc" | "postgrest_count_head" | "skipped" | "error";
export type StoreOrderUnreadHubVia =
  | "memory"
  | "query"
  | "empty_orders"
  | "skipped_no_hub"
  | "error";

export type HubBadgeCmUnreadTiming = {
  cm_unread_ms: number;
  cm_unread_query_ms: number;
  cm_unread_via: CmUnreadHubVia;
  cm_unread_rpc_ms?: number;
  cm_unread_legacy_ms?: number;
  /** unread 방 개수 (count 결과) */
  cm_unread_rows: number;
  cm_unread_memory_hit?: 0 | 1;
  cm_unread_memory_age_ms?: number;
  cm_unread_error?: string;
};

export type HubBadgeStoreOrderUnreadTiming = {
  store_order_unread_ms: number;
  store_order_unread_query_ms: number;
  store_order_unread_via: StoreOrderUnreadHubVia;
  /** 1차 store_orders 행 수 (room_id 후보) */
  store_order_unread_rows: number;
  store_order_unread_orders_ms?: number;
  store_order_unread_parts_ms?: number;
  store_order_unread_parts_rows?: number;
  store_order_unread_memory_hit?: 0 | 1;
  store_order_unread_memory_age_ms?: number;
  store_order_unread_error?: string;
};

export function emptyCmUnreadTiming(): HubBadgeCmUnreadTiming {
  return {
    cm_unread_ms: 0,
    cm_unread_query_ms: 0,
    cm_unread_via: "skipped",
    cm_unread_rows: 0,
  };
}

export function emptyStoreOrderUnreadTiming(): HubBadgeStoreOrderUnreadTiming {
  return {
    store_order_unread_ms: 0,
    store_order_unread_query_ms: 0,
    store_order_unread_via: "skipped_no_hub",
    store_order_unread_rows: 0,
  };
}

export function logHubBadgeWave2Perf(payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console -- hub badge wave2 breakdown
  console.info("[hub-badge-wave2]", payload);
}
