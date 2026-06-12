"use client";

/**
 * 어드민 상품(게시글) 관리 목록 — 5초 폴링 등 동시 호출 합류.
 */
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { ADMIN_QUERY_TTL_MS } from "@/lib/admin/admin-query-ttl";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const FLIGHT_KEY = "admin:posts-management:list";

export type AdminPostsManagementFetchResult = {
  status: number;
  json: unknown;
};

export function fetchAdminPostsManagementDeduped(): Promise<AdminPostsManagementFetchResult> {
  return runSingleFlight(FLIGHT_KEY, async (): Promise<AdminPostsManagementFetchResult> => {
    const res = await adminFetch("/api/admin/posts-management", {
      cache: "no-store",
      credentials: "include",
      dedupeKey: FLIGHT_KEY,
      cacheTtlMs: ADMIN_QUERY_TTL_MS,
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
