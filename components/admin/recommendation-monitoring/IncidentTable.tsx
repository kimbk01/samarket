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
import { commitRecommendationRuntimeChange } from "@/lib/recommendation-ops/recommendation-runtime-sync-client";
import { AdminEmptyState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { RecommendationFilterSelect } from "@/components/admin/recommendation-admin-filter-select";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import {
  recIncidentStatusLabel,
  recIncidentTypeLabel,
  recSeverityLabel,
  recSurfaceLabel,
} from "@/components/admin/recommendation-admin-i18n";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

const ADMIN_ID = "admin1";
const INCIDENT_STATUSES: readonly IncidentStatus[] = ["open", "acknowledged", "resolved"];
const INCIDENT_SURFACES: readonly RecommendationSurface[] = ["home", "search", "shop"];

export function IncidentTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: false; code: string } | null>(null);
  /** 필터 — 주소 `?status=`·`?surface=` 보존 (R7) */
  const lq = useAdminListQuery<"surface">({ statuses: INCIDENT_STATUSES, extras: ["surface"] });
  const statusFilter = lq.query.status as IncidentStatus | "";
  const surfaceFilter = (INCIDENT_SURFACES as readonly string[]).includes(lq.query.extras.surface)
    ? (lq.query.extras.surface as RecommendationSurface)
    : "";

  const incidents = useMemo(
    () =>
      getRecommendationIncidents({
        status: statusFilter || undefined,
        surface: surfaceFilter || undefined,
      }),
    [refresh, statusFilter, surfaceFilter]
  );

  /** 저장 실패 → 장애 상태 되돌림 + 실패 문구 (예전: console.warn 만). */
  const commit = async (mutate: () => void) => {
    setBusy(true);
    const r = await commitRecommendationRuntimeChange(mutate);
    setBusy(false);
    setSaveResult(r.ok ? null : { ok: false, code: r.error ?? "save_failed" });
    setRefresh((n) => n + 1);
  };

  const handleAck = (id: string) =>
    commit(() => acknowledgeIncident(id, ADMIN_ID, t("admin_rec_admin_nickname")));

  const handleResolve = (id: string) => commit(() => resolveIncident(id));

  return (
    <div className="space-y-4">
      <AdminResultBanner ko={ko} result={saveResult} onClose={() => setSaveResult(null)} />
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
        status={{
          value: statusFilter,
          onChange: lq.setStatus,
          label: t("admin_rec_th_status"),
          options: [
            { value: "", label: t("admin_rec_filter_all_status") },
            { value: "open", label: t("admin_rec_incident_status_open") },
            { value: "acknowledged", label: t("admin_rec_incident_status_acknowledged") },
            { value: "resolved", label: t("admin_rec_incident_status_resolved") },
          ],
        }}
      >
        <RecommendationFilterSelect
          label={t("admin_rec_th_surface")}
          value={surfaceFilter}
          allLabel={t("admin_rec_filter_all_surface")}
          options={[
            { value: "home", label: t("admin_rec_surface_home") },
            { value: "search", label: t("admin_rec_surface_search") },
            { value: "shop", label: t("admin_rec_surface_shop") },
          ]}
          onChange={(v) => lq.setExtra("surface", v)}
          name="surface"
        />
      </AdminFilterBar>
      {incidents.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={statusFilter || surfaceFilter ? undefined : t("admin_rec_mon_empty_incidents")}
          onReset={statusFilter || surfaceFilter ? lq.reset : undefined}
        />
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
                          ? "bg-sam-success-soft text-sam-success"
                          : i.status === "acknowledged"
                            ? "bg-sam-warning-soft text-sam-warning"
                            : "bg-sam-surface-muted text-sam-fg"
                      }`}
                    >
                      {recIncidentStatusLabel(t, i.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {formatAdminManilaDateTime(i.startedAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    {i.status === "open" && (
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAck(i.id)}
                      >
                        {t("common_confirm")}
                      </AdminActionButton>
                    )}
                    {(i.status === "open" || i.status === "acknowledged") && (
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void handleResolve(i.id)}
                      >
                        {t("admin_rec_incident_btn_resolve")}
                      </AdminActionButton>
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
