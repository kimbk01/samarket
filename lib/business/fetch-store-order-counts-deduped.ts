/**

 * GET …/order-counts — 매장 허브 배지 폴링이 겹칠 때 한 요청으로 합침.

 */

import { runDevSafeSingleFlight } from "@/lib/dev/dev-safe-dedupe";

import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";

import { runSingleFlight } from "@/lib/http/run-single-flight";

import { parseOwnerStoreOpsSnapshotFromJson } from "@/lib/stores/owner-store-ops-snapshot";

import {
  trackOwnerDashboardApiDone,
  trackOwnerDashboardApiStart,
} from "@/lib/business/owner-dashboard-waterfall";
import { OWNER_DASHBOARD_API_PRIORITY } from "@/lib/business/owner-dashboard-api-priority";
import {
  peekOwnerHubOrderCountsCache,
  seedOwnerHubOrderCountsCache,
  type OwnerHubOrderCountsSeedInput,
} from "@/lib/stores/owner-hub-order-counts-cache";



export type StoreOrderCountsResult = {

  status: number;

  json: unknown;

};



function seedFromParsed(

  storeId: string,

  parsed: NonNullable<ReturnType<typeof parseOwnerStoreOpsSnapshotFromJson>>

): void {

  const seed: OwnerHubOrderCountsSeedInput = { ...parsed };

  seedOwnerHubOrderCountsCache(storeId, seed);

}



export function fetchStoreOrderCountsDeduped(

  storeId: string,

  opts?: { force?: boolean }

): Promise<StoreOrderCountsResult> {

  const sid = storeId.trim();

  const peek = peekOwnerHubOrderCountsCache(sid);

  if (peek && !opts?.force) {
    trackOwnerDashboardApiStart("order_counts", {
      priority: OWNER_DASHBOARD_API_PRIORITY.order_counts,
      cache_hit: 1,
    });
    trackOwnerDashboardApiDone("order_counts", {
      priority: OWNER_DASHBOARD_API_PRIORITY.order_counts,
      cache_hit: 1,
      client_duration_ms: 0,
    });
    return Promise.resolve({
      status: 200,
      json: peek,
    });
  }

  const task = (): Promise<StoreOrderCountsResult> => {
    trackOwnerDashboardApiStart("order_counts", {
      priority: OWNER_DASHBOARD_API_PRIORITY.order_counts,
      cache_hit: 0,
    });
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    return runSingleFlight(`me:store:${sid}:order-counts`, async (): Promise<StoreOrderCountsResult> => {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/order-counts`, {
        credentials: "include",
        cache: "no-store",
        headers: { "x-samarket-first-paint-blocking": "0" },
      });
      const json: unknown = await res.json().catch(() => ({}));
      const parsed = parseOwnerStoreOpsSnapshotFromJson(json);
      if (res.ok && parsed) {
        seedFromParsed(sid, parsed);
      }
      const clientMs =
        typeof performance !== "undefined" ? Math.round(performance.now() - t0) : null;
      trackOwnerDashboardApiDone("order_counts", {
        priority: OWNER_DASHBOARD_API_PRIORITY.order_counts,
        cache_hit: 0,
        client_duration_ms: clientMs ?? undefined,
      });
      return { status: res.status, json };
    });
  };



  if (!isDevSafeMode() || opts?.force) {

    return task();

  }

  return runDevSafeSingleFlight(`store-order-counts:${sid}`, 10_000, task, {

    force: opts?.force,

    onlyCacheIf: (v) => {

      const r = v as StoreOrderCountsResult;

      const j = r.json as { ok?: boolean } | null | undefined;

      return r.status === 200 && j?.ok === true;

    },

  });

}

