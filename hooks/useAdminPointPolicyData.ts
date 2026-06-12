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
          setPolicies(boardJson.ok ? (boardJson.policies ?? []) : []);
          setEventPolicies(eventJson.ok ? (eventJson.policies ?? []) : []);
          setLogs(logsJson.ok ? (logsJson.logs ?? []) : []);
        }
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
    loadProbabilityRules,
  };
}
