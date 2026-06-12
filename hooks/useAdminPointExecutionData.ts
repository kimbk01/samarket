"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { PointReclaimPolicy, PointRewardExecution, PointRewardLog } from "@/lib/types/point-execution";

export function useAdminPointExecutionData(refreshKey: number) {
  const [executions, setExecutions] = useState<PointRewardExecution[]>([]);
  const [reclaimPolicies, setReclaimPolicies] = useState<PointReclaimPolicy[]>([]);
  const [rewardLogs, setRewardLogs] = useState<PointRewardLog[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await adminFetch("/api/admin/point-executions", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        executions?: PointRewardExecution[];
        reclaimPolicies?: PointReclaimPolicy[];
        rewardLogs?: PointRewardLog[];
      };
      if (!cancelled && json.ok) {
        setExecutions(json.executions ?? []);
        setReclaimPolicies(json.reclaimPolicies ?? []);
        setRewardLogs(json.rewardLogs ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { executions, reclaimPolicies, rewardLogs };
}
