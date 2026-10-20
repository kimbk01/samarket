"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getPostReleaseChecks } from "@/lib/dev-sprints/dev-sprints-state";

export function ReleaseReadinessCard() {
  const { t } = useI18n();
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
          ? "border-sam-success/40 bg-sam-success-soft/30"
          : "border-sam-danger/40 bg-sam-danger-soft/50"
      }`}
    >
      <p className="sam-text-helper text-sam-muted">{t("admin_rel_readiness_label")}</p>
      <p
        className={`sam-text-page-title font-semibold ${
          readiness.ready ? "text-sam-success" : "text-sam-danger"
        }`}
      >
        {readiness.ready ? t("admin_rel_readiness_ready") : t("admin_rel_readiness_blocked")}
      </p>
      <p className="mt-1 sam-text-body-secondary text-sam-muted">
        {t("admin_rel_readiness_critical_blocked", { count: readiness.criticalBlockedCount })}
        {readiness.criticalTodoCount > 0
          ? t("admin_rel_readiness_critical_todo", { count: readiness.criticalTodoCount })
          : null}
      </p>
    </div>
  );
}