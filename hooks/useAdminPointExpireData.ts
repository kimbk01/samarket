"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { PointExpireExecution, PointExpireLog, PointExpirePolicy } from "@/lib/types/point-expire";

export function useAdminPointExpireData(refreshKey: number) {
  const [policies, setPolicies] = useState<PointExpirePolicy[]>([]);
  const [executions, setExecutions] = useState<PointExpireExecution[]>([]);
  const [logs, setLogs] = useState<PointExpireLog[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await adminFetch("/api/admin/point-expire", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        policies?: PointExpirePolicy[];
        executions?: PointExpireExecution[];
        logs?: PointExpireLog[];
      };
      if (!cancelled && json.ok) {
        setPolicies(json.policies ?? []);
        setExecutions(json.executions ?? []);
        setLogs(json.logs ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { policies, executions, logs };
}
