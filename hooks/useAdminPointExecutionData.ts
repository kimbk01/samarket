"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { PointReclaimPolicy, PointRewardExecution } from "@/lib/types/point-execution";

export type AdminPointExecutionLoadError = { code: string; httpStatus?: number };

/**
 * 포인트 실행 화면 데이터 — 실행 이력은 서버 페이지네이션(`limit`/`offset` + 필터, 정확한 `total`).
 * `apiQueryString` 은 `useAdminListQuery().apiQueryString` (limit·offset·status·boardKey·actionType·userId).
 * 보상 로그 탭은 `view=logs` 로 따로 페이지 조회한다 (`AdminPointExecutionPage`).
 * 실패해도 직전 정상 목록은 지우지 않는다 (§8-5).
 */
export function useAdminPointExecutionData(refreshKey: string | number, apiQueryString: string) {
  const [executions, setExecutions] = useState<PointRewardExecution[]>([]);
  const [total, setTotal] = useState(0);
  const [reclaimPolicies, setReclaimPolicies] = useState<PointReclaimPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<AdminPointExecutionLoadError | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminFetch(`/api/admin/point-executions?${apiQueryString}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          executions?: PointRewardExecution[];
          total?: number;
          reclaimPolicies?: PointReclaimPolicy[];
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError({ code: json.error ?? "load_failed", httpStatus: res.status });
          return;
        }
        const rows = json.executions ?? [];
        setExecutions(rows);
        setTotal(typeof json.total === "number" ? json.total : rows.length);
        setReclaimPolicies(json.reclaimPolicies ?? []);
        setError(null);
        setLoaded(true);
      } catch {
        if (!cancelled) {
          setError({ code: "network_error" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, apiQueryString]);

  return { executions, total, reclaimPolicies, loading, loaded, error };
}
