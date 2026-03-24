/**
 * 관리자 매장 주문 대량 조회 — 가시성 복귀 + interval 이 같은 틱에 겹칠 때 합류.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

const URL =
  "/api/admin/store-orders?limit=500&include_items=1" as const;

export type AdminStoreOrdersFetchResult = {
  status: number;
  json: unknown;
};

export function fetchAdminStoreOrdersListDeduped(): Promise<AdminStoreOrdersFetchResult> {
  return runSingleFlight("admin:store-orders:list:500", async (): Promise<AdminStoreOrdersFetchResult> => {
    const res = await fetch(URL, { credentials: "include", cache: "no-store" });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
