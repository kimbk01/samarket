"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { BoardPointPolicy, PointEventPolicy, PointPolicyLog, PointProbabilityRule } from "@/lib/types/point-policy";

export function useAdminPointPolicyData(refreshKey: number) {
  const [policies, setPolicies] = useState<BoardPointPolicy[]>([]);
  const [eventPolicies, setEventPolicies] = useState<PointEventPolicy[]>([]);
  const [logs, setLogs] = useState<PointPolicyLog[]>([]);
  const [probabilityRules, setProbabilityRules] = useState<PointProbabilityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; httpStatus?: number } | null>(null);

  const loadProbabilityRules = useCallback(async (policyId: string) => {
    if (!policyId) {
      setProbabilityRules([]);
      return;
    }
    const res = await adminFetch(
      `/api/admin/point-policies/probability?policyId=${encodeURIComponent(policyId)}`,
      { credentials: "include", cache: "no-store" }
    );
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; rules?: PointProbabilityRule[] };
    setProbabilityRules(json.ok ? (json.rules ?? []) : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [boardRes, eventRes, logsRes] = await Promise.all([
          adminFetch("/api/admin/point-policies/board", { credentials: "include", cache: "no-store" }),
          adminFetch("/api/admin/point-policies/event", { credentials: "include", cache: "no-store" }),
          adminFetch("/api/admin/point-policies/logs", { credentials: "include", cache: "no-store" }),
        ]);
        const boardJson = (await boardRes.json().catch(() => ({}))) as { ok?: boolean; policies?: BoardPointPolicy[] };
        const eventJson = (await eventRes.json().catch(() => ({}))) as { ok?: boolean; policies?: PointEventPolicy[] };
        const logsJson = (await logsRes.json().catch(() => ({}))) as { ok?: boolean; logs?: PointPolicyLog[] };
        if (!cancelled) {
          const failed = [
            { res: boardRes, json: boardJson },
            { res: eventRes, json: eventJson },
            { res: logsRes, json: logsJson },
          ].find((x) => !x.res.ok || !x.json.ok);
          if (failed) {
            const code = (failed.json as { error?: string }).error;
            setError({ code: typeof code === "string" && code ? code : "load_failed", httpStatus: failed.res.status });
          }
          setPolicies(boardJson.ok ? (boardJson.policies ?? []) : []);
          setEventPolicies(eventJson.ok ? (eventJson.policies ?? []) : []);
          setLogs(logsJson.ok ? (logsJson.logs ?? []) : []);
        }
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
    logs,
    probabilityRules,
    loading,
    error,
    loadProbabilityRules,
  };
}
