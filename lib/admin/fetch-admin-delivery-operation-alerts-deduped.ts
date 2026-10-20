"use client";

import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { ADMIN_QUERY_TTL_FAST_MS } from "@/lib/admin/admin-query-ttl";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type AdminDeliveryOperationAlertsResult = {
  status: number;
  json: unknown | null;
};

export function fetchAdminDeliveryOperationAlertsDeduped(
  eventStatus: "open" | "all" | "resolved" | "acknowledged" | "muted" = "open",
  assignment: "all" | "mine" | "unassigned" = "all",
  /** R7 서버 페이지 — 있으면 `limit`/`offset` 을 보내고 응답에 `events_total` 이 온다. */
  page?: { limit: number; offset: number }
): Promise<AdminDeliveryOperationAlertsResult> {
  const key = `admin:delivery-operation-alerts:${eventStatus}:${assignment}${page ? `:${page.limit}:${page.offset}` : ""}`;
  const qs = new URLSearchParams({
    event_status: eventStatus,
    assignment,
  });
  if (page) {
    qs.set("limit", String(page.limit));
    qs.set("offset", String(page.offset));
  }
  const url = `/api/admin/delivery-operation-alerts?${qs.toString()}`;
  return runSingleFlight(key, () =>
    adminFetch(url, {
      cache: "no-store",
      dedupeKey: key,
      cacheTtlMs: ADMIN_QUERY_TTL_FAST_MS,
    })
  ).then(async (res): Promise<AdminDeliveryOperationAlertsResult> => {
    if (!res.ok) return { status: res.status, json: null };
    const json: unknown = await res.clone().json().catch(() => null);
    return { status: res.status, json };
  });
}
