/**
 * 오너용 GET …/api/me/stores/:storeId/orders — 폴링·포커스·수동 새로고침 겹침 시 합류.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type StoreOrdersListResult = {
  status: number;
  json: unknown;
};

export function fetchStoreOrdersListDeduped(storeId: string): Promise<StoreOrdersListResult> {
  const sid = storeId.trim();
  return runSingleFlight(`me:store:${sid}:orders`, async (): Promise<StoreOrdersListResult> => {
    const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/orders`, {
      credentials: "include",
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
