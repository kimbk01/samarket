/**
 * 어드민 상품(게시글) 관리 목록 — 5초 폴링 등 동시 호출 합류.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type AdminPostsManagementFetchResult = {
  status: number;
  json: unknown;
};

export function fetchAdminPostsManagementDeduped(): Promise<AdminPostsManagementFetchResult> {
  return runSingleFlight("admin:posts-management:list", async (): Promise<AdminPostsManagementFetchResult> => {
    const res = await fetch("/api/admin/posts-management", { cache: "no-store" });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
