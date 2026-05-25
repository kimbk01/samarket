/**
 * findOwnerHubStore — hub badge wave1 계측 전용.
 * PostgREST embed inner join 제거 — stores 단독 + store_sales_permissions merge (2 RTT).
 */

export const FIND_OWNER_HUB_STORE_SELECT = "id,slug";

export const FIND_OWNER_HUB_STORE_PERMISSIONS_SELECT = "allowed_to_sell,sales_status";

export const FIND_OWNER_HUB_STORE_FILTERS =
  "stores: owner_user_id=:userId; approval_status=approved; is_visible=true; order=created_at.desc; limit=1";

export const FIND_OWNER_HUB_STORE_PERMISSIONS_FILTERS =
  "store_sales_permissions: store_id=:storeId";

/** EXPLAIN·인덱스 후보 메모 — 런타임 변경 없음 */
export const FIND_OWNER_HUB_STORE_INDEX_HINT =
  "stores: owner_user_id + (approval_status,is_visible) filter; store_sales_permissions: store_id PK/FK lookup";

export type FindOwnerHubStoreVia = "memory" | "postgrest" | "skipped_no_sb" | "error" | "empty";

export type FindOwnerHubStoreTiming = {
  find_hub_store_ms: number;
  find_hub_store_query_ms: number;
  /** embed inner join — 별도 RTT 없음(0). 단일 SQL 내 join 구간은 DB에서만 분리 가능 */
  find_hub_store_permission_join_ms: number;
  find_hub_store_rows: number;
  find_hub_store_via: FindOwnerHubStoreVia;
  find_hub_store_cache_hit?: 0 | 1;
  find_hub_store_cache_age_ms?: number;
  find_hub_store_error?: string;
};

export function emptyFindOwnerHubStoreTiming(): FindOwnerHubStoreTiming {
  return {
    find_hub_store_ms: 0,
    find_hub_store_query_ms: 0,
    find_hub_store_permission_join_ms: 0,
    find_hub_store_rows: 0,
    find_hub_store_via: "skipped_no_sb",
    find_hub_store_cache_hit: 0,
  };
}

export function logFindHubStorePerf(timing: FindOwnerHubStoreTiming, userIdShort?: string): void {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console -- hub badge wave1 find_hub_store breakdown
  console.info("[find-hub-store-perf]", {
    user_id_short: userIdShort,
    ...timing,
    select: FIND_OWNER_HUB_STORE_SELECT,
    permissions_select: FIND_OWNER_HUB_STORE_PERMISSIONS_SELECT,
    filters: FIND_OWNER_HUB_STORE_FILTERS,
    permissions_filters: FIND_OWNER_HUB_STORE_PERMISSIONS_FILTERS,
    index_hint: FIND_OWNER_HUB_STORE_INDEX_HINT,
    join_mode: "stores_then_permissions_two_rtt",
  });
}
