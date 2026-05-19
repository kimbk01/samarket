/**

 * GET …/order-counts — 매장 허브 배지 폴링이 겹칠 때 한 요청으로 합침.

 */

import { runDevSafeSingleFlight } from "@/lib/dev/dev-safe-dedupe";

import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";

import { runSingleFlight } from "@/lib/http/run-single-flight";

import { parseOwnerStoreOpsSnapshotFromJson } from "@/lib/stores/owner-store-ops-snapshot";

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

    return Promise.resolve({

      status: 200,

      json: peek,

    });

  }

  const task = (): Promise<StoreOrderCountsResult> =>

    runSingleFlight(`me:store:${sid}:order-counts`, async (): Promise<StoreOrderCountsResult> => {

      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/order-counts`, {

        credentials: "include",

        cache: "no-store",

      });

      const json: unknown = await res.json().catch(() => ({}));

      const parsed = parseOwnerStoreOpsSnapshotFromJson(json);

      if (res.ok && parsed) {

        seedFromParsed(sid, parsed);

      }

      return { status: res.status, json };

    });



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

