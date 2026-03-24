/**
 * 관리자 매장 주문 목록(필터 쿼리별) — visibility + interval + 수동 새로고침이 같은 틱에 겹칠 때 합류.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type AdminStoreOrdersQueryResult = {
  status: number;
  json: unknown;
};

export function fetchAdminStoreOrdersQueryDeduped(queryString: string): Promise<AdminStoreOrdersQueryResult> {
  const qs = queryString.trim();
  const key = `admin:store-orders:query:${qs || "_"}`;
  return runSingleFlight(key, async (): Promise<AdminStoreOrdersQueryResult> => {
    const url = `/api/admin/store-orders${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
