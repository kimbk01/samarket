/**
 * 오너용 GET …/api/me/stores/:storeId/orders — 폴링·포커스·수동 새로고침 겹침 시 합류.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  peekOwnerHubDashboardOrdersCache,
  seedOwnerHubDashboardOrdersCacheFromListJson,
} from "@/lib/stores/owner-hub-dashboard-orders-cache";

export type StoreOrdersListResult = {
  status: number;
  json: unknown;
};

export function fetchStoreOrdersListDeduped(
  storeId: string,
  opts?: { forceNetwork?: boolean }
): Promise<StoreOrdersListResult> {
  const sid = storeId.trim();
  const peek = opts?.forceNetwork ? null : peekOwnerHubDashboardOrdersCache(sid);
  if (peek) {
    return Promise.resolve({
      status: 200,
      json: {
        ok: true,
        orders: peek.orders,
        meta: {
          pending_accept_count: peek.meta.pending_accept_count,
          refund_requested_count: peek.meta.refund_requested_count,
          pending_delivery_count: peek.meta.pending_delivery_count,
        },
      },
    });
  }
  return runSingleFlight(`me:store:${sid}:orders`, async (): Promise<StoreOrdersListResult> => {
    const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/orders`, {
      credentials: "include",
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (res.ok) {
      seedOwnerHubDashboardOrdersCacheFromListJson(sid, json);
    }
    return { status: res.status, json };
  });
}
