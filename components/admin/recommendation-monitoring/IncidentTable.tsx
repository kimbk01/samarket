"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { IncidentStatus } from "@/lib/types/recommendation-monitoring";
import {
  getRecommendationIncidents,
  acknowledgeIncident,
  resolveIncident,
} from "@/lib/recommendation-ops/recommendation-runtime-state";
import { persistRecommendationRuntimeToServer } from "@/lib/recommendation-ops/recommendation-runtime-sync-client";
import {
  recIncidentStatusLabel,
  recIncidentTypeLabel,
  recSeverityLabel,
  recSurfaceLabel,
} from "@/components/admin/recommendation-admin-i18n";

const ADMIN_ID = "admin1";

export function IncidentTable() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "">("");
  const [surfaceFilter, setSurfaceFilter] = useState<RecommendationSurface | "">("");

  const incidents = useMemo(
    () =>
      getRecommendationIncidents({
        status: statusFilter || undefined,
        surface: surfaceFilter || undefined,
      }),
    [refresh, statusFilter, surfaceFilter]
  );

  const handleAck = async (id: string) => {
    acknowledgeIncident(id, ADMIN_ID, t("admin_rec_admin_nickname"));
    setRefresh((r) => r + 1);
    const r = await persistRecommendationRuntimeToServer();
    if (!r.ok) console.warn("[incident] persist failed", r.error);
  };

  const handleResolve = async (id: string) => {
    resolveIncident(id);
    setRefresh((r) => r + 1);
    const r = await persistRecommendationRuntimeToServer();
    if (!r.ok) console.warn("[incident] persist failed", r.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value === "" ? "" : (e.target.value as IncidentStatus)
            )
          }
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">{t("admin_rec_filter_all_status")}</option>
          <option value="open">{t("admin_rec_incident_status_open")}</option>
          <option value="acknowledged">{t("admin_rec_incident_status_acknowledged")}</option>
          <option value="resolved">{t("admin_rec_incident_status_resolved")}</option>
        </select>
        <select
          value={surfaceFilter}
          onChange={(e) =>
            setSurfaceFilter(
              e.target.value === "" ? "" : (e.target.value as RecommendationSurface)
            )
          }
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">{t("admin_rec_filter_all_surface")}</option>
          <option value="home">{t("admin_rec_surface_home")}</option>
          <option value="search">{t("admin_rec_surface_search")}</option>
          <option value="shop">{t("admin_rec_surface_shop")}</option>
        </select>
      </div>
      {incidents.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rec_mon_empty_incidents")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_title")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_surface")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_type_severity")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_status")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_occurred")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">
                    {i.title}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {recSurfaceLabel(t, i.surface)}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {recIncidentTypeLabel(t, i.incidentType)} /{" "}
                    {recSeverityLabel(t, i.severity)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                        i.status === "resolved"
                          ? "bg-emerald-50 text-emerald-800"
                          : i.status === "acknowledged"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-sam-surface-muted text-sam-fg"
                      }`}
                    >
                      {recIncidentStatusLabel(t, i.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {new Date(i.startedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    {i.status === "open" && (
                      <button
                        type="button"
                        onClick={() => handleAck(i.id)}
                        className="mr-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 sam-text-body-secondary text-amber-800"
                      >
                        {t("common_confirm")}
                      </button>
                    )}
                    {(i.status === "open" || i.status === "acknowledged") && (
                      <button
                        type="button"
                        onClick={() => handleResolve(i.id)}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 sam-text-body-secondary text-emerald-800"
                      >
                        {t("admin_rec_incident_btn_resolve")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
