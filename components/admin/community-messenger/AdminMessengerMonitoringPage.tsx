"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessengerMonitoringSummary } from "@/lib/community-messenger/monitoring/types";
import {
  MESSENGER_PERF_REFERENCE_BOOTSTRAP_FETCH_CLIENT_MS,
  MESSENGER_PERF_REFERENCE_FRAME_MS,
  MESSENGER_PERF_REFERENCE_P95_MS,
  MESSENGER_PERF_REFERENCE_PREFETCH_RATIOS,
  MESSENGER_PERF_REFERENCE_RATIOS,
  MESSENGER_PERF_REFERENCE_ROOM_OPEN_MS,
  MESSENGER_PERF_THRESHOLDS,
} from "@/lib/community-messenger/monitoring/thresholds";
import { useCmAdminLabels } from "./useCmAdminLabels";

type SummaryResponse = { ok?: boolean; summary?: MessengerMonitoringSummary };

export function AdminMessengerMonitoringPage() {
  const { t, formatDateTime } = useCmAdminLabels();
  const [summary, setSummary] = useState<MessengerMonitoringSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community-messenger/monitoring/summary", { cache: "no-store" });
      const json = (await res.json()) as SummaryResponse;
      if (res.ok && json.ok && json.summary) {
        setSummary(json.summary);
      } else {
        setSummary(null);
        setError(t("admin_cm_err_summary_load_failed"));
      }
    } catch {
      setSummary(null);
      setError(t("admin_cm_err_network"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apiRows = summary ? Object.entries(summary.apiByRoute) : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        titleKey="admin_cm_page_monitoring_title"
        descriptionKey="admin_cm_page_monitoring_desc"
      />

      <AdminCard titleKey="admin_cm_card_thresholds">
        <pre className="overflow-x-auto rounded-ui-rect bg-sam-app p-4 sam-text-helper leading-relaxed text-sam-fg">
          {JSON.stringify(MESSENGER_PERF_THRESHOLDS, null, 2)}
        </pre>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_ref_slo">
        <div className="grid gap-4 md:grid-cols-2">
          <pre className="overflow-x-auto rounded-ui-rect bg-sam-app p-4 sam-text-xxs leading-relaxed text-sam-fg">
            {JSON.stringify(MESSENGER_PERF_REFERENCE_P95_MS, null, 2)}
          </pre>
          <pre className="overflow-x-auto rounded-ui-rect bg-sam-app p-4 sam-text-xxs leading-relaxed text-sam-fg">
            {JSON.stringify(MESSENGER_PERF_REFERENCE_RATIOS, null, 2)}
          </pre>
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_ref_slivers">
        <pre className="overflow-x-auto rounded-ui-rect bg-sam-app p-4 sam-text-xxs leading-relaxed text-sam-fg">
          {JSON.stringify(
            {
              MESSENGER_PERF_REFERENCE_ROOM_OPEN_MS,
              MESSENGER_PERF_REFERENCE_BOOTSTRAP_FETCH_CLIENT_MS,
              MESSENGER_PERF_REFERENCE_FRAME_MS,
              MESSENGER_PERF_REFERENCE_PREFETCH_RATIOS,
            },
            null,
            2
          )}
        </pre>
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_slo_summary">
        {!summary?.sloDigest?.length ? (
          <p className="sam-text-body text-sam-muted">{t("admin_cm_empty_slo_samples")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left sam-text-helper">
              <thead>
                <tr className="border-b border-sam-border">
                  <th className="py-2 pr-2 font-semibold text-sam-fg">{t("admin_cm_th_metric")}</th>
                  <th className="py-2 pr-2 font-semibold text-sam-fg">{t("admin_cm_th_target")}</th>
                  <th className="py-2 pr-2 font-semibold text-sam-fg">{t("admin_cm_th_warning")}</th>
                  <th className="py-2 pr-2 font-semibold text-sam-fg">{t("admin_cm_th_critical")}</th>
                  <th className="py-2 pr-2 font-semibold text-sam-fg">{t("admin_cm_th_avg")}</th>
                  <th className="py-2 pr-2 font-semibold text-sam-fg">{t("admin_cm_th_recent")}</th>
                  <th className="py-2 font-semibold text-sam-fg">n</th>
                </tr>
              </thead>
              <tbody>
                {summary.sloDigest.map((row) => (
                  <tr key={row.id} className="border-b border-sam-border/60">
                    <td className="py-2 pr-2 text-sam-fg">
                      {t(row.labelKey, row.labelVars)}
                    </td>
                    <td className="py-2 pr-2 font-mono sam-text-xxs text-sam-muted">
                      {row.unit === "ratio" ? `${((row.target ?? 0) * 100).toFixed(2)}%` : `${row.target ?? "—"} ms`}
                    </td>
                    <td className="py-2 pr-2 font-mono sam-text-xxs text-sam-muted">
                      {row.unit === "ratio" ? `${((row.warning ?? 0) * 100).toFixed(2)}%` : `${row.warning ?? "—"} ms`}
                    </td>
                    <td className="py-2 pr-2 font-mono sam-text-xxs text-sam-muted">
                      {row.unit === "ratio" ? `${((row.critical ?? 0) * 100).toFixed(2)}%` : `${row.critical ?? "—"} ms`}
                    </td>
                    <td className="py-2 pr-2 font-mono sam-text-xxs text-sam-fg">
                      {row.observedAvg == null
                        ? "—"
                        : row.unit === "ratio"
                          ? `${(row.observedAvg * 100).toFixed(2)}%`
                          : `${row.observedAvg.toFixed(1)} ms`}
                    </td>
                    <td className="py-2 pr-2 font-mono sam-text-xxs text-sam-fg">
                      {row.observedLast == null
                        ? "—"
                        : row.unit === "ratio"
                          ? `${(row.observedLast * 100).toFixed(2)}%`
                          : `${row.observedLast.toFixed(1)} ms`}
                    </td>
                    <td className="py-2 text-sam-fg">{row.sampleCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {summary?.reconnectSessionRate != null ? (
          <p className="mt-3 sam-text-helper text-sam-muted">
            {t("admin_cm_common_reconnect_rate", {
              percent: (summary.reconnectSessionRate * 100).toFixed(2),
            })}
          </p>
        ) : null}
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_outcome_stats">
        {!summary?.outcomeStats?.length ? (
          <p className="sam-text-body text-sam-muted">{t("admin_cm_empty_outcome_events")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left sam-text-helper">
              <thead>
                <tr className="border-b border-sam-border">
                  <th className="py-2 pr-3 font-semibold text-sam-fg">{t("admin_cm_th_key")}</th>
                  <th className="py-2 pr-3 font-semibold text-sam-fg">ok</th>
                  <th className="py-2 pr-3 font-semibold text-sam-fg">fail</th>
                  <th className="py-2 font-semibold text-sam-fg">{t("admin_cm_th_fail_rate")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.outcomeStats.map((o) => (
                  <tr key={o.key} className="border-b border-sam-border/60">
                    <td className="py-2 pr-3 font-mono sam-text-xxs text-sam-muted">{o.key}</td>
                    <td className="py-2 pr-3 text-sam-fg">{o.ok}</td>
                    <td className="py-2 pr-3 text-sam-fg">{o.fail}</td>
                    <td className="py-2 text-sam-fg">{(o.failRate * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_api_routes">
        {loading ? (
          <p className="sam-text-body text-sam-muted">{t("admin_cm_common_loading")}</p>
        ) : error ? (
          <p className="sam-text-body text-red-600">{error}</p>
        ) : apiRows.length === 0 ? (
          <p className="sam-text-body text-sam-muted">{t("admin_cm_empty_api_records")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left sam-text-body-secondary">
              <thead>
                <tr className="border-b border-sam-border">
                  <th className="py-2 pr-3 font-semibold text-sam-fg">{t("admin_cm_th_route")}</th>
                  <th className="py-2 pr-3 font-semibold text-sam-fg">n</th>
                  <th className="py-2 pr-3 font-semibold text-sam-fg">avg ms</th>
                  <th className="py-2 font-semibold text-sam-fg">last ms</th>
                </tr>
              </thead>
              <tbody>
                {apiRows.map(([route, v]) => (
                  <tr key={route} className="border-b border-sam-border/60">
                    <td className="py-2 pr-3 font-mono sam-text-xxs text-sam-muted">{route}</td>
                    <td className="py-2 pr-3 text-sam-fg">{v.count}</td>
                    <td className="py-2 pr-3 text-sam-fg">{v.avgMs.toFixed(1)}</td>
                    <td className="py-2 text-sam-fg">{v.lastMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_recent_alerts">
        {!summary?.recentAlerts?.length ? (
          <p className="sam-text-body text-sam-muted">{t("admin_cm_empty_alerts")}</p>
        ) : (
          <ul className="space-y-2">
            {summary.recentAlerts.slice(0, 20).map((a, i) => (
              <li key={`${a.ts}-${i}`} className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-helper text-sam-fg">
                <span className="text-sam-muted">{formatDateTime(String(a.ts))}</span> — {a.message}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_client_aggregates">
        {!summary?.clientAggregates || Object.keys(summary.clientAggregates).length === 0 ? (
          <p className="sam-text-body text-sam-muted">{t("admin_cm_empty_client_events")}</p>
        ) : (
          <pre className="max-h-[320px] overflow-auto rounded-ui-rect bg-sam-app p-4 sam-text-xxs leading-relaxed text-sam-fg">
            {JSON.stringify(summary.clientAggregates, null, 2)}
          </pre>
        )}
      </AdminCard>

      <AdminCard titleKey="admin_cm_card_all_aggregates">
        {!summary?.aggregates || Object.keys(summary.aggregates).length === 0 ? (
          <p className="sam-text-body text-sam-muted">{t("admin_cm_empty_aggregates")}</p>
        ) : (
          <pre className="max-h-[360px] overflow-auto rounded-ui-rect bg-sam-app p-4 sam-text-xxs leading-relaxed text-sam-fg">
            {JSON.stringify(summary.aggregates, null, 2)}
          </pre>
        )}
      </AdminCard>

      <p className="sam-text-helper text-sam-muted">
        {t("admin_cm_common_generated_at", {
          at: summary?.generatedAt ? formatDateTime(summary.generatedAt) : t("admin_cm_common_dash"),
          count: summary?.windowEvents ?? 0,
        })}
      </p>
    </div>
  );
}
