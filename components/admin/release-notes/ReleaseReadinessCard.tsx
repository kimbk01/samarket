"use client";

import { useMemo } from "react";
import { getPostReleaseChecks } from "@/lib/dev-sprints/mock-post-release-checks";

export function ReleaseReadinessCard() {
  const readiness = useMemo(() => {
    const checks = getPostReleaseChecks();
    const criticalBlocked = checks.filter(
      (c) => c.priority === "critical" && c.status === "blocked"
    );
    const criticalTodo = checks.filter(
      (c) => c.priority === "critical" && (c.status === "todo" || c.status === "in_progress")
    );
    const ready = criticalBlocked.length === 0;
    return {
      ready,
      criticalBlockedCount: criticalBlocked.length,
      criticalTodoCount: criticalTodo.length,
    };
  }, []);

  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        readiness.ready
          ? "border-emerald-200 bg-emerald-50/30"
          : "border-red-200 bg-red-50/50"
      }`}
    >
      <p className="text-[12px] text-sam-muted">릴리즈 준비 상태</p>
      <p
        className={`text-[20px] font-semibold ${
          readiness.ready ? "text-emerald-700" : "text-red-700"
        }`}
      >
        {readiness.ready ? "준비됨" : "critical 블로킹 있음"}
      </p>
      <p className="mt-1 text-[13px] text-sam-muted">
        critical 블로킹 {readiness.criticalBlockedCount}건
        {readiness.criticalTodoCount > 0 &&
          ` · critical 미완료 ${readiness.criticalTodoCount}건`}
      </p>
    </div>
  );
}
