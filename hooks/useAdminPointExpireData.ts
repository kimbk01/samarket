"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { PointExpirePolicy } from "@/lib/types/point-expire";

export type AdminPointExpireLoadError = { code: string; httpStatus?: number };
export type AdminPointExpireSummary = { runCount: number; totalExpired: number };

/**
 * 포인트 소멸 화면 — 정책 + 전체 실행 요약 (실행 이력·로그 목록은 화면에서 `view=executions|logs` 서버 페이지로 따로 조회).
 * 실패해도 직전 정상 값은 지우지 않는다 (§8-5).
 */
export function useAdminPointExpireData(refreshKey: number) {
  const [policies, setPolicies] = useState<PointExpirePolicy[]>([]);
  const [summary, setSummary] = useState<AdminPointExpireSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<AdminPointExpireLoadError | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminFetch("/api/admin/point-expire", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          policies?: PointExpirePolicy[];
          summary?: AdminPointExpireSummary;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError({ code: json.error ?? "load_failed", httpStatus: res.status });
          return;
        }
        setPolicies(json.policies ?? []);
        setSummary(json.summary ?? null);
        setError(null);
        setLoaded(true);
      } catch {
        if (!cancelled) setError({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { policies, summary, loading, loaded, error };
}
