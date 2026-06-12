"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSystemHealth } from "@/lib/system/system-state";
import type { MessageKey } from "@/lib/i18n/messages";
import type { SystemHealthStatus } from "@/lib/types/system";

function statusLabel(t: (key: MessageKey) => string, status: SystemHealthStatus): string {
  if (status === "healthy") return t("admin_system_health_status_healthy");
  if (status === "warning") return t("admin_system_health_status_warning");
  if (status === "critical") return t("admin_system_health_status_critical");
  return status;
}

export function SystemHealthList() {
  const { t } = useI18n();
  const health = useMemo(() => getSystemHealth(), []);

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">{t("admin_system_health_check_title")}</p>
      {health.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_system_health_empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {health.map((h) => (
            <li
              key={h.id}
              className={`flex flex-wrap items-center justify-between rounded-ui-rect border p-3 ${
                h.status === "critical"
                  ? "border-red-200 bg-red-50/30"
                  : h.status === "warning"
                    ? "border-amber-200 bg-amber-50/30"
                    : "border-sam-border bg-sam-surface"
              }`}
            >
              <span className="font-medium text-sam-fg">{h.serviceName}</span>
              <span
                className={`rounded px-1.5 py-0.5 sam-text-helper ${
                  h.status === "healthy"
                    ? "bg-emerald-50 text-emerald-700"
                    : h.status === "warning"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800"
                }`}
              >
                {statusLabel(t, h.status as SystemHealthStatus)}
              </span>
              <span className="w-full sam-text-helper text-sam-muted sm:w-auto">
                {new Date(h.lastCheckedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
