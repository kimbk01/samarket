/**
 * GET …/order-counts — 매장 허브 배지 폴링이 겹칠 때 한 요청으로 합침.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type StoreOrderCountsResult = {
  status: number;
  json: unknown;
};

export function fetchStoreOrderCountsDeduped(storeId: string): Promise<StoreOrderCountsResult> {
  const sid = storeId.trim();
  return runSingleFlight(`me:store:${sid}:order-counts`, async (): Promise<StoreOrderCountsResult> => {
    const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/order-counts`, {
      credentials: "include",
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
