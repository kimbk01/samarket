"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { BoardPointPolicy, PointEventPolicy, PointProbabilityRule } from "@/lib/types/point-policy";

export type AdminPointPolicyLoadError = { code: string; httpStatus?: number };

/**
 * 포인트 정책 화면 데이터 — 게시판·이벤트 정책 (변경 로그는 화면에서 서버 페이지로 따로 조회).
 * 실패해도 직전 정상 목록은 지우지 않는다 (§8-5). 확률 규칙 로드 실패는 `probabilityError` 로 알린다.
 */
export function useAdminPointPolicyData(refreshKey: number) {
  const [policies, setPolicies] = useState<BoardPointPolicy[]>([]);
  const [eventPolicies, setEventPolicies] = useState<PointEventPolicy[]>([]);
  const [probabilityRules, setProbabilityRules] = useState<PointProbabilityRule[]>([]);
  const [probabilityError, setProbabilityError] = useState<AdminPointPolicyLoadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<AdminPointPolicyLoadError | null>(null);

  const loadProbabilityRules = useCallback(async (policyId: string) => {
    if (!policyId) {
      setProbabilityRules([]);
      setProbabilityError(null);
      return;
    }
    try {
      const res = await adminFetch(
        `/api/admin/point-policies/probability?policyId=${encodeURIComponent(policyId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; rules?: PointProbabilityRule[] };
      if (!res.ok || !json.ok) {
        setProbabilityError({ code: json.error || "load_failed", httpStatus: res.status });
        return;
      }
      setProbabilityRules(json.rules ?? []);
      setProbabilityError(null);
    } catch {
      setProbabilityError({ code: "network_error" });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [boardRes, eventRes] = await Promise.all([
          adminFetch("/api/admin/point-policies/board", { credentials: "include", cache: "no-store" }),
          adminFetch("/api/admin/point-policies/event", { credentials: "include", cache: "no-store" }),
        ]);
        const boardJson = (await boardRes.json().catch(() => ({}))) as { ok?: boolean; error?: string; policies?: BoardPointPolicy[] };
        const eventJson = (await eventRes.json().catch(() => ({}))) as { ok?: boolean; error?: string; policies?: PointEventPolicy[] };
        if (cancelled) return;
        const failed = [
          { res: boardRes, json: boardJson },
          { res: eventRes, json: eventJson },
        ].find((x) => !x.res.ok || !x.json.ok);
        if (failed) {
          const code = failed.json.error;
          setError({ code: typeof code === "string" && code ? code : "load_failed", httpStatus: failed.res.status });
        } else {
          setError(null);
        }
        if (boardJson.ok) setPolicies(boardJson.policies ?? []);
        if (eventJson.ok) setEventPolicies(eventJson.policies ?? []);
        if (!failed) setLoaded(true);
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

  return {
    policies,
    eventPolicies,
    probabilityRules,
    probabilityError,
    loading,
    loaded,
    error,
    loadProbabilityRules,
  };
}
