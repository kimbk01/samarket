"use client";

/**
 * 관리자 매장 주문 대량 조회 — 가시성 복귀 + interval 이 같은 틱에 겹칠 때 합류.
 */
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { ADMIN_QUERY_TTL_FAST_MS } from "@/lib/admin/admin-query-ttl";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const URL =
  "/api/admin/store-orders?limit=500&include_items=1" as const;

const FLIGHT_KEY = "admin:store-orders:list:500";

export type AdminStoreOrdersFetchResult = {
  status: number;
  json: unknown;
};

export function fetchAdminStoreOrdersListDeduped(): Promise<AdminStoreOrdersFetchResult> {
  return runSingleFlight(FLIGHT_KEY, async (): Promise<AdminStoreOrdersFetchResult> => {
    const res = await adminFetch(URL, {
      credentials: "include",
      cache: "no-store",
      dedupeKey: FLIGHT_KEY,
      cacheTtlMs: ADMIN_QUERY_TTL_FAST_MS,
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
