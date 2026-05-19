/**
 * GET …/order-counts — 매장 허브 배지 폴링이 겹칠 때 한 요청으로 합침.
 */
import { runDevSafeSingleFlight } from "@/lib/dev/dev-safe-dedupe";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  peekOwnerHubOrderCountsCache,
  seedOwnerHubOrderCountsCache,
} from "@/lib/stores/owner-hub-order-counts-cache";

export type StoreOrderCountsResult = {
  status: number;
  json: unknown;
};

export function fetchStoreOrderCountsDeduped(
  storeId: string,
  opts?: { force?: boolean }
): Promise<StoreOrderCountsResult> {
  const sid = storeId.trim();
  const peek = peekOwnerHubOrderCountsCache(sid);
  if (peek && !opts?.force) {
    return Promise.resolve({
      status: 200,
      json: {
        ok: true,
        pending_accept_count: peek.pending_accept_count,
        refund_requested_count: peek.refund_requested_count,
        pending_delivery_count: peek.pending_delivery_count,
      },
    });
  }
  const task = (): Promise<StoreOrderCountsResult> =>
    runSingleFlight(`me:store:${sid}:order-counts`, async (): Promise<StoreOrderCountsResult> => {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/order-counts`, {
        credentials: "include",
        cache: "no-store",
      });
      const json: unknown = await res.json().catch(() => ({}));
      const body = json as {
        ok?: boolean;
        pending_accept_count?: unknown;
        refund_requested_count?: unknown;
        pending_delivery_count?: unknown;
      };
      if (res.ok && body?.ok) {
        seedOwnerHubOrderCountsCache(sid, {
          pending_accept_count: Math.max(0, Math.floor(Number(body.pending_accept_count) || 0)),
          refund_requested_count: Math.max(0, Math.floor(Number(body.refund_requested_count) || 0)),
          pending_delivery_count: Math.max(0, Math.floor(Number(body.pending_delivery_count) || 0)),
        });
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
