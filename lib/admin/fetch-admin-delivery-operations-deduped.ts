"use client";

import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { ADMIN_QUERY_TTL_MS } from "@/lib/admin/admin-query-ttl";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type AdminDeliveryOperationsStatsResult = {
  status: number;
  json: unknown | null;
};

/** S-12 / DB-2 — `includeTest` = 「테스트 포함 보기」 (기본 false = 실매장만). */
export function adminDeliveryOperationsStatsCacheKey(days: number, includeTest = false): string {
  const d = Math.min(90, Math.max(1, Math.floor(days)));
  return `admin:stats:delivery-operations:${d}${includeTest ? ":include_test" : ""}`;
}

export function fetchAdminDeliveryOperationsDeduped(
  days: number,
  includeTest = false
): Promise<AdminDeliveryOperationsStatsResult> {
  const d = Math.min(90, Math.max(1, Math.floor(days)));
  const key = adminDeliveryOperationsStatsCacheKey(d, includeTest);
  const url = `/api/admin/stats/delivery-operations?days=${encodeURIComponent(String(d))}${
    includeTest ? "&include_test=1" : ""
  }`;
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
