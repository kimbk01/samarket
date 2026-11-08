"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getPerformanceMetrics } from "@/lib/performance/performance-state";
import { AdminTable } from "@/components/admin/AdminTable";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
const SLOW_THRESHOLD_MS = 500;

export function SlowApiTable() {
  const { t } = useI18n();
  const slowItems = useMemo(() => {
    const list = getPerformanceMetrics();
    return list
      .filter((m) => m.apiTime >= SLOW_THRESHOLD_MS || m.loadTime >= SLOW_THRESHOLD_MS)
      .sort((a, b) => b.apiTime - a.apiTime)
      .slice(0, 20);
  }, []);

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">
        {t("admin_performance_slow_api_hint", { ms: SLOW_THRESHOLD_MS })}
      </p>
      {slowItems.length === 0 ? (
        <AdminEmptyState ko message={t("admin_performance_no_slow_api")} />
      ) : (
        <AdminTable headers={[t("admin_performance_th_route"), t("admin_performance_th_load_ms"), "API(ms)", "DB(ms)", t("admin_performance_th_measured_at")]}>
          {slowItems.map((m) => (
            <tr key={m.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{m.route}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{m.loadTime}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{m.apiTime}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{m.dbQueryTime}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(m.createdAt)}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
