"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { PointExpireExecution, PointExpireLog, PointExpirePolicy } from "@/lib/types/point-expire";

export type AdminPointExpireLoadError = { code: string; httpStatus?: number };

export function useAdminPointExpireData(refreshKey: number) {
  const [policies, setPolicies] = useState<PointExpirePolicy[]>([]);
  const [executions, setExecutions] = useState<PointExpireExecution[]>([]);
  const [logs, setLogs] = useState<PointExpireLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminPointExpireLoadError | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminFetch("/api/admin/point-expire", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          policies?: PointExpirePolicy[];
          executions?: PointExpireExecution[];
          logs?: PointExpireLog[];
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError({ code: json.error ?? "load_failed", httpStatus: res.status });
          return;
        }
        setPolicies(json.policies ?? []);
        setExecutions(json.executions ?? []);
        setLogs(json.logs ?? []);
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

  return { policies, executions, logs, loading, error };
}
