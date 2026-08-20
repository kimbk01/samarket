"use client";

/**
 * 어드민 상품(게시글) 관리 목록 — page query single-flight.
 */
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { ADMIN_QUERY_TTL_MS } from "@/lib/admin/admin-query-ttl";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type AdminPostsManagementFetchResult = {
  status: number;
  json: unknown;
};

export type AdminPostsManagementListParams = {
  page?: number;
  pageSize?: number;
  status?: string;
  productId?: string;
  title?: string;
  region?: string;
};

export function fetchAdminPostsManagementDeduped(
  params?: AdminPostsManagementListParams
): Promise<AdminPostsManagementFetchResult> {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.pageSize != null) q.set("pageSize", String(params.pageSize));
  if (params?.status) q.set("status", params.status);
  if (params?.productId) q.set("productId", params.productId);
  if (params?.title) q.set("title", params.title);
  if (params?.region) q.set("region", params.region);
  const qs = q.toString();
  const path = qs ? `/api/admin/posts-management?${qs}` : "/api/admin/posts-management";
  const flightKey = `admin:posts-management:list:${qs || "default"}`;

  return runSingleFlight(flightKey, async (): Promise<AdminPostsManagementFetchResult> => {
    const res = await adminFetch(path, {
      cache: "no-store",
      credentials: "include",
      dedupeKey: flightKey,
      cacheTtlMs: ADMIN_QUERY_TTL_MS,
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
