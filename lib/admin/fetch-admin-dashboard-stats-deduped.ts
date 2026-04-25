/**
 * 관리자 대시보드 집계 — Strict Mode 이중 마운트·빠른 재진입 시 중복 fetch 합류.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type AdminDashboardStatsResult = {
  status: number;
  json: unknown | null;
};

export function fetchAdminDashboardStatsDeduped(): Promise<AdminDashboardStatsResult> {
  return runSingleFlight("admin:stats:dashboard", () =>
    fetch("/api/admin/stats/dashboard", { cache: "no-store" })
  ).then(async (res): Promise<AdminDashboardStatsResult> => {
    if (!res.ok) {
      return { status: res.status, json: null };
    }
    const json: unknown = await res.clone().json().catch(() => null);
    return { status: res.status, json };
  });
}
