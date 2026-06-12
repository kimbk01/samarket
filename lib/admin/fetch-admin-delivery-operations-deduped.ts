"use client";

import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { ADMIN_QUERY_TTL_MS } from "@/lib/admin/admin-query-ttl";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type AdminDeliveryOperationsStatsResult = {
  status: number;
  json: unknown | null;
};

export function fetchAdminDeliveryOperationsDeduped(days: number): Promise<AdminDeliveryOperationsStatsResult> {
  const d = Math.min(90, Math.max(1, Math.floor(days)));
  const key = `admin:stats:delivery-operations:${d}`;
  const url = `/api/admin/stats/delivery-operations?days=${encodeURIComponent(String(d))}`;
  return runSingleFlight(key, () =>
    adminFetch(url, {
      cache: "no-store",
      dedupeKey: key,
      cacheTtlMs: ADMIN_QUERY_TTL_MS,
    })
  ).then(async (res): Promise<AdminDeliveryOperationsStatsResult> => {
    if (!res.ok) {
      return { status: res.status, json: null };
    }
    const json: unknown = await res.clone().json().catch(() => null);
    return { status: res.status, json };
  });
}
